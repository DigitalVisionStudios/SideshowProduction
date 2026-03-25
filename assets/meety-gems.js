(function(){
  const LOG_PREFIX = '[MeetyGiftDebug]';

  const TOOTH_GEMS_VARIANT_RULES = [
    { style:'single',  placement:'upper-front', keywords:['single','upper'] },
    { style:'single',  placement:'lower-front', keywords:['single','lower'] },
    { style:'single',  placement:'canine',      keywords:['single','canine'] },
    { style:'single',  placement:'custom',      keywords:['single'] },
    { style:'pair',    placement:'upper-front', keywords:['pair','upper'] },
    { style:'pair',    placement:'lower-front', keywords:['pair','lower'] },
    { style:'pair',    placement:'canine',      keywords:['pair','canine'] },
    { style:'pair',    placement:'custom',      keywords:['pair'] },
    { style:'cluster', placement:'upper-front', keywords:['cluster','upper'] },
    { style:'cluster', placement:'lower-front', keywords:['cluster','lower'] },
    { style:'cluster', placement:'canine',      keywords:['cluster','canine'] },
    { style:'cluster', placement:'custom',      keywords:['cluster'] }
  ];

  async function fetchGiftProduct(handle){
    if(!handle) return null;
    try {
      const r = await fetch(`/products/${handle}.js`);
      if(!r.ok) throw new Error('gift product fetch failed ' + r.status);
      return await r.json();
    } catch(e){ console.warn(LOG_PREFIX,'fetchGiftProduct error', e); return null; }
  }

  function findToothGemVariant(variants, style, placement){
    if(!Array.isArray(variants) || !variants.length) return null;
    const titleNorm = v => (v.title||'').toLowerCase();
    const rule = TOOTH_GEMS_VARIANT_RULES.find(r => r.style===style && r.placement===placement);
    if(rule){
      const kw = rule.keywords.map(k=>k.toLowerCase());
      const hit = variants.find(v => kw.every(k => titleNorm(v).includes(k)));
      if(hit) return hit;
    }
    const styleHit = variants.find(v => titleNorm(v).includes((style||'').replace(/-/g,' ')));
    if(styleHit) return styleHit;
    if(style === 'cluster'){
      const clusterHit = variants.find(v => /cluster|set|multi/.test(titleNorm(v)));
      if(clusterHit) return clusterHit;
    }
    return [...variants].sort((a,b)=> (b.price||0) - (a.price||0))[0] || null;
  }

  async function ensureToothGemVariantMapping(st, btn){
    if(!st || !st.giftGems || st.giftGems.variantId) return;
    const giftHandle = btn.getAttribute('data-gift-gems-product-handle');
    const bogoHandle = btn.getAttribute('data-bogo-product-handle');
    const handle = giftHandle || bogoHandle;
    if(!handle){ console.warn(LOG_PREFIX,'No handle for tooth gems gift variant mapping'); return; }
    if(!st._giftGemsProduct || st._giftGemsProduct.handle !== handle){ st._giftGemsProduct = await fetchGiftProduct(handle); }
    const variants = (st._giftGemsProduct?.variants||[]).filter(v=>v.available!==false);
    if(!variants.length){ console.warn(LOG_PREFIX,'No variants available on gift product for tooth gems'); return; }
    const match = findToothGemVariant(variants, st.giftGems.style, st.giftGems.placement);
    if(match){ st.giftGems.variantId = match.id; st.giftGems.variantTitle = match.title; console.log(LOG_PREFIX,'Mapped tooth gem gift selection to variant', match.id, match.title); }
    else { console.warn(LOG_PREFIX,'Failed to match tooth gem variant; leaving undefined'); }
  }

  function modifyCalendarVariant(baseCalendar, variantId){
    if(!baseCalendar || !variantId) return baseCalendar;
    try { return { ...baseCalendar, variantId: String(variantId) }; }
    catch(e){ console.warn(LOG_PREFIX,'modifyCalendarVariant error', e); return baseCalendar; }
  }

  window.MeetyGems = {
    TOOTH_GEMS_VARIANT_RULES,
    fetchGiftProduct,
    findToothGemVariant,
    ensureToothGemVariantMapping,
    modifyCalendarVariant
  };
})();