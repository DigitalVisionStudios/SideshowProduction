/* Native artwork scrolling with accessible controls and deliberate drag behavior. */
(function () {
  "use strict";
  if (window.SideshowCarousel && window.SideshowCarousel.init) {
    window.SideshowCarousel.init(document);
    return;
  }

  var instances = new Map();
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function focusWithoutScroll(element) {
    if (!element) return;
    try { element.focus({ preventScroll: true }); } catch (error) { element.focus(); }
  }

  function leftPosition(state) {
    return clamp(state.track.scrollLeft, 0, state.maximum);
  }

  function visibleRange(state) {
    var left = leftPosition(state);
    var right = left + state.track.clientWidth;
    var first = 0;
    var last = state.slides.length - 1;
    for (var index = 0; index < state.positions.length; index += 1) {
      if (state.positions[index] + state.widths[index] > left + 2) {
        first = index;
        break;
      }
    }
    for (var reverse = state.positions.length - 1; reverse >= 0; reverse -= 1) {
      if (state.positions[reverse] < right - 2) {
        last = reverse;
        break;
      }
    }
    return { first: first, last: Math.max(first, last) };
  }

  function update(state, announce) {
    if (!state.root.isConnected || !state.slides.length) return;
    var left = leftPosition(state);
    var canScroll = state.maximum > 2;
    state.controls.hidden = !canScroll;
    state.previous.disabled = !canScroll || left <= 2;
    state.next.disabled = !canScroll || left >= state.maximum - 2;

    var range = visibleRange(state);
    state.range = range;
    var label = pad(range.first + 1);
    if (range.last !== range.first) label += "–" + pad(range.last + 1);
    state.counter.textContent = label + " / " + pad(state.slides.length);
    var selected = range.first;
    if (left - state.positions[selected] > state.widths[selected] / 2) selected = Math.min(selected + 1, state.slides.length - 1);
    state.thumbnails.forEach(function (button) {
      button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-carousel-goto")) === selected));
    });

    var fraction = canScroll ? clamp(state.track.clientWidth / state.track.scrollWidth, 0.04, 1) : 1;
    state.progress.style.width = (fraction * 100).toFixed(4) + "%";
    var travel = state.progress.parentElement.clientWidth * (1 - fraction);
    var offset = canScroll ? travel * (left / state.maximum) : 0;
    state.progress.style.transform = "translate3d(" + offset.toFixed(2) + "px,0,0)";

    if (announce) {
      var message = "Showing " + state.itemName + " " + (range.first + 1);
      if (range.last !== range.first) message += " through " + (range.last + 1);
      state.status.textContent = message + " of " + state.slides.length + ".";
    }
  }

  function scheduleUpdate(state, announce) {
    if (!state.frame) {
      state.frame = window.requestAnimationFrame(function () {
        state.frame = null;
        update(state, false);
      });
    }
    if (announce) {
      window.clearTimeout(state.settleTimer);
      state.settleTimer = window.setTimeout(function () {
        state.targetLeft = null;
        update(state, true);
      }, 150);
    }
  }

  function measure(state) {
    if (!state.root.isConnected || !state.track.clientWidth) return;
    state.maximum = Math.max(0, state.track.scrollWidth - state.track.clientWidth);
    state.positions = state.slides.map(function (slide) { return slide.offsetLeft; });
    state.widths = state.slides.map(function (slide) { return slide.offsetWidth; });
    state.points = [];
    state.positions.forEach(function (position) {
      var bounded = clamp(position, 0, state.maximum);
      var previous = state.points[state.points.length - 1];
      if (previous === undefined || Math.abs(previous - bounded) > 2) state.points.push(bounded);
    });
    if (!state.points.length) state.points.push(0);
    if (state.maximum - state.points[state.points.length - 1] > 2) state.points.push(state.maximum);
    state.targetLeft = null;
    update(state, false);
  }

  function scrollTo(state, left, focusIndex) {
    var target = clamp(left, 0, state.maximum);
    state.targetLeft = target;
    if (focusIndex !== undefined) {
      var slide = state.slides[focusIndex];
      focusWithoutScroll(slide && slide.querySelector("button, a[href], [tabindex]"));
    }
    if (typeof state.track.scrollTo === "function") {
      state.track.scrollTo({ left: target, behavior: motion.matches ? "auto" : "smooth" });
    } else {
      state.track.scrollLeft = target;
    }
    scheduleUpdate(state, true);
  }

  function navigate(state, direction) {
    var position = state.targetLeft === null ? leftPosition(state) : state.targetLeft;
    var target = null;
    if (direction > 0) {
      for (var next = 0; next < state.points.length; next += 1) {
        if (state.points[next] > position + 2) {
          target = state.points[next];
          break;
        }
      }
    } else {
      for (var previous = state.points.length - 1; previous >= 0; previous -= 1) {
        if (state.points[previous] < position - 2) {
          target = state.points[previous];
          break;
        }
      }
    }
    if (target !== null) scrollTo(state, target);
  }

  function closestPoint(state) {
    var left = leftPosition(state);
    return state.points.reduce(function (best, point) {
      return Math.abs(point - left) < Math.abs(best - left) ? point : best;
    }, state.points[0] || 0);
  }

  function finishGesture(state, event) {
    var gesture = state.gesture;
    if (!gesture || (event && event.pointerId !== undefined && event.pointerId !== gesture.pointerId)) return;
    state.gesture = null;
    var target = gesture.dragging ? closestPoint(state) : null;
    if (gesture.dragging || gesture.horizontalMove) state.blockClickUntil = performance.now() + 500;
    state.track.classList.remove("is-dragging");
    try {
      if (state.track.hasPointerCapture && state.track.hasPointerCapture(gesture.pointerId)) {
        state.track.releasePointerCapture(gesture.pointerId);
      }
    } catch (error) { /* A canceled pointer may already have released capture. */ }
    if (target !== null) scrollTo(state, target);
    else scheduleUpdate(state, true);
  }

  function onPointerDown(state, event) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || state.maximum <= 2) return;
    state.targetLeft = null;
    state.gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: leftPosition(state),
      dragging: false,
      horizontalMove: false
    };
  }

  function onPointerMove(state, event) {
    var gesture = state.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    var distanceX = event.clientX - gesture.startX;
    var distanceY = event.clientY - gesture.startY;
    if (Math.abs(distanceX) > 9 && Math.abs(distanceX) > Math.abs(distanceY)) {
      gesture.horizontalMove = true;
    }
    if (gesture.pointerType !== "mouse") {
      if (gesture.horizontalMove) state.blockClickUntil = performance.now() + 500;
      return;
    }
    if (!gesture.dragging) {
      if (Math.abs(distanceY) > 12 && Math.abs(distanceY) > Math.abs(distanceX) * 1.2) {
        state.gesture = null;
        return;
      }
      if (!gesture.horizontalMove) return;
      gesture.dragging = true;
      state.track.classList.add("is-dragging");
      try { state.track.setPointerCapture(gesture.pointerId); } catch (error) { /* Window listeners retain the drag. */ }
    }
    event.preventDefault();
    state.track.scrollLeft = gesture.startScroll - distanceX;
    state.blockClickUntil = performance.now() + 500;
  }

  function onKeyDown(state, event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) === -1) return;
    var slide = event.target.closest("[data-carousel-slide]");
    var current = slide ? state.slides.indexOf(slide) : visibleRange(state).first;
    if (current < 0) current = 0;
    var target = current;
    if (event.key === "ArrowRight") target = Math.min(state.slides.length - 1, current + 1);
    if (event.key === "ArrowLeft") target = Math.max(0, current - 1);
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = state.slides.length - 1;
    event.preventDefault();
    event.stopPropagation();
    scrollTo(state, state.positions[target], target);
  }

  function setup(root) {
    if (instances.has(root)) {
      measure(instances.get(root));
      return;
    }
    var track = root.querySelector("[data-carousel-track]");
    var controls = root.querySelector("[data-carousel-controls]");
    var previous = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    var progress = root.querySelector("[data-carousel-progress]");
    var counter = root.querySelector("[data-carousel-counter]");
    var status = root.querySelector("[data-carousel-status]");
    if (!track || !controls || !previous || !next || !progress || !counter || !status) return;
    var slides = Array.prototype.slice.call(track.querySelectorAll("[data-carousel-slide]"));
    if (!slides.length) return;

    var controller = new AbortController();
    var state = {
      root: root, track: track, controls: controls, previous: previous, next: next,
      progress: progress, counter: counter, status: status, slides: slides,
      itemName: root.getAttribute("data-carousel-item-name") || "artwork",
      thumbnails: Array.prototype.slice.call(root.querySelectorAll("[data-carousel-goto]")),
      controller: controller, observer: null, maximum: 0, positions: [], widths: [], points: [0],
      frame: null, settleTimer: null, gesture: null, blockClickUntil: 0, targetLeft: null, range: null,
      entranceObserver: null, entranceFrame: null
    };
    instances.set(root, state);
    root.classList.add("is-carousel-ready");
    slides.forEach(function (slide) {
      slide.querySelectorAll("img").forEach(function (image) { image.draggable = false; });
    });

    function enter() {
      root.classList.add("sp-carousel-has-entered");
      if (state.entranceObserver) state.entranceObserver.disconnect();
      state.entranceObserver = null;
    }
    if (!motion.matches && "IntersectionObserver" in window && !(window.Shopify && window.Shopify.designMode)) {
      slides.forEach(function (slide, index) { slide.style.setProperty("--sp-slide-delay", Math.min(index, 3) * 85 + "ms"); });
      root.classList.add("sp-carousel-reveal-ready");
      state.entranceObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          state.entranceFrame = window.requestAnimationFrame(enter);
        }
      }, { threshold: .06, rootMargin: "0px 0px -28px 0px" });
      state.entranceObserver.observe(root);
    } else enter();

    function listen(target, type, listener, options) {
      target.addEventListener(type, listener, Object.assign({}, options || {}, { signal: controller.signal }));
    }
    listen(root, "focusin", enter);
    listen(previous, "click", function () { if (!previous.disabled) navigate(state, -1); });
    listen(next, "click", function () { if (!next.disabled) navigate(state, 1); });
    state.thumbnails.forEach(function (button) {
      listen(button, "click", function () {
        var index = Number(button.getAttribute("data-carousel-goto"));
        if (Number.isInteger(index) && index >= 0 && index < state.slides.length) scrollTo(state, state.positions[index]);
      });
    });
    listen(track, "scroll", function () { scheduleUpdate(state, true); }, { passive: true });
    listen(track, "wheel", function () { state.targetLeft = null; }, { passive: true });
    listen(track, "keydown", function (event) { onKeyDown(state, event); });
    listen(track, "pointerdown", function (event) { onPointerDown(state, event); }, { passive: true });
    listen(window, "pointermove", function (event) { onPointerMove(state, event); }, { passive: false });
    listen(window, "pointerup", function (event) { finishGesture(state, event); }, { passive: true });
    listen(window, "pointercancel", function (event) { finishGesture(state, event); }, { passive: true });
    listen(window, "blur", function () { finishGesture(state); });
    listen(track, "lostpointercapture", function (event) { finishGesture(state, event); });
    listen(track, "dragstart", function (event) { event.preventDefault(); });
    listen(track, "click", function (event) {
      if (event.detail !== 0 && performance.now() < state.blockClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.blockClickUntil = 0;
      }
    }, { capture: true });

    if ("ResizeObserver" in window) {
      state.observer = new ResizeObserver(function () { measure(state); });
      state.observer.observe(track);
    } else {
      listen(window, "resize", function () { measure(state); }, { passive: true });
    }
    measure(state);
  }

  function teardown(root) {
    var state = instances.get(root);
    if (!state) return;
    state.controller.abort();
    if (state.observer) state.observer.disconnect();
    if (state.entranceObserver) state.entranceObserver.disconnect();
    if (state.entranceFrame) window.cancelAnimationFrame(state.entranceFrame);
    if (state.frame) window.cancelAnimationFrame(state.frame);
    window.clearTimeout(state.settleTimer);
    state.track.classList.remove("is-dragging");
    state.root.classList.remove("is-carousel-ready");
    state.root.classList.remove("sp-carousel-reveal-ready", "sp-carousel-has-entered");
    state.controls.hidden = true;
    instances.delete(root);
  }

  function init(scope) {
    scope = scope || document;
    if (scope.nodeType === 1 && scope.matches("[data-sp-carousel]")) setup(scope);
    scope.querySelectorAll("[data-sp-carousel]").forEach(setup);
  }

  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) {
    instances.forEach(function (state, root) {
      if (event.target === root || event.target.contains(root)) teardown(root);
    });
  });
  window.SideshowCarousel = { init: init };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  } else {
    init(document);
  }
})();
