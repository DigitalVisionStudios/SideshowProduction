/* Automatic hero scenes and optional video, suspended when they are not being viewed. */
(function () {
  "use strict";
  if (window.__sideshowHeroDeckLoaded) return;
  window.__sideshowHeroDeckLoaded = true;

  var selector = "[data-sp-hero-deck]";
  var instances = new Map();
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var overlayOpen = false;
  var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var state = instances.get(entry.target);
      if (!state) return;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= .08;
      sync(state);
    });
  }, { threshold: [0, .08] }) : null;

  function cancelTimer(state) {
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
  }

  function running(state) {
    return !state.destroyed && !reduced.matches && state.autoplay && state.visible &&
      !state.editorPaused && !overlayOpen && !document.hidden;
  }

  function sync(state) {
    var activeMotion = running(state);
    state.element.setAttribute("data-hero-running", String(activeMotion));
    if (!activeMotion) cancelTimer(state);
    else if (state.frames.length > 1 && state.timer === null) {
      state.timer = window.setTimeout(function () {
        state.timer = null;
        select(state, state.index + 1);
      }, state.interval);
    }
    state.frames.forEach(function (frame, index) {
      var video = frame.querySelector("[data-sp-hero-deck-video]");
      if (!video) return;
      if (!activeMotion || index !== state.index) { video.pause(); return; }
      var source = video.querySelector("source[data-src]");
      if (source && !source.hasAttribute("src")) {
        source.src = source.getAttribute("data-src");
        video.load();
      }
      if (video.paused && !video.dataset.playPending) {
        video.muted = true;
        video.dataset.playPending = "true";
        var play = video.play();
        if (play && play.then) {
          play.then(function () {
            delete video.dataset.playPending;
            if (!running(state) || state.index !== index) video.pause();
          }).catch(function () {
            delete video.dataset.playPending;
            frame.classList.remove("is-video-ready");
          });
        } else delete video.dataset.playPending;
      }
    });
  }

  function select(state, requested) {
    cancelTimer(state);
    state.index = (requested + state.frames.length) % state.frames.length;
    state.frames.forEach(function (frame, index) {
      frame.classList.toggle("is-active", index === state.index);
    });
    state.copyGroups.forEach(function (group) {
      group.forEach(function (part, index) {
        part.classList.toggle("is-active", index === state.index);
        part.setAttribute("aria-hidden", String(index !== state.index));
      });
    });
    sync(state);
  }

  function roots(scope) {
    var result = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) result.unshift(scope);
    return result;
  }

  function init(scope) {
    roots(scope).forEach(function (element) {
      if (instances.has(element)) return;
      var frames = Array.from(element.querySelectorAll("[data-sp-hero-frame]"));
      var words = Array.from(element.querySelectorAll("[data-sp-hero-word]"));
      var headlines = Array.from(element.querySelectorAll("[data-sp-hero-headline]"));
      var descriptions = Array.from(element.querySelectorAll("[data-sp-hero-description]"));
      var copyGroups = [words, headlines, descriptions];
      if (!frames.length || copyGroups.some(function (group) { return group.length !== frames.length; })) return;
      var bounds = element.getBoundingClientRect();
      var state = {
        element: element,
        frames: frames,
        copyGroups: copyGroups,
        index: 0,
        interval: Math.max(4000, Number(element.dataset.heroInterval) || 5500),
        autoplay: element.dataset.heroAutoplay !== "false",
        visible: !observer || (bounds.bottom > 0 && bounds.top < window.innerHeight),
        editorPaused: false,
        destroyed: false,
        timer: null,
        listeners: []
      };
      function on(target, type, handler) {
        if (!target) return;
        target.addEventListener(type, handler);
        state.listeners.push([target, type, handler]);
      }
      frames.forEach(function (frame) {
        frame.hidden = false;
        var video = frame.querySelector("[data-sp-hero-deck-video]");
        on(video, "playing", function () {
          frame.classList.add("is-video-ready");
          if (!running(state) || frames[state.index] !== frame) video.pause();
        });
        on(video, "error", function () { frame.classList.remove("is-video-ready"); });
      });
      copyGroups.forEach(function (group) { group.forEach(function (part) { part.hidden = false; }); });
      element.setAttribute("data-hero-ready", "");
      instances.set(element, state);
      select(state, 0);
      if (observer) observer.observe(element);
    });
  }

  function destroy(scope) {
    roots(scope).forEach(function (element) {
      var state = instances.get(element);
      if (!state) return;
      state.destroyed = true;
      cancelTimer(state);
      state.listeners.forEach(function (listener) { listener[0].removeEventListener(listener[1], listener[2]); });
      state.frames.forEach(function (frame, index) {
        var video = frame.querySelector("[data-sp-hero-deck-video]");
        if (video) video.pause();
        frame.hidden = index !== 0;
        frame.classList.toggle("is-active", index === 0);
      });
      state.copyGroups.forEach(function (group) {
        group.forEach(function (part, index) {
          part.hidden = index !== 0;
          part.classList.toggle("is-active", index === 0);
          part.setAttribute("aria-hidden", String(index !== 0));
        });
      });
      if (observer) observer.unobserve(element);
      element.removeAttribute("data-hero-ready");
      element.removeAttribute("data-hero-running");
      instances.delete(element);
    });
  }

  function syncAll() { instances.forEach(sync); }
  function editorBlock(event, selected) {
    var root = event.target.closest && event.target.closest(selector);
    var state = root && instances.get(root);
    if (!state) return;
    state.editorPaused = selected;
    if (selected) {
      var blockId = event.detail && event.detail.blockId;
      var index = state.frames.findIndex(function (frame) { return frame.dataset.blockId === blockId; });
      if (index >= 0) select(state, index);
    }
    sync(state);
  }

  document.addEventListener("visibilitychange", syncAll);
  document.addEventListener("sideshow:overlaychange", function (event) {
    overlayOpen = Boolean(event.detail && event.detail.open);
    syncAll();
  });
  if (reduced.addEventListener) reduced.addEventListener("change", syncAll);
  else reduced.addListener(syncAll);
  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) { destroy(event.target); });
  document.addEventListener("shopify:block:select", function (event) { editorBlock(event, true); });
  document.addEventListener("shopify:block:deselect", function (event) { editorBlock(event, false); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  else init(document);
}());
