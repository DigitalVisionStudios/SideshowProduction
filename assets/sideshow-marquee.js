/* Lightweight section lifecycle and motion controls for the studio service band. */
(function () {
  "use strict";
  if (window.__sideshowMarqueeLoaded) return;
  window.__sideshowMarqueeLoaded = true;

  var selector = "[data-sp-marquee]";
  var instances = new Map();
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var state = instances.get(entry.target);
      if (!state) return;
      state.visible = entry.isIntersecting;
      sync(state);
    });
  }, { threshold: 0 }) : null;

  function sync(state) {
    var motionAllowed = !reduced.matches;
    state.element.toggleAttribute("data-marquee-ready", motionAllowed);
    state.element.setAttribute("data-marquee-running", String(motionAllowed && !state.paused && state.visible && !document.hidden));
    state.copy.hidden = !motionAllowed;
    state.button.hidden = !motionAllowed;
    state.button.setAttribute("aria-label", state.paused ? "Play moving text" : "Pause moving text");
    state.button.title = state.paused ? "Play moving text" : "Pause moving text";
    state.pauseIcon.toggleAttribute("hidden", state.paused);
    state.playIcon.toggleAttribute("hidden", !state.paused);
  }

  function roots(scope) {
    var found = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) found.unshift(scope);
    return found;
  }

  function init(scope) {
    roots(scope).forEach(function (element) {
      if (instances.has(element)) return;
      var button = element.querySelector("[data-marquee-toggle]");
      var copy = element.querySelector("[data-marquee-copy]");
      if (!button || !copy) return;
      var bounds = element.getBoundingClientRect();
      var state = {
        element: element,
        button: button,
        copy: copy,
        pauseIcon: button.querySelector("[data-marquee-pause]"),
        playIcon: button.querySelector("[data-marquee-play]"),
        paused: false,
        visible: !observer || (bounds.bottom > 0 && bounds.top < window.innerHeight)
      };
      state.onClick = function () { state.paused = !state.paused; sync(state); };
      button.addEventListener("click", state.onClick);
      instances.set(element, state);
      sync(state);
      if (observer) observer.observe(element);
    });
  }

  function destroy(scope) {
    roots(scope).forEach(function (element) {
      var state = instances.get(element);
      if (!state) return;
      state.button.removeEventListener("click", state.onClick);
      if (observer) observer.unobserve(element);
      state.copy.hidden = true;
      state.button.hidden = true;
      element.removeAttribute("data-marquee-ready");
      element.removeAttribute("data-marquee-running");
      instances.delete(element);
    });
  }

  function syncAll() { instances.forEach(sync); }
  document.addEventListener("visibilitychange", syncAll);
  if (reduced.addEventListener) reduced.addEventListener("change", syncAll);
  else reduced.addListener(syncAll);
  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) { destroy(event.target); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  } else {
    init(document);
  }
}());
