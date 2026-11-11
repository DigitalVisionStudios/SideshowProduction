/* Sideshow Productions: progressive storefront interactions. */
(function () {
  "use strict";
  if (window.SideshowStudio && window.SideshowStudio.init) {
    window.SideshowStudio.init(document);
    return;
  }

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var desktop = window.matchMedia("(min-width: 1001px)");
  var revealed = new WeakSet();
  var observed = new Set();
  var rouletteStates = new WeakMap();
  var observer = null;
  var expiryTimer = null;
  var scrollPending = false;
  var heroMedia = new Set();
  var heroVideos = new Map();
  var videoObserver = null;
  var previewBar = null;
  var previewResizeObserver = null;
  var pageActive = true;
  var lightbox = null;
  var lightboxImage = null;
  var lightboxCaption = null;
  var lightboxCounter = null;
  var lightboxPrevious = null;
  var lightboxNext = null;
  var lightboxOpener = null;
  var lightboxItems = [];
  var lightboxIndex = 0;

  function elements(scope, selector) {
    var found = Array.prototype.slice.call(scope.querySelectorAll(selector));
    if (scope.nodeType === 1 && scope.matches(selector)) found.unshift(scope);
    return found;
  }

  function focusElement(element) {
    if (!element || !element.isConnected) return;
    try { element.focus({ preventScroll: true }); } catch (error) { element.focus(); }
  }

  function imageURL(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      var url = new URL(value, document.baseURI);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (error) {
      return null;
    }
  }

  var menuStates = new Map();
  var activeMenu = null;
  var menuScrollLock = null;

  function menuFor(toggle) {
    var id = toggle.getAttribute("aria-controls");
    return id ? document.getElementById(id) : document.querySelector("[data-mobile-menu]");
  }

  function saveStyles(element, names) {
    return names.map(function (name) {
      return { name: name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) };
    });
  }

  function restoreStyles(element, saved) {
    saved.forEach(function (item) {
      if (item.value) element.style.setProperty(item.name, item.value, item.priority);
      else element.style.removeProperty(item.name);
    });
  }

  function lockMenuScroll() {
    if (menuScrollLock) return;
    var body = document.body;
    var root = document.documentElement;
    var scrollbar = Math.max(0, window.innerWidth - root.clientWidth);
    menuScrollLock = {
      x: window.scrollX || 0,
      y: window.scrollY || window.pageYOffset || 0,
      body: saveStyles(body, ["position", "top", "left", "right", "width", "overflow", "padding-right", "box-sizing"]),
      root: saveStyles(root, ["overflow", "scroll-behavior"])
    };
    var padding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    root.style.setProperty("overflow", "hidden");
    root.style.setProperty("scroll-behavior", "auto", "important");
    body.style.setProperty("box-sizing", "border-box");
    body.style.setProperty("position", "fixed");
    body.style.setProperty("top", -menuScrollLock.y + "px");
    body.style.setProperty("left", -menuScrollLock.x + "px");
    body.style.setProperty("right", "0");
    body.style.setProperty("width", "100%");
    body.style.setProperty("overflow", "hidden");
    if (scrollbar) body.style.setProperty("padding-right", padding + scrollbar + "px");
    body.classList.add("sp-menu-open");
  }

  function unlockMenuScroll() {
    if (!menuScrollLock) return;
    var saved = menuScrollLock;
    menuScrollLock = null;
    restoreStyles(document.body, saved.body);
    document.body.classList.remove("sp-menu-open");
    // Keep smooth scrolling off until the exact pre-menu position is restored.
    saved.root.forEach(function (item) {
      if (item.name !== "overflow") return;
      if (item.value) document.documentElement.style.setProperty(item.name, item.value, item.priority);
      else document.documentElement.style.removeProperty(item.name);
    });
    window.scrollTo(saved.x, saved.y);
    restoreStyles(document.documentElement, saved.root);
    updateHeader();
  }

  function menuFocusable(state) {
    return Array.prototype.slice.call(state.menu.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (element) {
      return !element.closest("[hidden], [inert]") && element.getClientRects().length > 0;
    });
  }

  function cancelMenuMotion(state) {
    window.cancelAnimationFrame(state.frame);
    window.clearTimeout(state.timer);
    state.frame = null;
    state.timer = null;
  }

  function restoreMenuBackground(state) {
    (state.background || []).forEach(function (item) {
      if (item.inert === null) item.element.removeAttribute("inert");
      else item.element.setAttribute("inert", item.inert);
      if (item.hidden === null) item.element.removeAttribute("aria-hidden");
      else item.element.setAttribute("aria-hidden", item.hidden);
    });
    state.background = [];
  }

  function finishMenuClose(state, restoreFocus) {
    cancelMenuMotion(state);
    var focusWasInside = state.menu.contains(document.activeElement);
    state.open = false;
    state.closing = false;
    state.menu.classList.remove("is-open", "is-closing");
    state.menu.setAttribute("data-menu-state", "closed");
    state.toggle.setAttribute("aria-expanded", "false");
    state.toggle.setAttribute("aria-label", "Open menu");
    state.toggle.classList.remove("is-open");
    if (state.header) state.header.classList.remove("is-menu-open");
    if (activeMenu === state) activeMenu = null;
    if (state.menu.hasAttribute("open")) {
      if (typeof state.menu.close === "function") state.menu.close();
      else state.menu.removeAttribute("open");
    }
    state.menu.hidden = true;
    restoreMenuBackground(state);
    if (!activeMenu) unlockMenuScroll();
    if (restoreFocus) {
      var target = state.toggle;
      if (desktop.matches || !target.getClientRects().length) target = state.header && state.header.querySelector(".sp-brand");
      focusElement(target);
    } else if (desktop.matches && focusWasInside) {
      focusElement(state.header && state.header.querySelector(".sp-nav .is-current, .sp-brand"));
    }
  }

  function initMenus(scope) {
    elements(scope, "[data-menu-toggle]").forEach(function (toggle) {
      var menu = menuFor(toggle);
      if (!menu || menuStates.has(menu)) return;
      var marker = document.createComment("Sideshow mobile menu");
      menu.parentNode.insertBefore(marker, menu);
      var state = {
        menu: menu, toggle: toggle, header: toggle.closest(".sp-header"),
        owner: toggle.closest(".shopify-section") || toggle.parentElement,
        marker: marker, open: false, closing: false, frame: null, timer: null,
        background: [], lastFocus: null, restoreFocus: false
      };
      menuStates.set(menu, state);
      // A body portal also keeps the non-dialog fallback clear of header blur.
      document.body.appendChild(menu);
      menu.hidden = true;
      menu.setAttribute("data-menu-state", "closed");
      menu.querySelectorAll(".sp-menu-enter").forEach(function (item, index) {
        item.style.setProperty("--sp-menu-order", index);
      });
      state.cancel = function (event) {
        event.preventDefault();
        setMenu(toggle, false, true);
      };
      state.close = function () {
        if (!menu.hasAttribute("open") && (state.open || state.closing)) finishMenuClose(state, true);
      };
      state.transition = function (event) {
        if (event.target !== menu || (event.propertyName !== "clip-path" && event.propertyName !== "-webkit-clip-path")) return;
        if (state.closing) finishMenuClose(state, state.restoreFocus);
        else if (state.open) menu.setAttribute("data-menu-state", "open");
      };
      menu.addEventListener("cancel", state.cancel);
      menu.addEventListener("close", state.close);
      menu.addEventListener("transitionend", state.transition);
    });
  }

  function setMenu(toggle, open, restoreFocus, immediate) {
    var menu = menuFor(toggle);
    if (!menu) return;
    if (!menuStates.has(menu)) initMenus(toggle);
    var state = menuStates.get(menu);
    if (!state) return;
    if (open) {
      if (desktop.matches || state.open) return;
      if (activeMenu && activeMenu !== state) finishMenuClose(activeMenu, false);
      var wasVisible = !menu.hidden && menu.hasAttribute("open");
      cancelMenuMotion(state);
      state.open = true;
      state.closing = false;
      state.restoreFocus = false;
      activeMenu = state;
      lockMenuScroll();
      menu.hidden = false;
      menu.classList.remove("is-closing");
      menu.setAttribute("data-menu-state", "opening");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      toggle.classList.add("is-open");
      if (state.header) state.header.classList.add("is-menu-open");
      if (!wasVisible) {
        var scroller = menu.querySelector(".sp-menu-scroll");
        if (scroller) scroller.scrollTop = 0;
        try {
          if (typeof menu.showModal !== "function") throw new Error("Dialog fallback");
          menu.showModal();
        } catch (error) {
          menu.setAttribute("open", "");
          state.background = Array.prototype.slice.call(document.body.children).filter(function (element) {
            return element !== menu && element.tagName !== "SCRIPT" && element.tagName !== "STYLE";
          }).map(function (element) {
            var saved = { element: element, inert: element.getAttribute("inert"), hidden: element.getAttribute("aria-hidden") };
            element.setAttribute("inert", "");
            element.setAttribute("aria-hidden", "true");
            return saved;
          });
        }
      }
      state.lastFocus = menu.querySelector("[data-menu-close]") || menu;
      focusElement(state.lastFocus);
      function revealMenu() {
        if (!state.open) return;
        menu.classList.add("is-open");
        if (reducedMotion.matches) menu.setAttribute("data-menu-state", "open");
        else state.timer = window.setTimeout(function () {
          if (state.open) menu.setAttribute("data-menu-state", "open");
        }, 680);
      }
      if (wasVisible || reducedMotion.matches) revealMenu();
      else state.frame = window.requestAnimationFrame(function () {
        state.frame = window.requestAnimationFrame(revealMenu);
      });
      return;
    }
    if (!state.open && !state.closing) return;
    cancelMenuMotion(state);
    state.open = false;
    state.closing = true;
    state.restoreFocus = !!restoreFocus;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    toggle.classList.remove("is-open");
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    menu.setAttribute("data-menu-state", "closing");
    if (immediate || reducedMotion.matches || desktop.matches) {
      finishMenuClose(state, state.restoreFocus);
    } else {
      var duration = parseFloat(window.getComputedStyle(menu).getPropertyValue("--sp-menu-exit-ms")) || 520;
      state.timer = window.setTimeout(function () { finishMenuClose(state, state.restoreFocus); }, duration + 40);
    }
  }

  function closeMenus(restoreFocus, immediate) {
    menuStates.forEach(function (state) {
      if (state.open || state.closing) setMenu(state.toggle, false, restoreFocus, immediate);
    });
  }

  function trapMenuFocus(event) {
    if (!activeMenu || (!activeMenu.open && !activeMenu.closing)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(activeMenu.toggle, false, true);
      return;
    }
    if (event.key !== "Tab") return;
    var items = menuFocusable(activeMenu);
    var first = items[0] || activeMenu.menu;
    var last = items[items.length - 1] || first;
    var inside = activeMenu.menu.contains(document.activeElement);
    if (!inside || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      focusElement(event.shiftKey ? last : first);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      focusElement(first);
    }
  }

  function reveal(element) {
    element.classList.add("is-visible");
    revealed.add(element);
    observed.delete(element);
    if (observer) observer.unobserve(element);
  }

  function ensureObserver() {
    if (observer || reducedMotion.matches || !("IntersectionObserver" in window)) return;
    try {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) reveal(entry.target);
        });
      }, { threshold: 0.06, rootMargin: "0px 0px -36px 0px" });
    } catch (error) {
      observer = null;
    }
  }

  function initReveals(scope) {
    ensureObserver();
    elements(scope, "[data-reveal]").forEach(function (element) {
      if (revealed.has(element)) return;
      if (!observer || reducedMotion.matches || (window.Shopify && window.Shopify.designMode)) {
        reveal(element);
        return;
      }
      var bounds = element.getBoundingClientRect();
      if (bounds.top < window.innerHeight - 36 && bounds.bottom > 0) {
        reveal(element);
        return;
      }
      var siblings = Array.prototype.filter.call(element.parentElement.children, function (sibling) {
        return sibling.hasAttribute("data-reveal");
      });
      var stagger = Math.min(240, Math.max(0, siblings.indexOf(element)) * 65);
      element.style.setProperty("--sp-reveal-delay", stagger + "ms");
      try {
        observer.observe(element);
        observed.add(element);
        element.classList.add("sp-reveal-ready");
      } catch (error) {
        reveal(element);
      }
    });
  }

  function expiryCheck() {
    window.clearTimeout(expiryTimer);
    var now = Date.now();
    var next = null;
    document.querySelectorAll("[data-expires]").forEach(function (element) {
      var expires = Date.parse(element.getAttribute("data-expires"));
      if (!Number.isFinite(expires)) return;
      if (expires <= now) {
        element.hidden = true;
      } else if (next === null || expires < next) {
        next = expires;
      }
    });
    if (next !== null) {
      expiryTimer = window.setTimeout(expiryCheck, Math.min(Math.max(next - now + 50, 1000), 86400000));
    }
  }

  function initGalleries(scope) {
    elements(scope, "[data-gallery]").forEach(function (gallery) {
      if (!gallery.querySelector("[data-gallery-status]")) {
        var status = document.createElement("p");
        status.className = "sp-sr-only";
        status.setAttribute("data-gallery-status", "");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        gallery.appendChild(status);
      }
    });
  }

  function filterGallery(button) {
    var gallery = button.closest("[data-gallery]");
    if (!gallery) return;
    var selected = (button.getAttribute("data-filter") || "all").toLowerCase();
    gallery.setAttribute("data-filter-active", selected);
    var count = 0;
    gallery.querySelectorAll("[data-filter]").forEach(function (control) {
      if (control.closest("[data-gallery]") === gallery) {
        control.setAttribute("aria-pressed", String(control === button));
      }
    });
    gallery.querySelectorAll(".sp-work[data-category]").forEach(function (item) {
      if (item.closest("[data-gallery]") !== gallery) return;
      var categories = (item.getAttribute("data-category") || "").toLowerCase().split(/[\s,|]+/);
      var visible = selected === "all" || categories.indexOf(selected) !== -1;
      item.hidden = !visible;
      if (visible) {
        count += 1;
        if (item.hasAttribute("data-reveal")) reveal(item);
      }
    });
    var status = gallery.querySelector("[data-gallery-status]");
    if (status) status.textContent = count + (count === 1 ? " piece shown." : " pieces shown.");
  }

  function makeButton(label, className) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className || "";
    button.textContent = label;
    return button;
  }

  function makeIcon(name) {
    var paths = {
      "arrow-up-right": "M6 18 18 6M6 6h12v12",
      "arrow-right": "M4 12h16m-6-6 6 6-6 6",
      "arrow-left": "M20 12H4m6-6-6 6 6 6",
      "arrow-down": "M12 4v16m-6-6 6 6 6-6",
      "chevron": "m6 9 6 6 6-6",
      "refresh": "M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M8 16H3v5",
      "close": "m6 6 12 12M18 6 6 18"
    };
    var namespace = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(namespace, "svg");
    var attributes = {
      "class": "sp-icon",
      "viewBox": "0 0 24 24",
      "width": "20",
      "height": "20",
      "fill": "none",
      "stroke": "currentColor",
      "stroke-width": "1.65",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      "focusable": "false"
    };
    Object.keys(attributes).forEach(function (key) { svg.setAttribute(key, attributes[key]); });
    var shape = document.createElementNS(namespace, "path");
    shape.setAttribute("d", paths[name] || paths["arrow-up-right"]);
    svg.appendChild(shape);
    return svg;
  }

  function lightboxCleanup() {
    document.body.classList.remove("sp-lightbox-open");
    focusElement(lightboxOpener);
    lightboxOpener = null;
  }

  function closeLightbox() {
    if (!lightbox || !lightbox.hasAttribute("open")) return;
    if (typeof lightbox.close === "function") {
      lightbox.close();
    } else {
      lightbox.removeAttribute("open");
      lightboxCleanup();
    }
  }

  function createLightbox() {
    if (lightbox) return;
    lightbox = document.createElement("dialog");
    lightbox.className = "sp-lightbox";
    lightbox.setAttribute("aria-label", "Artwork viewer");
    lightbox.setAttribute("aria-modal", "true");

    var top = document.createElement("div");
    top.className = "sp-lightbox-top";
    var label = document.createElement("p");
    label.textContent = "Selected work / Sideshow Productions";
    var close = makeButton("Close", "sp-lightbox-close");
    close.appendChild(makeIcon("close"));
    close.setAttribute("aria-label", "Close artwork viewer");
    close.addEventListener("click", closeLightbox);
    top.append(label, close);

    var content = document.createElement("div");
    content.className = "sp-lightbox-content";
    lightboxImage = document.createElement("img");
    lightboxImage.decoding = "async";
    content.appendChild(lightboxImage);

    var bottom = document.createElement("div");
    bottom.className = "sp-lightbox-bottom";
    lightboxCaption = document.createElement("p");
    lightboxCaption.className = "sp-lightbox-caption";
    lightboxCaption.setAttribute("aria-live", "polite");
    var controls = document.createElement("div");
    controls.className = "sp-lightbox-controls";
    lightboxPrevious = makeButton("", "sp-lightbox-previous");
    lightboxPrevious.appendChild(makeIcon("arrow-left"));
    lightboxPrevious.setAttribute("aria-label", "Previous artwork");
    lightboxNext = makeButton("", "sp-lightbox-next");
    lightboxNext.appendChild(makeIcon("arrow-right"));
    lightboxNext.setAttribute("aria-label", "Next artwork");
    lightboxCounter = document.createElement("span");
    lightboxCounter.className = "sp-lightbox-counter";
    lightboxCounter.setAttribute("aria-hidden", "true");
    lightboxPrevious.addEventListener("click", function () { moveLightbox(-1); });
    lightboxNext.addEventListener("click", function () { moveLightbox(1); });
    controls.append(lightboxPrevious, lightboxCounter, lightboxNext);
    bottom.append(lightboxCaption, controls);
    lightbox.append(top, content, bottom);
    document.body.appendChild(lightbox);

    lightbox.addEventListener("close", lightboxCleanup);
    lightbox.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeLightbox();
    });
    lightbox.addEventListener("click", function (event) {
      if (event.target !== lightbox) return;
      var bounds = lightbox.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) closeLightbox();
    });
  }

  function showLightboxItem() {
    var item = lightboxItems[lightboxIndex];
    if (!item) return;
    var url = imageURL(item.getAttribute("data-lightbox-src"));
    if (!url) return;
    var originalImage = item.querySelector("img");
    var alt = item.getAttribute("data-lightbox-alt") ||
      (originalImage && originalImage.alt) || "Artwork from Sideshow Productions";
    lightboxImage.src = url;
    lightboxImage.alt = alt;
    lightboxCaption.textContent = alt;
    lightboxCounter.textContent = (lightboxIndex + 1) + " / " + lightboxItems.length;
    lightboxPrevious.hidden = lightboxItems.length < 2;
    lightboxNext.hidden = lightboxItems.length < 2;
  }

  function moveLightbox(direction) {
    if (lightboxItems.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxItems.length) % lightboxItems.length;
    showLightboxItem();
  }

  function openLightbox(trigger) {
    if (!imageURL(trigger.getAttribute("data-lightbox-src"))) return;
    createLightbox();
    var gallery = trigger.closest("[data-gallery]") || trigger.closest(".sp-gallery-grid") || trigger.parentElement;
    lightboxItems = Array.prototype.slice.call(gallery.querySelectorAll("[data-lightbox-src]")).filter(function (item) {
      return !item.closest("[hidden]") && imageURL(item.getAttribute("data-lightbox-src"));
    });
    lightboxIndex = lightboxItems.indexOf(trigger);
    if (lightboxIndex < 0) {
      lightboxItems = [trigger];
      lightboxIndex = 0;
    }
    lightboxOpener = trigger;
    showLightboxItem();
    document.body.classList.add("sp-lightbox-open");
    try {
      if (typeof lightbox.showModal === "function") lightbox.showModal();
      else lightbox.setAttribute("open", "");
      focusElement(lightbox.querySelector(".sp-lightbox-close"));
    } catch (error) {
      document.body.classList.remove("sp-lightbox-open");
    }
  }

  function initRoulette(scope) {
    elements(scope, ".sp-roulette-panel").forEach(function (panel) {
      if (rouletteStates.has(panel)) return;
      var data = panel.querySelector("script[data-flash-pool]");
      var button = panel.querySelector("[data-spin]");
      if (!data || !button) return;
      try {
        var raw = JSON.parse(data.textContent);
        var pool = Array.isArray(raw) ? raw.filter(function (item) {
          return item && imageURL(item.image);
        }) : [];
        rouletteStates.set(panel, { pool: pool, index: -1, timer: null });
        button.disabled = pool.length === 0;
      } catch (error) {
        button.disabled = true;
      }
    });
  }

  function initContactContext(scope) {
    elements(scope, "form#StudioContactForm").forEach(function (form) {
      if (form.hasAttribute("data-sp-context-ready")) return;
      form.setAttribute("data-sp-context-ready", "");
      var parameters = new URLSearchParams(window.location.search);
      var notes = [];
      [
        { query: "artist", field: "requested_artist" },
        { query: "item", field: "requested_item" }
      ].forEach(function (context) {
        var value = (parameters.get(context.query) || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
        if (!value) return;
        var field = document.createElement("input");
        field.type = "hidden";
        field.name = "contact[" + context.field + "]";
        field.value = value;
        form.appendChild(field);
        notes.push(value);
      });
      if (notes.length) {
        var note = document.createElement("p");
        note.className = "sp-form-context";
        note.textContent = "About: " + notes.join(" / ");
        form.insertBefore(note, form.firstChild);
      }
    });
  }

  function spinDesign(button) {
    var panel = button.closest(".sp-roulette-panel");
    var state = panel && rouletteStates.get(panel);
    if (!state || !state.pool.length || button.disabled) return;
    var index = Math.floor(Math.random() * state.pool.length);
    if (state.pool.length > 1 && index === state.index) index = (index + 1) % state.pool.length;
    state.index = index;
    var image = panel.querySelector(".sp-roulette-image img");
    var result = panel.querySelector("[data-spin-result]");
    var item = state.pool[index];
    button.disabled = true;
    panel.classList.add("is-spinning");
    state.timer = window.setTimeout(function () {
      if (!panel.isConnected) return;
      var title = typeof item.title === "string" && item.title.trim() ?
        item.title.trim() : "Flash idea " + (index + 1);
      if (image) {
        image.src = imageURL(item.image);
        image.alt = title;
      }
      if (result) result.textContent = title + ". Your artist will confirm design availability.";
      panel.classList.remove("is-spinning");
      button.disabled = false;
      state.timer = null;
    }, reducedMotion.matches ? 0 : 200);
  }

  function syncPreviewOffset() {
    if (!document.body) return;
    var bar = document.querySelector(".design-preview");
    if (bar) document.body.style.setProperty("--sp-preview-offset", Math.ceil(bar.getBoundingClientRect().height) + "px");
    else document.body.style.removeProperty("--sp-preview-offset");
  }

  function initPreviewOffset() {
    var bar = document.querySelector(".design-preview");
    if (bar !== previewBar) {
      if (previewResizeObserver) previewResizeObserver.disconnect();
      previewBar = bar;
      if (bar && "ResizeObserver" in window) {
        if (!previewResizeObserver) previewResizeObserver = new ResizeObserver(syncPreviewOffset);
        previewResizeObserver.observe(bar);
      }
    }
    syncPreviewOffset();
  }

  function heroForVideo(video) {
    return video.closest(".sp-hero") || video.parentElement;
  }

  function syncVideoControl(video, state) {
    var playing = !video.paused && !video.ended && !state.unavailable;
    video.classList.toggle("is-playing", playing);
    var media = video.closest(".sp-hero-media");
    if (media) {
      media.classList.toggle("has-playing-video", playing);
      if (video.readyState >= 2 && !state.unavailable) media.classList.add("has-video-ready");
    }
    var hero = heroForVideo(video);
    if (!hero) return;
    hero.querySelectorAll("[data-sp-video-toggle]").forEach(function (button) {
      button.hidden = !!state.unavailable;
      button.type = "button";
      button.setAttribute("aria-pressed", String(!playing));
      button.setAttribute("aria-label", playing ? "Pause background video" : "Play background video");
      button.setAttribute("title", playing ? "Pause background video" : "Play background video");
      button.setAttribute("data-video-state", playing ? "playing" : "paused");
      button.classList.toggle("is-paused", !playing);
      var playIcon = button.querySelector("[data-sp-video-play-icon]");
      var pauseIcon = button.querySelector("[data-sp-video-pause-icon]");
      var label = button.querySelector("[data-sp-video-label]");
      if (playIcon) playIcon.toggleAttribute("hidden", playing);
      if (pauseIcon) pauseIcon.toggleAttribute("hidden", !playing);
      if (label) label.textContent = playing ? "Pause background video" : "Play background video";
    });
  }

  function shouldPlayVideo(state) {
    return pageActive && !document.hidden && state.inView && !state.userPaused &&
      !state.unavailable && (!reducedMotion.matches || state.reducedOptIn);
  }

  function prepareVideoSources(video, state) {
    if (state.sourcesReady) return true;
    var changed = false;
    var directSource = imageURL(video.getAttribute("data-src") || "");
    if (directSource && !video.getAttribute("src")) {
      video.src = directSource;
      changed = true;
    }
    video.querySelectorAll("source[data-src]").forEach(function (source) {
      var url = imageURL(source.getAttribute("data-src") || "");
      if (url && !source.getAttribute("src")) {
        source.src = url;
        changed = true;
      }
    });
    state.sourcesReady = !!video.getAttribute("src") || !!video.querySelector("source[src]");
    if (changed) video.load();
    return state.sourcesReady;
  }

  function updateVideo(video, state, userGesture) {
    if (!video.isConnected || !heroVideos.has(video)) return;
    if (!shouldPlayVideo(state)) {
      video.pause();
      syncVideoControl(video, state);
      return;
    }
    if (state.playPending || (!video.paused && !video.ended)) {
      syncVideoControl(video, state);
      return;
    }
    if (state.playBlocked && !userGesture) {
      syncVideoControl(video, state);
      return;
    }
    if (!prepareVideoSources(video, state)) {
      state.unavailable = true;
      syncVideoControl(video, state);
      return;
    }
    state.playPending = true;
    try {
      var result = video.play();
      if (result && typeof result.then === "function") {
        result.then(function () {
          state.playPending = false;
          state.playBlocked = false;
          if (!heroVideos.has(video) || !shouldPlayVideo(state)) video.pause();
          if (heroVideos.has(video)) syncVideoControl(video, state);
        }).catch(function (error) {
          state.playPending = false;
          state.playBlocked = shouldPlayVideo(state) && (!error || error.name !== "AbortError");
          if (heroVideos.has(video)) {
            syncVideoControl(video, state);
            if (!state.playBlocked && shouldPlayVideo(state)) {
              window.requestAnimationFrame(function () { updateVideo(video, state, false); });
            }
          }
        });
      } else {
        state.playPending = false;
        syncVideoControl(video, state);
      }
    } catch (error) {
      state.playPending = false;
      state.playBlocked = true;
      syncVideoControl(video, state);
    }
  }

  function ensureVideoObserver() {
    if (videoObserver || !("IntersectionObserver" in window)) return;
    try {
      videoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var state = heroVideos.get(entry.target);
          if (!state) return;
          state.inView = entry.isIntersecting && entry.intersectionRatio > 0;
          updateVideo(entry.target, state, false);
        });
      }, { threshold: [0, 0.03] });
    } catch (error) {
      videoObserver = null;
    }
  }

  function initHeroMedia(scope) {
    elements(scope, ".sp-hero-media").forEach(function (media) { heroMedia.add(media); });
    ensureVideoObserver();
    elements(scope, "[data-sp-hero-video]").forEach(function (video) {
      if (heroVideos.has(video)) return;
      var bounds = video.getBoundingClientRect();
      var state = {
        inView: bounds.bottom > 0 && bounds.top < window.innerHeight,
        userPaused: false,
        reducedOptIn: false,
        playPending: false,
        playBlocked: false,
        sourcesReady: false,
        unavailable: false,
        listeners: {}
      };
      heroVideos.set(video, state);
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;
      video.removeAttribute("autoplay");
      ["loadeddata", "playing", "pause", "ended"].forEach(function (type) {
        state.listeners[type] = function () { syncVideoControl(video, state); };
        video.addEventListener(type, state.listeners[type]);
      });
      state.listeners.error = function () {
        state.unavailable = true;
        video.pause();
        syncVideoControl(video, state);
      };
      video.addEventListener("error", state.listeners.error);
      if (videoObserver) videoObserver.observe(video);
      updateVideo(video, state, false);
    });
  }

  function toggleHeroVideo(button) {
    var hero = button.closest(".sp-hero") || button.closest("section");
    var video = hero && hero.querySelector("[data-sp-hero-video]");
    var state = video && heroVideos.get(video);
    if (!state || state.unavailable) return;
    state.userPaused = !video.paused && !video.ended;
    if (!state.userPaused) {
      state.playBlocked = false;
      state.reducedOptIn = true;
      var bounds = video.getBoundingClientRect();
      state.inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    }
    updateVideo(video, state, true);
  }

  function updateHeader() {
    scrollPending = false;
    if (!document.body) return;
    var scrollY = menuScrollLock ? menuScrollLock.y : Math.max(0, window.scrollY || window.pageYOffset || 0);
    var isHome = document.body.classList.contains("sp-home");
    document.body.classList.toggle("sp-scrolled", scrollY > 48);
    document.querySelectorAll(".sp-header").forEach(function (header) {
      header.classList.toggle("is-scrolled", !isHome || scrollY > 48);
    });
    var shift = !reducedMotion.matches && isHome ? Math.min(36, scrollY * 0.08).toFixed(2) + "px" : "0px";
    heroMedia.forEach(function (media) {
      if (!media.isConnected) { heroMedia.delete(media); return; }
      media.style.setProperty("--sp-hero-shift", shift);
    });
    observed.forEach(function (element) {
      if (!element.isConnected) { observed.delete(element); return; }
      var bounds = element.getBoundingClientRect();
      if (bounds.top < window.innerHeight - 24 && bounds.bottom > 0) reveal(element);
    });
    if (!videoObserver) {
      heroVideos.forEach(function (state, video) {
        var bounds = video.getBoundingClientRect();
        state.inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
        updateVideo(video, state, false);
      });
    }
  }

  function init(scope) {
    if (!document.body || !document.body.classList.contains("sp-site")) return;
    scope = scope || document;
    document.body.classList.add("sp-enhanced");
    initMenus(scope);
    initGalleries(scope);
    initRoulette(scope);
    initContactContext(scope);
    initHeroMedia(scope);
    initPreviewOffset();
    initReveals(scope);
    expiryCheck();
    updateHeader();
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var toggle = event.target.closest("[data-menu-toggle]");
    if (toggle) {
      event.preventDefault();
      setMenu(toggle, toggle.getAttribute("aria-expanded") !== "true", false);
      return;
    }
    var menuClose = event.target.closest("[data-menu-close]");
    if (menuClose) {
      event.preventDefault();
      var closingState = menuStates.get(menuClose.closest("[data-mobile-menu]"));
      if (closingState) setMenu(closingState.toggle, false, true);
      return;
    }
    if (event.target.closest("[data-mobile-menu] a")) closeMenus(false);

    var videoToggle = event.target.closest("[data-sp-video-toggle]");
    if (videoToggle) {
      event.preventDefault();
      toggleHeroVideo(videoToggle);
      return;
    }

    var filter = event.target.closest("[data-filter]");
    if (filter) {
      event.preventDefault();
      filterGallery(filter);
      return;
    }
    var artwork = event.target.closest("[data-lightbox-src]");
    if (artwork) {
      event.preventDefault();
      openLightbox(artwork);
      return;
    }
    var spin = event.target.closest("[data-spin]");
    if (spin) {
      event.preventDefault();
      spinDesign(spin);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox && lightbox.hasAttribute("open")) {
      if (event.key === "Escape") { event.preventDefault(); closeLightbox(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); moveLightbox(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveLightbox(1); }
      if (event.key === "Tab") {
        var buttons = Array.prototype.slice.call(lightbox.querySelectorAll("button")).filter(function (button) {
          return !button.hidden && !button.disabled;
        });
        var first = buttons[0];
        var last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); focusElement(last);
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); focusElement(first);
        }
      }
      return;
    }
    trapMenuFocus(event);
  });

  window.addEventListener("scroll", function () {
    if (!scrollPending) {
      scrollPending = true;
      window.requestAnimationFrame(updateHeader);
    }
  }, { passive: true });

  window.addEventListener("resize", function () {
    syncPreviewOffset();
    if (!scrollPending) {
      scrollPending = true;
      window.requestAnimationFrame(updateHeader);
    }
  }, { passive: true });

  document.addEventListener("focusin", function (event) {
    if (!(event.target instanceof Element) || !activeMenu) return;
    if (activeMenu.menu.contains(event.target)) {
      activeMenu.lastFocus = event.target;
    } else {
      focusElement(activeMenu.lastFocus || activeMenu.menu.querySelector("[data-menu-close]") || activeMenu.menu);
    }
  });

  document.addEventListener("visibilitychange", function () {
    heroVideos.forEach(function (state, video) { updateVideo(video, state, false); });
  });

  window.addEventListener("pagehide", function () {
    closeMenus(false, true);
    pageActive = false;
    heroVideos.forEach(function (state, video) { updateVideo(video, state, false); });
  });

  window.addEventListener("pageshow", function () {
    pageActive = true;
    syncPreviewOffset();
    updateHeader();
    heroVideos.forEach(function (state, video) { updateVideo(video, state, false); });
  });

  function desktopChanged(event) {
    if (event.matches) closeMenus(false, true);
  }
  function motionChanged(event) {
    if (event.matches) {
      menuStates.forEach(function (state) {
        if (state.closing) finishMenuClose(state, state.restoreFocus);
        else if (state.open) {
          cancelMenuMotion(state);
          state.menu.classList.add("is-open");
          state.menu.setAttribute("data-menu-state", "open");
        }
      });
      observed.forEach(reveal);
      if (observer) observer.disconnect();
      observer = null;
    }
    heroVideos.forEach(function (state, video) {
      if (event.matches) state.reducedOptIn = false;
      updateVideo(video, state, false);
    });
    updateHeader();
  }
  if (desktop.addEventListener) desktop.addEventListener("change", desktopChanged);
  else if (desktop.addListener) desktop.addListener(desktopChanged);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", motionChanged);
  else if (reducedMotion.addListener) reducedMotion.addListener(motionChanged);

  document.addEventListener("shopify:section:load", function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload", function (event) {
    menuStates.forEach(function (state, menu) {
      if (event.target !== state.owner && !event.target.contains(state.toggle)) return;
      finishMenuClose(state, false);
      menu.removeEventListener("cancel", state.cancel);
      menu.removeEventListener("close", state.close);
      menu.removeEventListener("transitionend", state.transition);
      menu.remove();
      state.marker.remove();
      menuStates.delete(menu);
    });
    observed.forEach(function (element) {
      if (event.target.contains(element)) {
        if (observer) observer.unobserve(element);
        observed.delete(element);
      }
    });
    elements(event.target, ".sp-roulette-panel").forEach(function (panel) {
      var state = rouletteStates.get(panel);
      if (state && state.timer !== null) window.clearTimeout(state.timer);
      rouletteStates.delete(panel);
    });
    elements(event.target, "[data-sp-hero-video]").forEach(function (video) {
      var state = heroVideos.get(video);
      if (!state) return;
      if (videoObserver) videoObserver.unobserve(video);
      video.pause();
      Object.keys(state.listeners).forEach(function (type) { video.removeEventListener(type, state.listeners[type]); });
      heroVideos.delete(video);
    });
    heroMedia.forEach(function (media) { if (event.target.contains(media)) heroMedia.delete(media); });
    if (lightboxOpener && event.target.contains(lightboxOpener)) closeLightbox();
  });

  window.SideshowStudio = { init: init };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  } else {
    init(document);
  }
})();
