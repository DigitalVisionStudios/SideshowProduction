/* Hero scene rotation. One user choice controls both the timer and optional video. */
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
    return !state.destroyed && !reduced.matches && !state.paused && state.visible && !state.focusPaused &&
      !state.editorPaused && !overlayOpen && !document.hidden;
  }

  function sync(state) {
    var activeMotion = running(state);
    state.element.setAttribute("data-hero-running", String(activeMotion));
    if (!activeMotion) cancelTimer(state);
    else if (state.frames.length > 1 && state.timer === null) {
      state.timer = window.setTimeout(function () {
        state.timer = null;
        select(state, state.index + 1, false);
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
    if (state.motion) {
      state.motion.hidden = reduced.matches;
      state.motion.setAttribute("aria-label", state.paused ? "Play slideshow and video" : "Pause slideshow and video");
      state.motion.title = state.paused ? "Play slideshow and video" : "Pause slideshow and video";
      state.motion.querySelector("[data-sp-hero-pause-icon]").toggleAttribute("hidden", state.paused);
      state.motion.querySelector("[data-sp-hero-play-icon]").toggleAttribute("hidden", !state.paused);
    }
  }

  function select(state, requested, manual) {
    cancelTimer(state);
    state.index = (requested + state.frames.length) % state.frames.length;
    if (manual) state.paused = true;
    state.frames.forEach(function (frame, index) {
      frame.classList.toggle("is-active", index === state.index);
    });
    state.words.forEach(function (word, index) {
      word.classList.toggle("is-active", index === state.index);
      word.setAttribute("aria-hidden", String(index !== state.index));
    });
    state.steps.forEach(function (step, index) {
      step.classList.toggle("is-active", index === state.index);
      if (index === state.index) step.setAttribute("aria-current", "true");
      else step.removeAttribute("aria-current");
    });
    if (manual && state.status) {
      state.status.textContent = "Scene " + (state.index + 1) + " of " + state.frames.length + ": " + state.words[state.index].textContent.trim() + ".";
    }
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
      if (!frames.length || frames.length !== words.length) return;
      var bounds = element.getBoundingClientRect();
      var state = {
        element: element,
        frames: frames,
        words: words,
        steps: Array.from(element.querySelectorAll("[data-sp-hero-go]")),
        motion: element.querySelector("[data-sp-hero-motion]"),
        status: element.querySelector("[data-sp-hero-status]"),
        index: 0,
        interval: Math.max(4000, Number(element.dataset.heroInterval) || 5500),
        paused: element.dataset.heroAutoplay === "false",
        visible: !observer || (bounds.bottom > 0 && bounds.top < window.innerHeight),
        focusPaused: false,
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
      words.forEach(function (word) { word.hidden = false; });
      state.steps.forEach(function (step) {
        on(step, "click", function () { select(state, Number(step.dataset.spHeroGo), true); });
      });
      on(element.querySelector("[data-sp-hero-prev]"), "click", function () { select(state, state.index - 1, true); });
      on(element.querySelector("[data-sp-hero-next]"), "click", function () { select(state, state.index + 1, true); });
      on(state.motion, "click", function () {
        state.paused = !state.paused;
        state.focusPaused = false;
        sync(state);
      });
      on(element, "focusin", function () { state.focusPaused = true; sync(state); });
      on(element, "focusout", function (event) {
        if (!element.contains(event.relatedTarget)) { state.focusPaused = false; sync(state); }
      });
      on(element.querySelector("[data-sp-hero-pager]"), "keydown", function (event) {
        var index;
        if (event.key === "ArrowRight") index = (state.index + 1) % frames.length;
        else if (event.key === "ArrowLeft") index = (state.index + frames.length - 1) % frames.length;
        else if (event.key === "Home") index = 0;
        else if (event.key === "End") index = frames.length - 1;
        else return;
        event.preventDefault();
        select(state, index, true);
        state.steps[index].focus();
      });
      var controls = element.querySelector("[data-sp-hero-deck-controls]");
      if (controls) controls.hidden = false;
      element.setAttribute("data-hero-ready", "");
      instances.set(element, state);
      select(state, 0, false);
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
      state.words.forEach(function (word, index) {
        word.hidden = index !== 0;
        word.classList.toggle("is-active", index === 0);
        word.setAttribute("aria-hidden", String(index !== 0));
      });
      if (observer) observer.unobserve(element);
      var controls = element.querySelector("[data-sp-hero-deck-controls]");
      if (controls) controls.hidden = true;
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
      if (index >= 0) select(state, index, false);
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
