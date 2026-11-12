/* Automatic source-layout carousels and lazy background video. */
(function () {
  "use strict";
  if (window.__sideshowOriginalLoaded) return;
  window.__sideshowOriginalLoaded = true;

  var carouselSelector = "[data-original-carousel]";
  var videoSelector = "[data-original-video]";
  var carousels = new Map();
  var videos = new Map();
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var duration = 500;
  var resizeFrame = null;
  var overlayOpen = false;
  var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var carousel = carousels.get(entry.target);
      var video = videos.get(entry.target);
      if (carousel) {
        carousel.visible = entry.isIntersecting && entry.intersectionRatio > 0;
        syncCarousel(carousel);
      }
      if (video) {
        video.visible = entry.isIntersecting && entry.intersectionRatio > 0;
        syncVideo(video);
      }
    });
  }, { threshold: [0, .01] }) : null;

  function roots(scope, selector) {
    var result = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) result.unshift(scope);
    return result;
  }

  function inView(element) {
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function listen(state, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    state.listeners.push([target, type, handler, options]);
  }

  function unlisten(state) {
    state.listeners.forEach(function (listener) {
      listener[0].removeEventListener(listener[1], listener[2], listener[3]);
    });
  }

  function clearTimer(state, key) {
    if (state[key] !== null) window.clearTimeout(state[key]);
    state[key] = null;
  }

  function canRun(state) {
    return !state.destroyed && state.visible && !document.hidden && !overlayOpen &&
      !reduced.matches && !state.focused && state.step > 0 && state.slides.length > state.visibleCount;
  }

  function paint(state, animate) {
    state.track.style.transition = animate ? "transform " + duration + "ms cubic-bezier(.22,.61,.36,1)" : "none";
    state.track.style.transform = "translate3d(" + (-state.index * state.step) + "px,0,0)";
    state.element.setAttribute("data-original-index", String(state.index % state.slides.length));
  }

  function finish(state) {
    clearTimer(state, "transitionTimer");
    state.animating = false;
    if (state.index >= state.slides.length) {
      state.index %= state.slides.length;
      paint(state, false);
    }
    syncCarousel(state);
  }

  function move(state, direction, manual) {
    if (state.destroyed || !state.step || state.slides.length <= state.visibleCount || state.animating) return;
    clearTimer(state, "timer");
    var animate = !reduced.matches && state.visible && !document.hidden;
    if (direction < 0 && state.index === 0) {
      // The trailing clones are visually identical to the first visible slides.
      state.index = state.slides.length;
      paint(state, false);
      if (animate) state.track.getBoundingClientRect();
    }
    state.index += direction < 0 ? -1 : 1;
    state.element.scrollLeft = 0;
    if (manual) state.pointer = null;
    if (!animate) {
      state.index %= state.slides.length;
      paint(state, false);
      syncCarousel(state);
      return;
    }
    state.animating = true;
    paint(state, true);
    // transitionend may be skipped when a tab is suspended or styles change.
    state.transitionTimer = window.setTimeout(function () { finish(state); }, duration + 100);
  }

  function syncCarousel(state) {
    if (state.destroyed) return;
    var running = canRun(state);
    state.element.setAttribute("data-original-running", String(running));
    state.track.style.willChange = running || state.animating ? "transform" : "";
    if (!running) {
      clearTimer(state, "timer");
      if (state.animating && (!state.visible || document.hidden || reduced.matches)) {
        clearTimer(state, "transitionTimer");
        state.animating = false;
        state.index %= state.slides.length;
        paint(state, false);
        state.track.style.willChange = "";
      }
      return;
    }
    if (!state.animating && state.timer === null) {
      state.timer = window.setTimeout(function () {
        state.timer = null;
        if (canRun(state)) move(state, 1, false);
      }, state.interval);
    }
  }

  function cloneSlide(slide) {
    var clone = slide.cloneNode(true);
    clone.setAttribute("data-original-clone", "");
    clone.setAttribute("aria-hidden", "true");
    // Visible artist clones retain pointer links, but never enter the tab order.
    if (clone.matches("a[href]") || clone.querySelector("a[href]")) clone.removeAttribute("inert");
    else clone.setAttribute("inert", "");
    clone.setAttribute("tabindex", "-1");
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(function (element) { element.removeAttribute("id"); });
    clone.querySelectorAll("a,button,input,select,textarea,[tabindex],[contenteditable]").forEach(function (element) {
      element.setAttribute("tabindex", "-1");
    });
    return clone;
  }

  function measure(state) {
    if (state.destroyed) return;
    clearTimer(state, "timer");
    clearTimer(state, "transitionTimer");
    state.animating = false;
    state.index %= state.slides.length;
    state.clones.forEach(function (clone) { clone.remove(); });
    state.clones = [];
    state.track.style.transition = "none";
    var first = state.slides[0].getBoundingClientRect();
    var gap = parseFloat(window.getComputedStyle(state.track).columnGap) || 0;
    var width = state.track.clientWidth || state.element.clientWidth;
    state.step = state.slides.length > 1 ? state.slides[1].getBoundingClientRect().left - first.left : first.width + gap;
    state.visibleCount = state.step > 0 ? Math.max(1, Math.min(state.slides.length, Math.ceil((width + gap - 1) / state.step))) : 1;
    if (state.slides.length > state.visibleCount && state.step > 0) {
      state.slides.slice(0, state.visibleCount).forEach(function (slide) {
        var clone = cloneSlide(slide);
        state.track.appendChild(clone);
        state.clones.push(clone);
      });
    } else state.index = 0;
    state.element.scrollLeft = 0;
    paint(state, false);
    syncCarousel(state);
  }

  function initCarousel(element) {
    if (carousels.has(element)) return;
    var track = element.querySelector("[data-original-track]");
    if (!track) return;
    var slides = Array.from(track.children).filter(function (child) {
      return child.matches("[data-original-slide]") && !child.hasAttribute("data-original-clone");
    });
    if (!slides.length) return;
    var state = {
      element: element, track: track, slides: slides, clones: [], listeners: [],
      index: 0, step: 0, visibleCount: 1, animating: false, destroyed: false,
      visible: inView(element), focused: element.contains(document.activeElement), pointer: null,
      interval: Math.max(1000, Number(element.getAttribute("data-interval")) || 3000),
      timer: null, transitionTimer: null, resizeObserver: null,
      original: {
        transform: track.style.transform, transition: track.style.transition, willChange: track.style.willChange,
        touchAction: element.style.touchAction, tabindex: element.getAttribute("tabindex"),
        live: track.getAttribute("aria-live"), ready: element.classList.contains("is-original-ready")
      }
    };
    carousels.set(element, state);
    element.classList.add("is-original-ready");
    element.style.touchAction = "pan-y pinch-zoom";
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    track.setAttribute("aria-live", "off");
    listen(state, track, "transitionend", function (event) {
      if (event.target === track && event.propertyName === "transform" && state.animating) finish(state);
    });
    listen(state, element, "keydown", function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      move(state, event.key === "ArrowLeft" ? -1 : 1, true);
    });
    listen(state, element, "pointerdown", function (event) {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }, { passive: true });
    listen(state, element, "pointerup", function (event) {
      var pointer = state.pointer;
      state.pointer = null;
      if (!pointer || pointer.id !== event.pointerId) return;
      var x = event.clientX - pointer.x;
      var y = event.clientY - pointer.y;
      if (Math.abs(x) >= 35 && Math.abs(x) > Math.abs(y) * 1.3) move(state, x < 0 ? 1 : -1, true);
    }, { passive: true });
    listen(state, element, "pointercancel", function () { state.pointer = null; }, { passive: true });
    listen(state, element, "focusin", function (event) {
      state.focused = true;
      var slide = event.target.closest("[data-original-slide]");
      var index = slides.indexOf(slide);
      if (index >= 0 && (index < state.index || index >= state.index + state.visibleCount)) {
        clearTimer(state, "transitionTimer");
        state.animating = false;
        state.index = index;
        paint(state, false);
      }
      element.scrollLeft = 0;
      syncCarousel(state);
    });
    listen(state, element, "focusout", function (event) {
      state.focused = Boolean(event.relatedTarget && element.contains(event.relatedTarget));
      syncCarousel(state);
    });
    measure(state);
    if ("ResizeObserver" in window) {
      state.resizeObserver = new ResizeObserver(function () { measure(state); });
      state.resizeObserver.observe(element);
    }
    if (observer) observer.observe(element);
  }

  function videoRunning(state) {
    return !state.destroyed && state.visible && !document.hidden && !overlayOpen && !reduced.matches;
  }

  function syncVideo(state) {
    var video = state.video;
    if (!videoRunning(state)) {
      video.pause();
      return;
    }
    if (!state.loaded) {
      var changed = false;
      if (video.hasAttribute("data-src") && !video.getAttribute("src")) {
        video.src = video.getAttribute("data-src");
        changed = true;
      }
      video.querySelectorAll("source[data-src]").forEach(function (source) {
        if (source.getAttribute("src")) return;
        source.src = source.getAttribute("data-src");
        changed = true;
      });
      state.loaded = true;
      if (changed) video.load();
    }
    if (!video.paused || state.pending || state.blocked) return;
    video.muted = true;
    state.pending = true;
    var result;
    try { result = video.play(); }
    catch (error) { state.pending = false; state.blocked = true; return; }
    if (result && typeof result.then === "function") {
      result.then(function () {
        state.pending = false;
        if (!videoRunning(state)) video.pause();
      }).catch(function (error) {
        state.pending = false;
        // Leaving the viewport can abort a pending play request without a media error.
        state.blocked = error && error.name !== "AbortError";
        state.element.classList.remove("is-original-video-playing");
      });
    } else state.pending = false;
  }

  function initVideo(element) {
    if (videos.has(element)) return;
    var video = element.tagName === "VIDEO" ? element : element.querySelector("video");
    if (!video) return;
    var state = {
      element: element, video: video, listeners: [], visible: inView(element),
      loaded: false, pending: false, blocked: false, destroyed: false
    };
    videos.set(element, state);
    video.controls = false;
    video.removeAttribute("controls");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("loop", "");
    // Playback is requested only when visible; the browser still enforces its policy.
    video.autoplay = false;
    video.removeAttribute("autoplay");
    video.preload = "none";
    listen(state, video, "playing", function () {
      if (!videoRunning(state)) video.pause();
      else element.classList.add("is-original-video-playing");
    });
    listen(state, video, "pause", function () { element.classList.remove("is-original-video-playing"); });
    listen(state, video, "error", function () {
      state.blocked = true;
      element.classList.remove("is-original-video-playing");
    });
    listen(state, video, "loadeddata", function () { syncVideo(state); });
    syncVideo(state);
    if (observer) observer.observe(element);
  }

  function restoreAttribute(element, name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }

  function destroyCarousel(element) {
    var state = carousels.get(element);
    if (!state) return;
    state.destroyed = true;
    clearTimer(state, "timer");
    clearTimer(state, "transitionTimer");
    unlisten(state);
    if (state.resizeObserver) state.resizeObserver.disconnect();
    if (observer) observer.unobserve(element);
    state.clones.forEach(function (clone) { clone.remove(); });
    state.track.style.transform = state.original.transform;
    state.track.style.transition = state.original.transition;
    state.track.style.willChange = state.original.willChange;
    element.style.touchAction = state.original.touchAction;
    element.classList.toggle("is-original-ready", state.original.ready);
    restoreAttribute(element, "tabindex", state.original.tabindex);
    restoreAttribute(state.track, "aria-live", state.original.live);
    element.removeAttribute("data-original-running");
    element.removeAttribute("data-original-index");
    carousels.delete(element);
  }

  function init(scope) {
    roots(scope, carouselSelector).forEach(initCarousel);
    roots(scope, videoSelector).forEach(initVideo);
  }

  function destroy(scope) {
    roots(scope, carouselSelector).forEach(destroyCarousel);
    roots(scope, videoSelector).forEach(function (element) {
      var state = videos.get(element);
      if (!state) return;
      state.destroyed = true;
      state.video.pause();
      unlisten(state);
      if (observer) observer.unobserve(element);
      element.classList.remove("is-original-video-playing");
      videos.delete(element);
    });
  }

  function syncAll() {
    carousels.forEach(syncCarousel);
    videos.forEach(syncVideo);
  }

  document.addEventListener("visibilitychange", syncAll);
  document.addEventListener("sideshow:overlaychange", function (event) {
    overlayOpen = Boolean(event.detail && event.detail.open);
    syncAll();
  });
  if (reduced.addEventListener) reduced.addEventListener("change", syncAll);
  else reduced.addListener(syncAll);
  window.addEventListener("resize", function () {
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = null;
      carousels.forEach(function (state) { if (!state.resizeObserver) measure(state); });
      if (!observer) {
        carousels.forEach(function (state) { state.visible = inView(state.element); syncCarousel(state); });
        videos.forEach(function (state) { state.visible = inView(state.element); syncVideo(state); });
      }
    });
  }, { passive: true });
  if (!observer) window.addEventListener("scroll", function () {
    carousels.forEach(function (state) { state.visible = inView(state.element); syncCarousel(state); });
    videos.forEach(function (state) { state.visible = inView(state.element); syncVideo(state); });
  }, { passive: true });
  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) { destroy(event.target); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  else init(document);
}());
