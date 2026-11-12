/* Automatic service marquee, suspended offscreen and for reduced motion. */
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
    state.element.setAttribute("data-marquee-running", String(motionAllowed && state.visible && !document.hidden));
    state.copy.hidden = !motionAllowed;
  }

  function roots(scope) {
    var found = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) found.unshift(scope);
    return found;
  }

  function init(scope) {
    roots(scope).forEach(function (element) {
      if (instances.has(element)) return;
      var copy = element.querySelector("[data-marquee-copy]");
      if (!copy) return;
      var bounds = element.getBoundingClientRect();
      var state = {
        element: element,
        copy: copy,
        visible: !observer || (bounds.bottom > 0 && bounds.top < window.innerHeight)
      };
      instances.set(element, state);
      sync(state);
      if (observer) observer.observe(element);
    });
  }

  function destroy(scope) {
    roots(scope).forEach(function (element) {
      var state = instances.get(element);
      if (!state) return;
      if (observer) observer.unobserve(element);
      state.copy.hidden = true;
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
