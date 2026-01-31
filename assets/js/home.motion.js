/* =========================================================
   Khonsu Socials — home.motion.js (HOME ONLY)
   Hybrid motion:
   - Desktop only (hover + fine pointer)
   - Updates CSS vars: --mx --my --rx --ry on [data-home-motion]
   - Respects prefers-reduced-motion
========================================================= */
(function () {
  "use strict";

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function canRun() {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function initCard(card) {
    // Defaults
    card.style.setProperty("--mx", "50%");
    card.style.setProperty("--my", "42%");
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");

    var raf = 0;
    var lastX = 0.5;
    var lastY = 0.42;

    function apply(x, y) {
      // x,y in [0..1]
      var xp = clamp(x, 0, 1);
      var yp = clamp(y, 0, 1);

      lastX = xp;
      lastY = yp;

      // Spotlight position
      card.style.setProperty("--mx", (xp * 100).toFixed(2) + "%");
      card.style.setProperty("--my", (yp * 100).toFixed(2) + "%");

      // Tilt (strong, but controlled)
      var MAX_TILT = 9; // degrees
      var rx = (0.5 - yp) * MAX_TILT;
      var ry = (xp - 0.5) * MAX_TILT;

      card.style.setProperty("--rx", rx.toFixed(2) + "deg");
      card.style.setProperty("--ry", ry.toFixed(2) + "deg");
    }

    function onMove(ev) {
      // throttle with rAF
      var rect = card.getBoundingClientRect();
      var x = (ev.clientX - rect.left) / rect.width;
      var y = (ev.clientY - rect.top) / rect.height;

      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        apply(x, y);
      });
    }

    function onLeave() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;

      // smooth reset
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "42%");
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }

    card.addEventListener("pointermove", onMove, { passive: true });
    card.addEventListener("pointerleave", onLeave, { passive: true });
    card.addEventListener("blur", onLeave, { passive: true });

    // If tab becomes hidden, reset so it doesn't "freeze" mid-tilt
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) onLeave();
    });

    // Initial
    apply(lastX, lastY);
  }

  function init() {
    if (!canRun()) return;
    var cards = document.querySelectorAll("[data-home-motion]");
    if (!cards || !cards.length) return;
    cards.forEach(initCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();