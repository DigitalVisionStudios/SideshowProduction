(function () {
  "use strict";
  if (window.SideshowPromo) { window.SideshowPromo.init(document); return; }
  var instances = new Map();
  function focus(element) { if (element && element.isConnected) { try { element.focus({preventScroll:true}); } catch (error) { element.focus(); } } }
  function seen(state) { try { return window.sessionStorage.getItem(state.key) === "1"; } catch (error) { return state.shown; } }
  function record(state) { state.shown=true; try { window.sessionStorage.setItem(state.key,"1"); } catch (error) { /* Session memory is sufficient when storage is unavailable. */ } }
  function announce(open) { document.dispatchEvent(new CustomEvent("sideshow:overlaychange",{detail:{open:open}})); }
  function close(state,restore) {
    if (!state.dialog.open) return;
    state.restore = restore !== false;
    state.dialog.close();
  }
  function checkTime(state) {
    window.clearTimeout(state.expiryTimer);
    var now=Date.now();
    var expired=Number.isFinite(state.expires) && state.expires<=now;
    if (expired) {
      window.clearTimeout(state.autoTimer);
      close(state,false);
      state.root.hidden=true;
      return false;
    }
    var bookings=state.dialog.querySelector("[data-promo-booking]");
    var closed=state.dialog.querySelector("[data-promo-booking-closed]");
    var cutoff=Number.isFinite(state.cutoff) && state.cutoff<=now;
    if (bookings) bookings.hidden=cutoff;
    if (closed) closed.hidden=!cutoff;
    var upcoming=[state.expires,state.cutoff].filter(function (date) {return Number.isFinite(date) && date>now;});
    if (upcoming.length) state.expiryTimer=window.setTimeout(function () {checkTime(state);},Math.min(Math.min.apply(Math,upcoming)-now+50,2147483647));
    return true;
  }
  function open(state,automatic) {
    if (!checkTime(state) || state.dialog.open || typeof state.dialog.showModal!=="function") return false;
    if (document.hidden || document.querySelector("dialog[open]") || document.body.classList.contains("sp-menu-open")) return false;
    if (automatic && (seen(state) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) return false;
    state.opener=document.activeElement;
    state.restore=true;
    try {state.dialog.showModal();} catch (error) {return false;}
    document.body.classList.add("sp-promo-open");
    record(state);
    announce(true);
    focus(state.dialog.querySelector("[data-promo-close]"));
    return true;
  }
  function scheduleAuto(state,delay) {
    window.clearTimeout(state.autoTimer);
    if (!state.automatic || seen(state) || Date.now()-state.initialized>90000) return;
    state.autoTimer=window.setTimeout(function () {
      if (!open(state,true) && !seen(state) && state.root.isConnected) scheduleAuto(state,2000);
    },delay);
  }
  function setup(root) {
    if (instances.has(root)) return;
    var dialog=root.querySelector("[data-promo-dialog]");
    if (!dialog || typeof dialog.showModal!=="function") return;
    var marker=document.createComment("Sideshow event popup");
    dialog.before(marker);
    document.body.appendChild(dialog);
    var state={root:root,dialog:dialog,marker:marker,expires:Date.parse(root.dataset.expires),cutoff:Date.parse(root.dataset.bookingCloses),key:"sp-event:"+root.dataset.campaign,shown:false,restore:true,opener:null,autoTimer:null,expiryTimer:null,initialized:Date.now(),automatic:root.dataset.autoPopup==="true" && !(window.Shopify&&window.Shopify.designMode),controller:new AbortController()};
    instances.set(root,state);
    var options={signal:state.controller.signal};
    root.querySelectorAll("[data-promo-open]").forEach(function (button) {button.addEventListener("click",function(event){if(open(state,false))event.preventDefault();},options);});
    dialog.querySelector("[data-promo-close]").addEventListener("click",function(){close(state,true);},options);
    dialog.addEventListener("cancel",function(event){event.preventDefault();close(state,true);},options);
    dialog.addEventListener("click",function(event){
      if(event.target!==dialog)return;
      var bounds=dialog.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close(state,true);
    },options);
    dialog.addEventListener("close",function(){document.body.classList.remove("sp-promo-open");announce(false);if(state.restore)focus(state.opener);state.opener=null;},options);
    if(checkTime(state))scheduleAuto(state,Math.max(5000,Number(root.dataset.popupDelay)||12000));
  }
  function init(scope) {if(scope.matches&&scope.matches("[data-sp-promo]"))setup(scope);scope.querySelectorAll("[data-sp-promo]").forEach(setup);}
  document.addEventListener("visibilitychange",function(){if(!document.hidden)instances.forEach(function(state){checkTime(state);scheduleAuto(state,3000);});});
  window.addEventListener("pagehide",function(){instances.forEach(function(state){close(state,false);window.clearTimeout(state.autoTimer);});});
  document.addEventListener("shopify:section:load",function(event){init(event.target);});
  document.addEventListener("shopify:section:unload",function(event){instances.forEach(function(state,root){if(!event.target.contains(root))return;close(state,false);window.clearTimeout(state.autoTimer);window.clearTimeout(state.expiryTimer);document.body.classList.remove("sp-promo-open");state.controller.abort();state.dialog.remove();state.marker.remove();instances.delete(root);announce(!!document.querySelector("dialog[open]") || document.body.classList.contains("sp-menu-open"));});});
  window.SideshowPromo={init:init};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){init(document);},{once:true});else init(document);
})();
