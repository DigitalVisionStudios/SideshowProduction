/* Original atmosphere with local appearance preferences and a lazy Lottie player. */
(function () {
  "use strict";
  if (window.SideshowAppearance) { window.SideshowAppearance.init(document); return; }
  var instance = null;
  var playerPromise = null;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var storageKey = "sideshow:appearance:v1";
  var backgroundKeys = ["motion", "artwork", "fades"];
  var keys = backgroundKeys.concat(["exaggerated"]);
  var presets = {clean:{motion:false,artwork:false,fades:true},studio:{motion:true,artwork:true,fades:true}};

  function loadPlayer(url) {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (!playerPromise) playerPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url;
      script.async = true;
      function failed() { script.remove(); reject(new Error("Player unavailable")); }
      script.onload = function () { if (window.lottie) resolve(window.lottie); else failed(); };
      script.onerror = failed;
      document.head.appendChild(script);
    }).catch(function (error) {
      playerPromise = null;
      throw error;
    });
    return playerPromise;
  }
  function exposed(state) {
    var hero = document.querySelector("[data-sp-hero-deck]");
    return !hero || hero.getBoundingClientRect().bottom < window.innerHeight * .72;
  }
  function mayPlay(state) {
    return !state.destroyed && state.preferences.motion && !reduced.matches && !document.hidden && !state.overlay && exposed(state);
  }
  function updateMotion(state) {
    var play = mayPlay(state);
    if (state.animation) {
      if (play && state.ready) state.animation.play();
      else state.animation.pause();
      return;
    }
    if (!play || state.loading || state.failed) return;
    state.loading = true;
    loadPlayer(state.root.dataset.playerUrl).then(function (player) {
      if (state.destroyed) return;
      state.animation = player.loadAnimation({
        container: state.root.querySelector("[data-atmosphere-animation]"),
        renderer: "svg", loop: false, autoplay: false,
        path: state.root.dataset.motionUrl,
        rendererSettings: { preserveAspectRatio: "xMidYMid slice", progressiveLoad: true }
      });
      state.animation.addEventListener("DOMLoaded", function () {
        if (state.destroyed) return;
        state.ready = true;
        state.loading = false;
        state.animation.setSubframe(false);
        state.root.querySelector("[data-atmosphere-motion]").classList.add("is-loaded");
        state.root.dataset.animationState = "ready";
        updateMotion(state);
      });
      state.animation.addEventListener("complete", function () {
        if (state.destroyed) return;
        state.direction *= -1;
        state.animation.setDirection(state.direction);
        if (mayPlay(state)) state.animation.play();
      });
      state.animation.addEventListener("data_failed", function () {
        if (state.destroyed) return;
        state.failed = true;
        state.loading = false;
        state.root.dataset.animationState = "unavailable";
      });
      updateMotion(state);
    }).catch(function () { if (!state.destroyed) {state.failed = true; state.loading = false; state.root.dataset.animationState = "unavailable";} });
  }
  function persist(state) { try { localStorage.setItem(storageKey, JSON.stringify(state.preferences)); } catch (error) { /* Keep the selection for this page if storage is unavailable. */ } }
  function render(state, save) {
    var preferences = state.preferences;
    if (save && preferences.motion && state.failed) {
      if (state.animation) state.animation.destroy();
      state.animation = null;
      state.failed = false;
      state.ready = false;
      state.loading = false;
      state.direction = 1;
      state.root.querySelector("[data-atmosphere-motion]").classList.remove("is-loaded");
      delete state.root.dataset.animationState;
    }
    keys.forEach(function (key) { document.body.dataset["sp" + key[0].toUpperCase() + key.slice(1)] = preferences[key] ? "on" : "off"; });
    document.body.dataset.spBackground = preferences.motion || preferences.artwork ? "on" : "off";
    if (preferences.artwork) {
      var image = state.root.querySelector("[data-artwork-src]");
      if (image && !image.hasAttribute("src")) image.src = image.dataset.artworkSrc;
    }
    state.root.querySelectorAll("[data-appearance-option]").forEach(function (input) { input.checked = preferences[input.dataset.appearanceOption]; });
    state.root.querySelectorAll("[data-appearance-preset]").forEach(function (button) {
      var preset = presets[button.dataset.appearancePreset];
      var selected = Boolean(preset) && backgroundKeys.every(function (key) { return preferences[key] === preset[key]; });
      button.setAttribute("aria-pressed", String(selected));
    });
    if (save) persist(state);
    updateMotion(state);
  }
  function setOpen(state, open, restoreFocus) {
    if (!state.panel || !state.toggle) return;
    state.open = open;
    state.panel.hidden = !open;
    state.toggle.setAttribute("aria-expanded", String(open));
    if (open) state.panel.querySelector("[data-appearance-close]").focus({preventScroll:true});
    else if (restoreFocus && state.toggle.isConnected) state.toggle.focus({preventScroll:true});
    updateVisibility(state);
  }
  function updateVisibility(state) {
    if (state.controls) {
      var visible = (window.scrollY > 200 || state.open || state.controls.contains(document.activeElement) || (window.Shopify && window.Shopify.designMode)) && !state.overlay;
      state.controls.hidden = !visible;
    }
    updateMotion(state);
  }
  function setup(root) {
    if (instance && instance.root === root) return;
    if (instance) destroy(instance);
    var defaults = {motion:root.dataset.defaultMotion === "true",artwork:root.dataset.defaultArtwork === "true",fades:root.dataset.defaultFades === "true",exaggerated:root.dataset.defaultExaggerated === "true"};
    var preferences = Object.assign({}, defaults);
    if (root.dataset.showControl === "true" && !(window.Shopify && window.Shopify.designMode)) {
      try {
        var saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && typeof saved === "object") keys.forEach(function (key) { if (typeof saved[key] === "boolean") preferences[key] = saved[key]; });
      } catch (error) { /* Use the section defaults for missing or invalid saved preferences. */ }
    }
    var state = {root:root,defaults:defaults,preferences:preferences,controls:root.querySelector("[data-appearance-controls]"),panel:root.querySelector("[data-appearance-panel]"),toggle:root.querySelector("[data-appearance-toggle]"),open:false,overlay:!!document.querySelector("dialog[open]"),destroyed:false,loading:false,failed:false,ready:false,animation:null,direction:1,frame:null,controller:new AbortController()};
    instance = state;
    var options = {signal:state.controller.signal};
    if (state.controls) state.controls.addEventListener("focusout", function () {requestAnimationFrame(function(){if(!state.destroyed)updateVisibility(state);});}, options);
    if (state.toggle) state.toggle.addEventListener("click", function () { setOpen(state,!state.open,false); }, options);
    var close = root.querySelector("[data-appearance-close]");
    if (close) close.addEventListener("click", function () { setOpen(state,false,true); }, options);
    root.querySelectorAll("[data-appearance-option]").forEach(function (input) {
      input.addEventListener("change", function () { state.preferences[input.dataset.appearanceOption] = input.checked; render(state,true); }, options);
    });
    root.querySelectorAll("[data-appearance-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var preset = presets[button.dataset.appearancePreset];
        if (!preset) return;
        state.preferences = Object.assign({},state.preferences,preset);
        render(state,true);
        var status = root.querySelector("[data-appearance-status]");
        if (status) status.textContent = button.dataset.appearancePreset === "clean" ? "Clean background selected." : "Original studio background selected.";
      }, options);
    });
    var reset = root.querySelector("[data-appearance-reset]");
    if (reset) reset.addEventListener("click", function () {state.preferences=Object.assign({},state.defaults);render(state,true);}, options);
    document.addEventListener("pointerdown", function (event) { if (state.open && !state.controls.contains(event.target)) setOpen(state,false,false); }, options);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && state.open) {event.preventDefault();setOpen(state,false,true);} }, options);
    document.addEventListener("sideshow:overlaychange", function (event) {state.overlay=Boolean(event.detail&&event.detail.open);if(state.overlay)setOpen(state,false,false);updateVisibility(state);}, options);
    document.addEventListener("visibilitychange", function () { updateMotion(state); }, options);
    window.addEventListener("scroll", function () { if (!state.frame) state.frame=requestAnimationFrame(function(){state.frame=null;updateVisibility(state);}); }, {passive:true,signal:state.controller.signal});
    window.addEventListener("resize", function () {updateVisibility(state);}, options);
    render(state,false);
    updateVisibility(state);
  }
  function destroy(state) {
    state.destroyed=true;
    state.controller.abort();
    if (state.frame) cancelAnimationFrame(state.frame);
    if (state.animation) state.animation.destroy();
    ["spMotion","spArtwork","spFades","spBackground","spExaggerated"].forEach(function(key){delete document.body.dataset[key];});
    if (instance===state) instance=null;
  }
  function init(scope) {
    var root=scope.matches&&scope.matches("[data-sp-appearance]")?scope:scope.querySelector("[data-sp-appearance]");
    if(root)setup(root);
  }
  if(reduced.addEventListener)reduced.addEventListener("change",function(){if(instance)updateMotion(instance);});
  else reduced.addListener(function(){if(instance)updateMotion(instance);});
  document.addEventListener("shopify:section:load",function(event){init(event.target);});
  document.addEventListener("shopify:section:unload",function(event){if(instance&&event.target.contains(instance.root))destroy(instance);});
  window.SideshowAppearance={init:init};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){init(document);},{once:true});else init(document);
}());
