/* A client-side inspiration wheel. No charge, prize, or appointment is created. */
(function () {
  "use strict";
  if (window.SideshowWheel) { window.SideshowWheel.init(document); return; }
  var instances = new Map();
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function safeImage(value) {
    try { var url = new URL(value, document.baseURI); return /^https?:$/.test(url.protocol) ? url.href : null; } catch (error) { return null; }
  }
  function finish(state) {
    if (state.pending === null) return;
    window.clearTimeout(state.timer);
    state.timer = null;
    var index = state.pending;
    var item = state.pool[index];
    state.pending = null;
    state.index = index;
    state.image.src = item.image;
    state.image.alt = item.title;
    state.photo.setAttribute("data-lightbox-src", item.image);
    state.photo.setAttribute("data-lightbox-alt", item.title);
    state.photo.setAttribute("aria-label", "Enlarge: " + item.title);
    state.title.textContent = item.title;
    state.status.textContent = "Design " + (index + 1) + " of " + state.pool.length + ". Take a closer look, or spin again.";
    state.root.classList.remove("is-spinning");
    state.root.removeAttribute("aria-busy");
    state.button.disabled = false;
    state.buttonText.textContent = "AGAIN";
    state.button.setAttribute("aria-label", "Spin the wheel again");
  }
  function spin(state) {
    if (state.pending !== null || !state.pool.length) return;
    var index = Math.floor(Math.random() * state.pool.length);
    if (state.pool.length > 1 && index === state.index) index = (index + 1 + Math.floor(Math.random() * (state.pool.length - 1))) % state.pool.length;
    state.pending = index;
    state.button.disabled = true;
    state.buttonText.textContent = "SPIN";
    state.root.classList.add("is-spinning");
    state.root.setAttribute("aria-busy", "true");
    state.status.textContent = "Spinning the wheel…";
    var desired = 360 - (index + .5) * (360 / state.pool.length);
    state.rotation += (motion.matches ? 0 : 1440) + ((desired - (state.rotation % 360) + 360) % 360);
    state.rotor.style.transform = "rotate(" + state.rotation + "deg)";
    var nextImage = new Image();
    nextImage.src = state.pool[index].image;
    if (motion.matches) finish(state);
    else state.timer = window.setTimeout(function () { finish(state); }, 4300);
  }
  function setup(root) {
    if (instances.has(root)) return;
    var data = root.querySelector("[data-wheel-pool]");
    var button = root.querySelector("[data-wheel-spin]");
    if (!data || !button) return;
    var pool;
    try {
      pool = JSON.parse(data.textContent).map(function (item) {
        return { image: safeImage(item.image), title: String(item.title || "A design from Sideshow").slice(0,200) };
      });
      if (!pool.length || pool.some(function (item) { return !item.image; })) return;
    } catch (error) { return; }
    var state = {
      root:root, pool:pool, button:button, buttonText:button.querySelector("[data-wheel-button-text]"),
      rotor:root.querySelector("[data-wheel-rotor]"), image:root.querySelector("[data-wheel-image]"),
      photo:root.querySelector("[data-wheel-photo]"), title:root.querySelector("[data-wheel-title]"),
      status:root.querySelector("[data-wheel-status]"), rotation:0, index:-1, pending:null, timer:null,
      controller:new AbortController()
    };
    if (!state.rotor || !state.image || !state.photo || !state.title || !state.status || !state.buttonText) return;
    instances.set(root,state);
    button.disabled = false;
    button.addEventListener("click", function () { spin(state); }, {signal:state.controller.signal});
  }
  function init(scope) {
    if (scope.matches && scope.matches("[data-sp-wheel]")) setup(scope);
    scope.querySelectorAll("[data-sp-wheel]").forEach(setup);
  }
  function changed(event) {
    if (!event.matches) return;
    instances.forEach(function (state) { finish(state); });
  }
  if (motion.addEventListener) motion.addEventListener("change",changed);
  else motion.addListener(changed);
  document.addEventListener("shopify:section:load",function (event) { init(event.target); });
  document.addEventListener("shopify:section:unload",function (event) {
    instances.forEach(function (state,root) {
      if (!event.target.contains(root)) return;
      window.clearTimeout(state.timer);
      state.controller.abort();
      instances.delete(root);
    });
  });
  window.SideshowWheel={init:init};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",function () { init(document); },{once:true});
  else init(document);
})();
