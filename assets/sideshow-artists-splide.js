/* Artist portraits: Splide with a gentle continuous Auto Scroll loop. */
(function () {
  "use strict";
  if (window.SideshowArtistSlider) { window.SideshowArtistSlider.init(document); return; }
  var selector = "[data-artist-splide]";
  var instances = new Map();
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var overlayOpen = Boolean(document.querySelector("dialog[open]"));
  var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var state = instances.get(entry.target);
      if (!state) return;
      state.visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (state.visible) calibrate(state);
      sync(state);
    });
  }, { threshold: [0, .03] }) : null;

  function roots(scope) {
    var found = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) found.unshift(scope);
    return found;
  }
  function inView(element) {
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }
  function keyboardFocus(state) {
    var active = document.activeElement;
    return active && state.element.contains(active) && active.matches(":focus-visible");
  }
  function calibrate(state) {
    // Phone cards use timed Autoplay. Updating Auto Scroll here would restore its
    // last continuous position after Splide has aligned the new phone layout.
    if (window.matchMedia("(max-width: 600px)").matches) {
      if (state.calibration !== null) cancelAnimationFrame(state.calibration);
      state.calibration = null;
      state.calibrationKey = null;
      return;
    }
    if (state.destroyed || !state.ready || state.calibration !== null || document.hidden) return;
    var key = window.innerWidth + ":" + window.devicePixelRatio + ":" + state.element.clientWidth;
    if (state.calibrationKey === key) return;
    state.calibrationKey = key;
    var intervals = [], previous = 0;
    function sample(now) {
      if (state.destroyed) return;
      if (window.matchMedia("(max-width: 600px)").matches) {
        state.calibration = null;
        state.calibrationKey = null;
        return;
      }
      if (previous && now > previous && now - previous < 80) intervals.push(now - previous);
      previous = now;
      if (intervals.length < 15) { state.calibration = requestAnimationFrame(sample); return; }
      state.calibration = null;
      intervals.sort(function (a,b) { return a-b; });
      var frameMs = Math.max(4, Math.min(34, intervals[Math.floor(intervals.length / 2)]));
      var pixelsPerSecond = state.pixelsPerSecond;
      // Auto Scroll uses pixels per frame. Normalize for 60/120/240Hz screens.
      state.splide.options = {autoScroll:{speed:pixelsPerSecond * frameMs / 1000}};
      state.element.dataset.artistPixelsPerSecond = String(pixelsPerSecond);
      schedule(state);
    }
    state.calibration = requestAnimationFrame(sample);
  }
  function sync(state) {
    if (state.destroyed || !state.ready) return;
    if (state.track.scrollLeft) state.track.scrollLeft = 0;
    var autoScroll = state.splide.Components.AutoScroll;
    if (!autoScroll) return;
    var run = state.visible && !document.hidden && !overlayOpen && !reduced.matches &&
      !state.dragging && !keyboardFocus(state) && !(window.Shopify && window.Shopify.designMode) && state.count > 1;
    var autoplay = state.splide.Components.Autoplay;
    var phone = window.matchMedia("(max-width: 600px)").matches;
    var motion = phone ? "slides" : "continuous";
    var layoutWidth = state.track.clientWidth;
    if ((state.element.dataset.artistMotion && state.element.dataset.artistMotion !== motion) ||
      (phone && state.layoutWidth !== layoutWidth)) {
      autoScroll.pause();
      autoplay.pause();
      state.splide.Components.Move.jump(state.splide.index);
    }
    state.layoutWidth = layoutWidth;
    state.element.dataset.artistMotion = motion;
    if (phone) {
      autoScroll.pause();
      if (run) autoplay.play(); else autoplay.pause();
      state.element.dataset.artistRunning = String(run && !autoplay.isPaused());
    } else {
      autoplay.pause();
      if (run) autoScroll.play(); else autoScroll.pause();
      state.element.dataset.artistRunning = String(run && !autoScroll.isPaused());
    }
  }
  function schedule(state) {
    if (state.destroyed || state.frame !== null) return;
    state.frame = window.requestAnimationFrame(function () { state.frame = null; sync(state); });
  }
  function mount(element) {
    if (instances.has(element)) return;
    var extension = window.splide && window.splide.Extensions && window.splide.Extensions.AutoScroll;
    if (typeof window.Splide !== "function" || !extension) { element.dataset.artistState = "fallback"; return; }
    var count = element.querySelectorAll(".splide__list > .splide__slide").length;
    if (!count) return;
    var pixelsPerSecond = Math.max(12, Math.min(32, Number(element.dataset.scrollSpeed) || 22));
    var state = {element:element, splide:null, count:count, ready:false, visible:inView(element), dragging:false,
      frame:null, calibration:null, calibrationKey:null, pixelsPerSecond:pixelsPerSecond, track:element.querySelector(".splide__track"), destroyed:false, controller:new AbortController()};
    var splide = new window.Splide(element, {
      type: count > 1 ? "loop" : "slide",
      role: "group",
      perPage: Math.min(3, count),
      perMove: 1,
      gap: "24px",
      padding: 0,
      speed: 650,
      easing: "cubic-bezier(.22,.61,.36,1)",
      arrows: false,
      pagination: false,
      autoplay: "pause",
      interval: 5600,
      resetProgress: true,
      live: false,
      drag: count > 1 ? "free" : false,
      snap: false,
      flickPower: 180,
      flickMaxPages: 1,
      keyboard: "focused",
      slideFocus: false,
      pauseOnHover: false,
      pauseOnFocus: false,
      autoScroll: {speed:.1, autoStart:false, pauseOnHover:false, pauseOnFocus:false},
      breakpoints: {
        1000: {perPage:Math.min(2,count), gap:"20px"},
        600: {perPage:1, gap:"16px", drag:true, speed:800, autoScroll:false, padding:{left:0,right:count > 1 ? "38px" : 0}}
      },
      reducedMotion: {speed:0, rewindSpeed:0, autoplay:"pause"}
    });
    state.splide = splide;
    instances.set(element, state);
    splide.on("mounted", function () {
      state.ready = true;
      element.dataset.artistState = "ready";
      state.track.scrollLeft = 0;
      calibrate(state);
      schedule(state);
    });
    splide.on("updated refresh moved scrolled", function () { schedule(state); });
    splide.on("resized", function () { state.track.scrollLeft = 0; calibrate(state); schedule(state); });
    splide.on("drag", function () { state.dragging = true; sync(state); });
    splide.on("dragged", function () { state.dragging = false; schedule(state); });
    var options = {signal:state.controller.signal};
    state.track.addEventListener("scroll", function () { if (state.ready && state.track.scrollLeft) state.track.scrollLeft = 0; }, {passive:true,signal:state.controller.signal});
    element.addEventListener("focusin", function () { schedule(state); }, options);
    element.addEventListener("focusout", function () { schedule(state); }, options);
    element.addEventListener("keydown", function () { schedule(state); }, options);
    element.addEventListener("pointerdown", function () { schedule(state); }, options);
    element.addEventListener("pointerup", function () { schedule(state); }, options);
    try {
      splide.mount({AutoScroll:extension});
      if (observer) observer.observe(element);
    } catch (error) {
      destroyOne(element);
      element.dataset.artistState = "fallback";
      console.warn("Sideshow artist slider is using its scrolling fallback.", error);
    }
  }
  function init(scope) { roots(scope).forEach(mount); }
  function destroyOne(element) {
    var state = instances.get(element);
    if (!state) return;
    state.destroyed = true;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (state.calibration !== null) cancelAnimationFrame(state.calibration);
    state.controller.abort();
    if (observer) observer.unobserve(element);
    state.splide.destroy(true);
    element.classList.remove("is-initialized", "is-active");
    delete element.dataset.artistState;
    delete element.dataset.artistRunning;
    delete element.dataset.artistMotion;
    delete element.dataset.artistPixelsPerSecond;
    instances.delete(element);
  }
  function destroy(scope) { roots(scope).forEach(destroyOne); }
  function syncAll() { instances.forEach(function (state) { if (!observer) state.visible = inView(state.element); sync(state); }); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) instances.forEach(function (state) { state.calibrationKey = null; calibrate(state); }); syncAll(); });
  document.addEventListener("sideshow:overlaychange", function (event) { overlayOpen = Boolean(event.detail && event.detail.open); syncAll(); });
  if (reduced.addEventListener) reduced.addEventListener("change", syncAll);
  else reduced.addListener(syncAll);
  window.addEventListener("pageshow", syncAll);
  window.addEventListener("pagehide", function () { instances.forEach(function (state) { if (state.ready) { state.splide.Components.AutoScroll.pause(); state.splide.Components.Autoplay.pause(); } }); });
  if (!observer) {
    window.addEventListener("scroll", syncAll, {passive:true});
    window.addEventListener("resize", syncAll, {passive:true});
  }
  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) { destroy(event.target); });
  document.addEventListener("shopify:block:select", function (event) {
    var element = event.target.closest(selector);
    var state = element && instances.get(element);
    var slide = event.target.closest(".splide__slide:not(.splide__slide--clone)");
    if (!state || !slide) return;
    var index = Array.from(element.querySelectorAll(".splide__list > .splide__slide:not(.splide__slide--clone)")).indexOf(slide);
    if (index >= 0) state.splide.go(index);
  });
  window.SideshowArtistSlider = {init:init, destroy:destroy, get:function (element) { var state = instances.get(element); return state ? state.splide : null; }};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document); }, {once:true});
  else init(document);
}());
