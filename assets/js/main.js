/* ==========================================================
  Khonsu Socials — main.js
  FASE 5: Integrasi Google Apps Script
  - createOrder / getStatus (sudah jalan)
  - listServices (baru): tarik paket layanan + harga dari tab Services

  Catatan penting:
  - Karena aturan "1 file per step", UI paket + harga dibuat secara DINAMIS via JS
    (jadi belum perlu ubah order.html/reseller-order.html untuk sekarang).
  - Setelah file ini dipaste, halaman Order & Reseller Order akan punya:
    - Dropdown "Pilih Paket"
    - Input Qty
    - Tampilan harga/estimasi
========================================================== */

(function () {
  "use strict";

  /* =========================
    0) CONFIG (PASTE URL DI SINI)
  ========================= */
  var KS_CONFIG = {
    // BASE URL /exec yang sudah kamu test (health + listServices tembus)
    API_BASE: "https://script.google.com/macros/s/AKfycbxGcBAKfF6vm8qShChVB5poja9Nt3f6QzzdwP913gm3zRh8AzRnX8vzcoOiM32xYunF/exec",
    DEBUG: false
  };

  /* =========================
    1) HELPERS
  ========================= */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(el, evt, fn, opts) { if (el) el.addEventListener(evt, fn, opts || false); }
  function log() { if (KS_CONFIG.DEBUG) console.log.apply(console, arguments); }

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  function nowIso() { return new Date().toISOString(); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function todayStamp() {
    var d = new Date();
    return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }
  function rand4() { return String(Math.floor(Math.random() * 10000)).padStart(4, "0"); }

  function humanDate(iso) {
    if (!iso) return "-";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return (
        d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
        " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes())
      );
    } catch (_) {
      return String(iso);
    }
  }

  function enc(t) { return encodeURIComponent(t || ""); }

  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return (v == null) ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function setText(selOrEl, text) {
    var el = (typeof selOrEl === "string") ? qs(selOrEl) : selOrEl;
    if (el) el.textContent = (text == null ? "" : String(text));
  }

  function setHref(selOrEl, href) {
    var el = (typeof selOrEl === "string") ? qs(selOrEl) : selOrEl;
    if (el) el.setAttribute("href", href);
  }

  function setDisabled(selOrEl, yes) {
    var el = (typeof selOrEl === "string") ? qs(selOrEl) : selOrEl;
    if (!el) return;
    if (yes) {
      el.setAttribute("disabled", "disabled");
      el.classList.add("is-disabled");
    } else {
      el.removeAttribute("disabled");
      el.classList.remove("is-disabled");
    }
  }

  function parseQuery() {
    try {
      var u = new URL(window.location.href);
      var obj = {};
      u.searchParams.forEach(function (v, k) { obj[k] = v; });
      return obj;
    } catch (_) {
      return {};
    }
  }

  function formatIDR(num) {
    var n = Number(num);
    if (!isFinite(n)) return "-";
    try {
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
    } catch (_) {
      // fallback sederhana
      return "Rp " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
  }

  function toNum(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    if (!s) return NaN;
    // hapus pemisah ribuan
    s = s.replace(/[.,](?=\d{3}\b)/g, "");
    // ganti koma jadi titik
    s = s.replace(",", ".");
    var n = Number(s);
    return n;
  }

  function normalizeCategory(s) {
    return String(s || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  /* =========================
    2) GLOBAL UI: THEME + MOTION
  ========================= */
  function preferredTheme() {
    try {
      var saved = localStorage.getItem("lunar-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch (_) {
      return "dark";
    }
  }

  function syncThemeControls(theme) {
    qsa(".nav__theme-toggle").forEach(function (button) {
      var nextLabel = theme === "light" ? "Gunakan tema gelap" : "Gunakan tema terang";
      button.setAttribute("aria-label", nextLabel);
      button.setAttribute("title", nextLabel);
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  }

  function setTheme(theme, persist) {
    var next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    var colorMeta = qs('meta[name="theme-color"]');
    if (colorMeta) colorMeta.setAttribute("content", next === "light" ? "#f6f5f1" : "#0b0e16");
    if (persist) lsSet("lunar-theme", next);
    syncThemeControls(next);
  }

  function initTheme() {
    var initial = document.documentElement.getAttribute("data-theme");
    setTheme(initial === "light" || initial === "dark" ? initial : preferredTheme(), false);
  }

  function initYear() {
    var y = String(new Date().getFullYear());
    qsa("#year").forEach(function (el) { el.textContent = y; });
  }

  function initClickMicro() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest ? t.closest(".btn, .select-card, .card, .portfolio-card, .service-card") : null;
      if (!btn) return;
      btn.classList.add("is-pressed");
      window.setTimeout(function () { btn.classList.remove("is-pressed"); }, 180);
    }, { passive: true });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initHeroEntrance() {
    var els = qsa(".hero__content, .hero__visual, .page-hero > *, .page-hero__content");
    if (!els.length || prefersReducedMotion()) return;

    els.forEach(function (el, index) {
      el.setAttribute("data-hero-motion", "");
      el.style.setProperty("--hero-delay", String(index));
    });

    requestAnimationFrame(function () {
      els.forEach(function (el) { el.classList.add("is-entered"); });
    });
  }

  function initScrollReveal() {
    var isTransactional = !!qs("form, #btnOrderSubmit, #btnResellerSubmit, #btnFindOrder, #joinForm");
    var selectors = isTransactional
      ? "main .section, main > .container, .site-footer .footer"
      : ".section-head, .service-index__item, .featured-work, .project-card, .journey, .faq-list details, .card, .select-card, .info-card, .notice, .portfolio-card, .service-card, .summary-card, .status-panel, .contact, .preview, .site-footer .footer";
    var seen = [];
    var siblingIndex = [];
    var els = qsa(selectors).filter(function (el) {
      if (el.closest(".section--hero, .section--page-hero")) return false;
      if (seen.indexOf(el) >= 0) return false;
      seen.push(el);
      return true;
    });

    els.forEach(function (el) {
      var parent = el.parentElement;
      var entry = siblingIndex.filter(function (item) { return item.parent === parent; })[0];
      var delay = entry ? entry.count++ % 5 : 0;
      if (!entry) siblingIndex.push({ parent: parent, count: 1 });
      el.setAttribute("data-reveal", "");
      el.setAttribute("data-reveal-delay", String(delay));
      el.style.setProperty("--reveal-delay", String(delay));
    });

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-inview"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-inview");
        io.unobserve(entry.target);
      });
    }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.15 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* =========================
    3) PORTFOLIO MODAL (FASE 3)
  ========================= */
  var modalState = { open: false, index: 0, images: [], title: "" };

    function ensureModalStyles() {
    if (qs("#ksModalStyles")) return;
    var style = document.createElement("style");
    style.id = "ksModalStyles";
    style.textContent = ""
      + "#ksModal.ks-modal{position:fixed;inset:0;z-index:99999;display:none;}\n"
      + "#ksModal.ks-modal.is-open{display:block;}\n"
      + "#ksModal .ks-modal__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.78);}\n"
      + "#ksModal .ks-modal__dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,1100px);height:min(88vh,820px);display:flex;flex-direction:column;gap:10px;color:#fff;}\n"
      + "#ksModal .ks-modal__head{display:flex;align-items:center;justify-content:space-between;gap:12px;font:600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}\n"
      + "#ksModal .ks-modal__title{opacity:.95;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n"
      + "#ksModal .ks-modal__counter{opacity:.75;font-weight:500;}\n"
      + "#ksModal .ks-modal__body{flex:1;position:relative;border-radius:18px;overflow:hidden;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;}\n"
      + "#ksModal .ks-modal__img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;}\n"
      + "#ksModal .ks-modal__nav{position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;border:0;cursor:pointer;font-size:22px;font-weight:800;}\n"
      + "#ksModal .ks-modal__nav:hover{background:rgba(255,255,255,.20);}\n"
      + "#ksModal .ks-modal__prev{left:12px;}\n"
      + "#ksModal .ks-modal__next{right:12px;}\n"
      + "#ksModal .ks-modal__close{appearance:none;border:0;cursor:pointer;border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.12);color:#fff;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}\n"
      + "#ksModal .ks-modal__close:hover{background:rgba(255,255,255,.18);}";
    document.head.appendChild(style);
  }

function ensureModal() {
    var existing = qs("#ksModal");
    if (existing) {
      // kalau markup modal lama / beda versi, rebuild biar handler & selector cocok
      if (existing.querySelector("#ksModalImg")) return;
      try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) {}
    }

    ensureModalStyles();

    var wrap = document.createElement("div");
    wrap.id = "ksModal";
    wrap.className = "ks-modal";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="ks-modal__backdrop" data-modal-close="1"></div>' +
      '<div class="ks-modal__dialog" role="dialog" aria-modal="true" aria-label="Gallery">' +
        '<button class="ks-modal__close btn btn--sm btn--ghost" type="button" data-modal-close="1">Tutup</button>' +
        '<div class="ks-modal__head">' +
          '<div class="ks-modal__title" id="ksModalTitle">Gallery</div>' +
          '<div class="ks-modal__count" id="ksModalCount">0/0</div>' +
        '</div>' +
        '<div class="ks-modal__body">' +
          '<button class="ks-modal__nav ks-modal__prev btn btn--sm btn--ghost" type="button" data-modal-prev="1">‹</button>' +
          '<img class="ks-modal__img" id="ksModalImg" alt="Portfolio image" />' +
          '<button class="ks-modal__nav ks-modal__next btn btn--sm btn--ghost" type="button" data-modal-next="1">›</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    on(wrap, "click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.getAttribute("data-modal-close") === "1") closeModal();
      if (t.getAttribute("data-modal-prev") === "1") stepModal(-1);
      if (t.getAttribute("data-modal-next") === "1") stepModal(1);
    });

    on(document, "keydown", function (e) {
      if (!modalState.open) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") stepModal(-1);
      if (e.key === "ArrowRight") stepModal(1);
    });
  }

  function openModal(images, title, startIndex) {
    ensureModal();
    modalState.open = true;
    modalState.images = images || [];
    modalState.title = title || "Gallery";
    modalState.index = Math.max(0, Math.min((startIndex || 0), modalState.images.length - 1));

    var m = qs("#ksModal");
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
    renderModal();
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    var m = qs("#ksModal");
    if (!m) return;
    modalState.open = false;
    m.classList.remove("is-open");
    m.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function stepModal(dir) {
    if (!modalState.open || modalState.images.length === 0) return;
    var next = modalState.index + dir;
    if (next < 0) next = modalState.images.length - 1;
    if (next >= modalState.images.length) next = 0;
    modalState.index = next;
    renderModal();
  }

  function renderModal() {
    var img = qs("#ksModalImg");
    var ttl = qs("#ksModalTitle");
    var cnt = qs("#ksModalCount");
    if (!img || !ttl || !cnt) return;

    var total = modalState.images.length;
    var idx = modalState.index;

    ttl.textContent = modalState.title || "Gallery";
    cnt.textContent = (total ? (idx + 1) + "/" + total : "0/0");
    img.src = total ? modalState.images[idx] : "";
  }

  function buildPortfolioImages(category) {
  category = String(category || "").trim().toLowerCase();
    var base = "/assets/images/portfolio/";
    var list = [];

    if (category === "instagram") {
      for (var i = 1; i <= 9; i++) list.push(base + "instagram/ig-" + pad2(i) + ".jpg");
    } else if (category === "tiktok") {
      for (var j = 1; j <= 11; j++) list.push(base + "tiktok/tt-" + pad2(j) + ".jpg");
    } else if (category === "shopee") {
      for (var k = 1; k <= 6; k++) list.push(base + "shopee/sh-" + pad2(k) + ".jpg");
    }

    return list;
  }

  function initPortfolioModal() {
  // cegah double binding kalau main.js kepanggil lebih dari sekali
  if (window.__KS_GALLERY_BOUND__) return;
  window.__KS_GALLERY_BOUND__ = true;

  function parseImages(raw) {
    return String(raw || "")
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function isPhotoUrl(url) {
    var u = String(url || "").trim();
    if (!u) return false;
    if (u.indexOf("data:") === 0) return false;
    // skip svg/icon
    if (/\.svg(\?|#|$)/i.test(u)) return false;
    // allow common image ext OR allow anything http(s)
    if (/^https?:\/\//i.test(u)) return true;
    return (/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(u));
  }

  function pickScope(triggerEl) {
    if (!triggerEl) return null;
    // kalau kamu mau lebih presisi, bisa set data-gallery-scope="#idContainer"
    var scopeSel = (triggerEl.getAttribute("data-gallery-scope") || "").trim();
    if (scopeSel) {
      try {
        var scoped = document.querySelector(scopeSel);
        if (scoped) return scoped;
      } catch (_) {}
    }

    return (
      triggerEl.closest(".proof-grid, .proof, .gallery, .portfolio-grid, .portfolio, .joki-grid, .joki, main, section") ||
      triggerEl.closest(".container") ||
      document
    );
  }

  function collectImagesFrom(scope) {
    if (!scope) scope = document;
    var imgs = qsa("img", scope)
      .filter(function (img) { return !img.hasAttribute("data-no-modal"); })
      .map(function (img) {
        return (
          (img.getAttribute("data-full") || "").trim() ||
          (img.getAttribute("data-src") || "").trim() ||
          (img.currentSrc || "").trim() ||
          (img.src || "").trim()
        );
      })
      .filter(isPhotoUrl);

    // dedupe
    var seen = {};
    var out = [];
    for (var i = 0; i < imgs.length; i++) {
      var k = imgs[i];
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out;
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // jangan ganggu klik di dalam modal
    if (t.closest("#ksModal")) return;

    var trigger = t.closest("[data-gallery], [data-gallery-images]");
    var clickedImg = t.closest("img");

    // kalau bukan trigger dan bukan klik image, skip
    if (!trigger && !clickedImg) return;

    // kalau klik image tapi image itu bukan di area proof/portfolio, skip (biar logo/icon tidak ikut)
    if (!trigger && clickedImg) {
      var okArea = clickedImg.closest(".portfolio, .portfolio-card, .portfolio-grid, .proof, .proof-grid, .gallery, .joki, .joki-grid, main, section");
      if (!okArea) return;
    }

    var cat = trigger ? (trigger.getAttribute("data-gallery") || "").trim().toLowerCase() : "";

    // kalau tidak ada data-gallery, coba tebak category dari src gambar yang diklik
    if (!cat && clickedImg) {
      var s0 = (
        (clickedImg.getAttribute("data-full") || "").trim() ||
        (clickedImg.getAttribute("data-src") || "").trim() ||
        (clickedImg.currentSrc || "").trim() ||
        (clickedImg.src || "").trim()
      );
      // cocokkan /assets/images/portfolio/<cat>/... atau /portfolio/<cat>/...
      var mm = s0.match(/\/assets\/images\/portfolio\/([^\/]+)\//i) || s0.match(/\/portfolio\/([^\/]+)\//i);
      if (mm && mm[1]) cat = String(mm[1]).trim().toLowerCase();
    }
    var raw = trigger ? (trigger.getAttribute("data-gallery-images") || "").trim() : "";
    var title = trigger ? (trigger.getAttribute("data-gallery-title") || "").trim() : "";

    var imgs = [];
    if (raw) {
      imgs = parseImages(raw);
      if (!title) title = "Gallery";
    } else if (cat) {
      imgs = buildPortfolioImages(cat);
      if (!title) title = "Portfolio — " + cat.toUpperCase();
    }

    // fallback: kalau category tidak didukung (mis. joki) atau imgs kosong,
    // ambil semua gambar dari scope terdekat
    if (!imgs.length) {
      var scope = pickScope(trigger || clickedImg);
      imgs = collectImagesFrom(scope);
      if (!title) title = cat ? ("Gallery — " + cat.toUpperCase()) : "Gallery";
    }

    if (!imgs.length) return;

    // tentukan start index kalau user klik thumbnail tertentu
    var startIndex = 0;
    if (clickedImg) {
      var src = (
        (clickedImg.getAttribute("data-full") || "").trim() ||
        (clickedImg.currentSrc || "").trim() ||
        (clickedImg.src || "").trim()
      );
      var idx = imgs.indexOf(src);
      if (idx >= 0) startIndex = idx;
    }

    e.preventDefault();
    openModal(imgs, title, startIndex);
  }, true);
}
  /* =========================
    4) APPS SCRIPT API (FASE 5)
  ========================= */
  function apiUrl(action, params) {
    var url = KS_CONFIG.API_BASE + "?action=" + enc(action);
    if (params) {
      Object.keys(params).forEach(function (k) {
        if (params[k] == null || params[k] === "") return;
        url += "&" + enc(k) + "=" + enc(String(params[k]));
      });
    }
    return url;
  }

  async function apiCreateOrder(payload) {
    // POST text/plain untuk menghindari preflight CORS pada banyak kasus
    var url = apiUrl("createOrder");
    var body = JSON.stringify(payload || {});

    var res = await fetch(url, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });

    var data = await res.json();
    return data;
  }

  async function apiGetStatus(orderId, secret) {
    var url = apiUrl("getStatus", { order_id: orderId, secret: secret });
    var res = await fetch(url, { method: "GET", mode: "cors", redirect: "follow" });
    var data = await res.json();
    return data;
  }

  async function apiListServices(category, q) {
    var url = apiUrl("listServices", { category: category, q: q || "" });
    var res = await fetch(url, { method: "GET", mode: "cors", redirect: "follow" });
    var data = await res.json();
    return data;
  }

  /* =========================
    5) LOCAL STORAGE: secrets + dummy fallback
  ========================= */
  var LS_SECRETS = "khonsu_secrets";   // { [order_id]: secret }
  var LS_LAST_ID = "khonsu_last_order_id";  // last order_id
  var LS_ORDERS = "khonsu_orders";          // dummy orders (fallback)
  var LS_SERVICES_CACHE = "khonsu_services_cache_v1"; // { instagram:{at,services}, ... }


  // =========================
  // ORDER ID NORMALIZATION (shared across Order/Reseller/Status)
  // =========================
  function normalizeOrderId(v) {
    if (!v) return "";
    var s = String(v).trim();

    // Normalize hyphen variants (en/em/minus) into ASCII '-'
    s = s.replace(/[\u2010-\u2015\u2212]/g, "-");

    // Remove all whitespace
    s = s.replace(/\s+/g, "");

    // Normalize separators
    s = s.replace(/_/g, "-");
    s = s.replace(/-+/g, "-");

    // Uppercase
    s = s.toUpperCase();

    // Recover common "KSYYYYMMDDXXXX" or "KS-YYYYMMDDXXXX" formats
    var m1 = s.match(/^KS(\d{8})(\d{4})$/);
    if (m1) return "KS-" + m1[1] + "-" + m1[2];

    var m2 = s.match(/^KS-(\d{8})(\d{4})$/);
    if (m2) return "KS-" + m2[1] + "-" + m2[2];

    return s;
  }

  function setLastOrderId(orderId) {
    var oid = normalizeOrderId(orderId) || (orderId ? String(orderId).trim() : "");
    if (!oid) return;
    lsSet(LS_LAST_ID, oid);
  }

  function getLastOrderId() {
    var raw = lsGet(LS_LAST_ID, "");
    return normalizeOrderId(raw) || (raw ? String(raw).trim() : "");
  }

  // Migrate legacy keys (non-normalized) to normalized format to avoid false negative in status lookup
  function migrateSecretsStorage() {
    var raw = lsGet(LS_SECRETS, "");
    if (!raw) return;

    var map = safeJsonParse(raw, null);
    if (!map || typeof map !== "object") return;

    var next = {};
    var changed = false;

    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var nk = normalizeOrderId(k);
      if (!nk) continue;
      var sv = (map[k] == null) ? "" : String(map[k]);
      if (sv && !next[nk]) next[nk] = sv;
      if (nk !== k) changed = true;
    }

    if (changed) {
      lsSet(LS_SECRETS, JSON.stringify(next));
    }

    var last = getLastOrderId();
    var nlast = normalizeOrderId(last);
    if (nlast && nlast !== last) setLastOrderId(nlast);
    }

  function getSecretsMap() {
    migrateSecretsStorage();
    var raw = lsGet(LS_SECRETS, "{}");
    var obj = safeJsonParse(raw, {});
    if (!obj || typeof obj !== "object") obj = {};
    return obj;
  }

  function setSecret(orderId, secret) {
    var oid = normalizeOrderId(orderId) || (orderId ? String(orderId).trim() : "");
    if (!oid || !secret) return;

    migrateSecretsStorage();
    var map = getSecretsMap();
    map[String(oid)] = String(secret);

    lsSet(LS_SECRETS, JSON.stringify(map));
    setLastOrderId(oid);
  }

  function getSecret(orderId) {
    if (!orderId) return "";
    migrateSecretsStorage();

    var raw = String(orderId).trim();
    var oid = normalizeOrderId(raw) || raw;

    var map = getSecretsMap();

    // Try normalized first, then common variants to avoid false negative
    if (map && map[oid]) return String(map[oid]);
    if (map && map[raw]) return String(map[raw]);

    var up = raw.toUpperCase();
    if (map && map[up]) return String(map[up]);

    var compact = raw.replace(/\s+/g, "");
    if (map && map[compact]) return String(map[compact]);

    return "";
  }

  function clearSecrets() {
    lsDel(LS_SECRETS);
    lsDel(LS_LAST_ID);
  }

  // Expose storage helpers globally for order.v2.js, reseller-order.v2.js, and status lookup consistency
  (function exposeKhonsuStorage() {
    try { migrateSecretsStorage(); } catch (_) {}

    var api = window.KhonsuStorage || {};
    api.normalizeOrderId = normalizeOrderId;
    api.saveOrderSecret = setSecret;
    api.getOrderSecret = getSecret;
    api.saveLastOrderId = setLastOrderId;
    api.getLastOrderId = getLastOrderId;
    api.clearSecrets = clearSecrets;
    api.keys = { secrets: LS_SECRETS, lastOrderId: LS_LAST_ID };

    window.KhonsuStorage = api;

    // Backward compatible aliases (if any page still references these directly)
    window.saveOrderSecret = api.saveOrderSecret;
    window.getOrderSecret = api.getOrderSecret;
    window.saveLastOrderId = api.saveLastOrderId;
    window.getLastOrderId = api.getLastOrderId;
  })();


  function loadDummyOrders() {
    var raw = lsGet(LS_ORDERS, "[]");
    var arr = safeJsonParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveDummyOrders(arr) {
    lsSet(LS_ORDERS, JSON.stringify(arr || []));
  }

  function findDummyOrder(orderId) {
    var list = loadDummyOrders();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].order_id === orderId) return list[i];
    }
    return null;
  }

  function createDummyOrder(payload) {
    var oid = "KS-" + todayStamp() + "-" + rand4();
    var created = nowIso();

    var order = {
      order_id: oid,
      created_at: created,
      service_code: payload.service_code || payload.service_id || "",
      service_name: payload.service_name || payload.service_label || "",
      customer_name: payload.customer_name || "",
      customer_whatsapp: payload.wa || "",
      qty: payload.qty || "",
      target: payload.target || "",
      amount: payload.amount || "",
      order_channel: payload.channel || "direct",
      status: "Menunggu Konfirmasi",
      status_history: [
        { at: created, status: "Menunggu Konfirmasi", note: "Order dibuat (dummy fallback)." }
      ]
    };

    var list = loadDummyOrders();
    list.push(order);
    saveDummyOrders(list);
    setLastOrderId(oid);
    return { order_id: oid, secret: "", status: order.status, created_at: created, order: order };
  }

  /* =========================
    6) SERVICE LABELS (kategori besar)
  ========================= */
  function categoryLabel(serviceId) {
    var map = {
      "instagram": "Instagram — Social Proof",
      "tiktok": "TikTok — Social Proof",
      "shopee": "Shopee — Social Proof",
      "joki-tugas": "Joki Tugas",
      "joki-skripsi": "Joki Skripsi"
    };
    return map[serviceId] || "Belum dipilih";
  }

  function detectOrderContext() {
    if (qs("#btnSimulateResellerOrder")) return "reseller";
    if (qs("#btnSimulateOrder")) return "direct";
    return "";
  }

  function storageKeyForCategory() {
    var ctx = detectOrderContext();
    if (ctx === "reseller") return "khonsu_reseller_selected_service";
    if (ctx === "direct") return "khonsu_selected_service";
    return "";
  }

  function storageKeyForPackage() {
    var ctx = detectOrderContext();
    if (ctx === "reseller") return "khonsu_reseller_selected_package";
    if (ctx === "direct") return "khonsu_selected_package";
    return "";
  }

  /* =========================
    7) SERVICES: CACHE + UI INJECTION
  ========================= */
  function getServicesCache() {
    var raw = lsGet(LS_SERVICES_CACHE, "{}");
    var obj = safeJsonParse(raw, {});
    if (!obj || typeof obj !== "object") obj = {};
    return obj;
  }

  function setServicesCache(cat, services) {
    var c = getServicesCache();
    c[cat] = { at: Date.now(), services: services || [] };
    lsSet(LS_SERVICES_CACHE, JSON.stringify(c));
  }

  function getServicesFromCache(cat, maxAgeMs) {
    var c = getServicesCache();
    var node = c[cat];
    if (!node || !node.at || !Array.isArray(node.services)) return null;
    if ((Date.now() - node.at) > maxAgeMs) return null;
    return node.services;
  }

  function parseUnitBase(unitText) {
    // contoh unit di sheet: "per 1000" (kadang wrap)
    var s = String(unitText || "").toLowerCase();
    var m = s.match(/(\d+)/);
    if (!m) return NaN;
    var n = Number(m[1]);
    return isFinite(n) ? n : NaN;
  }

  function ensurePackageUI(ctx) {
    // ctx: "direct" or "reseller"
    var isDirect = (ctx === "direct");
    var btn = isDirect ? qs("#btnSimulateOrder") : qs("#btnSimulateResellerOrder");
    if (!btn) return null;

    var form = btn.closest ? btn.closest(".form") : null;
    if (!form) return null;

    var actions = qs(".form__actions", form);
    if (!actions) return null;

    var wrapId = isDirect ? "ksPackageWrapDirect" : "ksPackageWrapReseller";
    var existing = qs("#" + wrapId, form);
    if (existing) return existing;

    // Build UI block
    var wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.className = "ks-package-wrap";

    var selectId = isDirect ? "orderPackage" : "resellerPackage";
    var qtyId = isDirect ? "orderQty" : "resellerQty";
    var priceId = isDirect ? "orderPriceHint" : "resellerPriceHint";

    wrap.innerHTML =
      '<div class="field">' +
        '<label class="label" for="' + selectId + '">Pilih Paket Layanan</label>' +
        '<select class="input" id="' + selectId + '">' +
          '<option value="">— Pilih kategori dulu —</option>' +
        '</select>' +
        '<p class="hint" style="margin-top:8px;">Paket diambil dari tab <strong>Services</strong>. Harga final setelah konfirmasi WhatsApp.</p>' +
      '</div>' +
      '<div class="field">' +
        '<label class="label" for="' + qtyId + '">Qty</label>' +
        '<input class="input" id="' + qtyId + '" type="number" min="1" step="1" placeholder="Contoh: 1000" />' +
        '<p class="hint" id="' + priceId + '" style="margin-top:8px;">Pilih paket untuk lihat min/max dan harga.</p>' +
      '</div>' +
      '<div class="divider"></div>';

    // Insert before actions
    form.insertBefore(wrap, actions);

    return wrap;
  }

  function fillPackageOptions(ctx, category, services) {
    var isDirect = (ctx === "direct");
    ensurePackageUI(ctx);

    var select = isDirect ? qs("#orderPackage") : qs("#resellerPackage");
    var qty = isDirect ? qs("#orderQty") : qs("#resellerQty");
    var hint = isDirect ? qs("#orderPriceHint") : qs("#resellerPriceHint");
    if (!select || !qty || !hint) return;

    var savedPkgRaw = lsGet(storageKeyForPackage(), "");
    var savedPkg = safeJsonParse(savedPkgRaw, null);
    var savedCode = savedPkg && savedPkg.service_code ? String(savedPkg.service_code) : "";

    select.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = services.length ? "— Pilih paket —" : "— Tidak ada paket aktif —";
    select.appendChild(ph);

    services.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.service_code;
      opt.textContent = s.service_name + (s.price_wholesale !== "" ? (" • " + formatIDR(s.price_wholesale)) : "");
      select.appendChild(opt);
    });

    // Restore selection if still exists
    if (savedCode) {
      var has = services.some(function (x) { return x.service_code === savedCode; });
      if (has) select.value = savedCode;
    }

    // Setup listeners
    function updateFromSelected() {
      var code = String(select.value || "");
      var svc = services.find(function (x) { return x.service_code === code; }) || null;

      if (!svc) {
        hint.textContent = "Pilih paket untuk lihat min/max dan harga.";
        qty.removeAttribute("min");
        qty.removeAttribute("max");
        return;
      }

      // Save selection
      lsSet(storageKeyForPackage(), JSON.stringify({
        category: category,
        service_code: svc.service_code,
        service_name: svc.service_name,
        unit: svc.unit || "",
        min_qty: svc.min_qty,
        max_qty: svc.max_qty,
        price_wholesale: svc.price_wholesale,
        note: svc.note || ""
      }));

      var minQ = toNum(svc.min_qty);
      var maxQ = toNum(svc.max_qty);

      if (isFinite(minQ) && minQ > 0) qty.min = String(minQ);
      else qty.min = "1";

      if (isFinite(maxQ) && maxQ > 0) qty.max = String(maxQ);
      else qty.removeAttribute("max");

      // Auto-fill qty to min if empty
      if (!String(qty.value || "").trim() && isFinite(minQ) && minQ > 0) qty.value = String(minQ);

      updateEstimate();
    }

    function updateEstimate() {
      var code = String(select.value || "");
      var svc = services.find(function (x) { return x.service_code === code; }) || null;
      if (!svc) return;

      var price = toNum(svc.price_wholesale);
      var unitBase = parseUnitBase(svc.unit);
      var qv = toNum(qty.value);

      var minQ = toNum(svc.min_qty);
      var maxQ = toNum(svc.max_qty);

      var warn = "";
      if (isFinite(minQ) && isFinite(qv) && qv < minQ) warn = "Qty di bawah minimum.";
      if (isFinite(maxQ) && isFinite(qv) && qv > maxQ) warn = "Qty melebihi maksimum.";

      var line1 = svc.service_name;
      var line2 = "";

      if (isFinite(price)) {
        if (isFinite(unitBase) && unitBase > 0) {
          line2 = "Harga: " + formatIDR(price) + " per " + unitBase + ".";
        } else {
          line2 = "Harga: " + formatIDR(price) + ".";
        }
      } else {
        line2 = "Harga: -";
      }

      var est = "";
      if (isFinite(price) && isFinite(unitBase) && unitBase > 0 && isFinite(qv) && qv > 0) {
        var estAmount = price * (qv / unitBase);
        est = "Estimasi (linear): " + formatIDR(estAmount) + ".";
      } else if (isFinite(price) && isFinite(qv) && qv > 0 && !isFinite(unitBase)) {
        // kalau unit tidak jelas, jangan hitung
        est = "Estimasi: (cek via WhatsApp).";
      }

      var note = svc.note ? (" Catatan: " + svc.note + ".") : "";
      hint.textContent = line1 + " — " + line2 + (est ? (" " + est) : "") + (warn ? (" " + warn) : "") + note + " Harga final setelah konfirmasi WA.";
    }

    on(select, "change", function () {
      updateFromSelected();
      // Update summary kalau ada
      if (ctx === "direct") setText("#uiOrderService", select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : "-");
      if (ctx === "reseller") setText("#uiSelectedServiceReseller", select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : "-");
    });

    on(qty, "input", function () { updateEstimate(); });

    // initial refresh
    updateFromSelected();
  }

  async function loadServicesForCategory(ctx, category) {
    var cat = normalizeCategory(category);
    if (!cat) return;

    // only for these categories (sheet Services biasanya untuk social)
    var supported = (cat === "instagram" || cat === "tiktok" || cat === "shopee");
    if (!supported) {
      // joki: paket dari sheet tidak wajib
      // tapi kalau mau nanti ditambah kategori joki di sheet juga tetap akan jalan
      ensurePackageUI(ctx);
      fillPackageOptions(ctx, cat, []);
      return;
    }

    // Try local cache first (30s)
    var cached = getServicesFromCache(cat, 30 * 1000);
    if (cached) {
      fillPackageOptions(ctx, cat, cached);
      return;
    }

    // Fetch from backend
    try {
      var data = await apiListServices(cat, "");
      if (!data || !data.ok) throw new Error((data && data.message) ? data.message : "listServices error");
      var services = Array.isArray(data.services) ? data.services : [];
      setServicesCache(cat, services);
      fillPackageOptions(ctx, cat, services);
    } catch (err) {
      log("listServices fetch error:", err);
      // If backend fail, show empty
      fillPackageOptions(ctx, cat, []);
    }
  }

  /* =========================
    8) SERVICE SELECT (kategori cards)
  ========================= */
  function initServiceSelect() {
    var key = storageKeyForCategory();
    if (!key) return;

    var cards = qsa(".select-card[data-service]");
    if (!cards.length) return;

    var ctx = detectOrderContext();

    function setActive(serviceId) {
      lsSet(key, serviceId || "");
      cards.forEach(function (c) {
        var sid = c.getAttribute("data-service");
        var active = (sid === serviceId);
        c.classList.toggle("is-active", active);
        c.setAttribute("aria-pressed", active ? "true" : "false");
      });

      // Saat kategori berubah, load paket dari sheet (Services)
      if (ctx === "direct" || ctx === "reseller") {
        loadServicesForCategory(ctx, serviceId || "");
      }

      // Update summary label (kategori)
      if (ctx === "direct") setText("#uiOrderService", categoryLabel(serviceId));
      if (ctx === "reseller") setText("#uiSelectedServiceReseller", categoryLabel(serviceId));
    }

    // Restore
    var saved = lsGet(key, "");
    if (saved) setActive(saved);
    else {
      // ensure UI exists (biar user lihat placeholder)
      if (ctx === "direct" || ctx === "reseller") ensurePackageUI(ctx);
    }

    // Click
    cards.forEach(function (c) {
      on(c, "click", function () {
        setActive(c.getAttribute("data-service") || "");
      });
      on(c, "keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActive(c.getAttribute("data-service") || "");
        }
      });
    });
  }

  /* =========================
    9) ORDER PAGE (direct) — createOrder pakai paket dari Services
  ========================= */
  function initOrderPage() {
    var btn = qs("#btnSimulateOrder");
    if (!btn) return;

    // Live update summary name/wa (kalau elemen ada)
    var nameEl = qs("#orderName");
    var waEl = qs("#orderWhatsapp");
    on(nameEl, "input", function () { setText("#uiOrderName", (nameEl.value || "").trim() || "-"); });
    on(waEl, "input", function () { setText("#uiOrderWa", (waEl.value || "").trim() || "-"); });

    on(btn, "click", async function (e) {
      e.preventDefault();

      var category = lsGet("khonsu_selected_service", "");
      var name = (qs("#orderName") && qs("#orderName").value) ? qs("#orderName").value.trim() : "";
      var wa = (qs("#orderWhatsapp") && qs("#orderWhatsapp").value) ? qs("#orderWhatsapp").value.trim() : "";
      var account = (qs("#orderAccount") && qs("#orderAccount").value) ? qs("#orderAccount").value.trim() : "";
      var deadline = (qs("#orderDeadline") && qs("#orderDeadline").value) ? qs("#orderDeadline").value.trim() : "";
      var brief = (qs("#orderBrief") && qs("#orderBrief").value) ? qs("#orderBrief").value.trim() : "";

      // Paket (dari injected UI)
      var sel = qs("#orderPackage");
      var qtyEl = qs("#orderQty");

      function setErr(msg) {
        var box = qs("#orderError");
        if (!box) return;
        if (!msg) { box.textContent = ""; box.style.display = "none"; return; }
        box.textContent = msg;
        box.style.display = "block";
      }

      if (!category) { setErr("Pilih kategori layanan dulu (klik salah satu card)."); return; }
      if (!name) { setErr("Nama wajib diisi."); return; }
      if (!wa) { setErr("Nomor WhatsApp wajib diisi."); return; }

      // Ambil paket tersimpan (hasil pilih dropdown)
      var pkgRaw = lsGet("khonsu_selected_package", "");
      var pkg = safeJsonParse(pkgRaw, null);

      // Jika kategori social (IG/TT/SH), paket wajib dipilih
      var catNorm = normalizeCategory(category);
      var needsPackage = (catNorm === "instagram" || catNorm === "tiktok" || catNorm === "shopee");

      var serviceCode = "";
      var serviceName = "";
      var unit = "";
      var minQ = NaN;
      var maxQ = NaN;
      var price = NaN;

      if (pkg && pkg.service_code && pkg.service_name && normalizeCategory(pkg.category || pkg.category_label || catNorm) !== "") {
        // kalau user pilih paket, pakai paket
        serviceCode = String(pkg.service_code);
        serviceName = String(pkg.service_name);
        unit = String(pkg.unit || "");
        minQ = toNum(pkg.min_qty);
        maxQ = toNum(pkg.max_qty);
        price = toNum(pkg.price_wholesale);
      } else {
        // fallback kategori saja
        serviceCode = category;
        serviceName = categoryLabel(category);
      }

      if (needsPackage && (!pkg || !pkg.service_code)) {
        setErr("Pilih paket layanan dulu (dropdown).");
        return;
      }

      // Qty validation (kalau ada paket)
      var qty = qtyEl ? toNum(qtyEl.value) : NaN;
      if (needsPackage) {
        if (!isFinite(qty) || qty <= 0) { setErr("Qty wajib diisi angka yang valid."); return; }
        if (isFinite(minQ) && qty < minQ) { setErr("Qty minimal: " + minQ); return; }
        if (isFinite(maxQ) && qty > maxQ) { setErr("Qty maksimal: " + maxQ); return; }
      } else {
        // non social: qty optional
        if (!isFinite(qty) || qty <= 0) qty = "";
      }

      // Estimasi amount
      var amount = "";
      if (needsPackage && isFinite(price)) {
        var unitBase = parseUnitBase(unit);
        if (isFinite(unitBase) && unitBase > 0 && isFinite(qty) && qty > 0) {
          amount = Math.round(price * (qty / unitBase));
        } else {
          amount = price; // fallback
        }
      }

      setErr("");

      var payload = {
        customer_name: name,
        wa: wa,
        service_code: serviceCode,
        service_name: serviceName,
        qty: qty,
        target: account,         // kita pakai sebagai "target"
        amount: amount,          // estimasi (harga final via WA)
        pay_method: "",
        channel: "direct",
        note: "",
        meta: {
          category: category,
          package_code: (pkg && pkg.service_code) ? String(pkg.service_code) : "",
          package_name: (pkg && pkg.service_name) ? String(pkg.service_name) : "",
          unit: unit,
          price_wholesale: (isFinite(price) ? price : ""),
          account: account,
          deadline: deadline,
          brief: brief,
          source: "website",
          page: "order.html"
        }
      };

      // Optimistic UI
      var originalText = btn.textContent;
      btn.textContent = "Memproses...";
      setDisabled(btn, true);

      var result;
      try {
        result = await apiCreateOrder(payload);
        if (!result || !result.ok) throw new Error((result && result.message) ? result.message : "Create order gagal");
      } catch (err) {
        result = createDummyOrder(payload);
        log("API createOrder gagal, fallback dummy:", err);
      } finally {
        btn.textContent = originalText;
        setDisabled(btn, false);
      }

      // Save secret
      if (result.order_id && result.secret) setSecret(result.order_id, result.secret);
      else if (result.order_id) setLastOrderId(result.order_id);
    // Update UI summary
      setText("#uiOrderId", result.order_id || "-");
      setText("#uiOrderStatus", (result.status || "Menunggu Konfirmasi") + (result.secret ? " (Backend)" : " (Dummy)"));
      setText("#uiOrderName", name || "-");
      setText("#uiOrderWa", wa || "-");
      setText("#uiOrderService", serviceName || categoryLabel(category));

      // Status link
      var statusHref = "status.html?order_id=" + enc(result.order_id || "");
      setHref("#btnGoStatus", statusHref);
      setHref("#btnGoStatus2", statusHref);
      setHref("#btnGoStatusTop", statusHref);

      // WhatsApp prefill
      var msg =
        "Halo Khonsu Socials, saya mau konfirmasi order.\n\n" +
        "(Order ID): " + (result.order_id || "-") + "\n" +
        "(Kategori): " + (categoryLabel(category) || "-") + "\n" +
        "(Paket): " + (serviceName || "-") + "\n" +
        "(Qty): " + (qty || "-") + "\n" +
        "(Estimasi): " + (amount ? formatIDR(amount) : "-") + "\n" +
        "(Nama): " + (name || "-") + "\n" +
        "(WhatsApp): " + (wa || "-") + "\n" +
        "(Target/Username): " + (account || "-") + "\n" +
        "(Deadline): " + (deadline || "-") + "\n" +
        "(Brief): " + (brief || "-");

      var waHref = "https://wa.me/6281314604337?text=" + enc(msg);
      setHref("#btnChatOrder", waHref);
      setHref("#btnChatOrder2", waHref);

      var summary = qs(".summary-card");
      if (summary && summary.scrollIntoView) {
        summary.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, true);
  }

  /* =========================
    10) RESELLER ORDER PAGE — pakai paket dari Services
  ========================= */
  function initResellerOrderPage() {
    var btn = qs("#btnSimulateResellerOrder");
    if (!btn) return;

    on(btn, "click", async function (e) {
      e.preventDefault();

      var category = lsGet("khonsu_reseller_selected_service", "");

      var resellerName = (qs("#resellerName") && qs("#resellerName").value) ? qs("#resellerName").value.trim() : "";
      var resellerWa = (qs("#resellerWhatsapp") && qs("#resellerWhatsapp").value) ? qs("#resellerWhatsapp").value.trim() : "";

      var buyerName = (qs("#buyerName") && qs("#buyerName").value) ? qs("#buyerName").value.trim() : "";
      var buyerWa = (qs("#buyerWhatsapp") && qs("#buyerWhatsapp").value) ? qs("#buyerWhatsapp").value.trim() : "";

      var buyerAccount = (qs("#buyerAccount") && qs("#buyerAccount").value) ? qs("#buyerAccount").value.trim() : "";
      var deadline = (qs("#deadline") && qs("#deadline").value) ? qs("#deadline").value.trim() : "";
      var brief = (qs("#brief") && qs("#brief").value) ? qs("#brief").value.trim() : "";

      var sel = qs("#resellerPackage");
      var qtyEl = qs("#resellerQty");

      function setErr(msg) {
        var box = qs("#resellerError");
        if (!box) return;
        if (!msg) { box.textContent = ""; box.style.display = "none"; return; }
        box.textContent = msg;
        box.style.display = "block";
      }

      if (!category) { setErr("Pilih kategori layanan dulu (klik salah satu card)."); return; }
      if (!resellerName) { setErr("Nama reseller wajib diisi."); return; }
      if (!resellerWa) { setErr("WhatsApp reseller wajib diisi."); return; }
      if (!buyerName) { setErr("Nama buyer wajib diisi."); return; }
      if (!buyerWa) { setErr("WhatsApp buyer wajib diisi."); return; }

      // Ambil paket tersimpan reseller
      var pkgRaw = lsGet("khonsu_reseller_selected_package", "");
      var pkg = safeJsonParse(pkgRaw, null);

      var catNorm = normalizeCategory(category);
      var needsPackage = (catNorm === "instagram" || catNorm === "tiktok" || catNorm === "shopee");

      var serviceCode = "";
      var serviceName = "";
      var unit = "";
      var minQ = NaN;
      var maxQ = NaN;
      var price = NaN;

      if (pkg && pkg.service_code && pkg.service_name) {
        serviceCode = String(pkg.service_code);
        serviceName = String(pkg.service_name);
        unit = String(pkg.unit || "");
        minQ = toNum(pkg.min_qty);
        maxQ = toNum(pkg.max_qty);
        price = toNum(pkg.price_wholesale);
      } else {
        serviceCode = category;
        serviceName = categoryLabel(category);
      }

      if (needsPackage && (!pkg || !pkg.service_code)) {
        setErr("Pilih paket layanan dulu (dropdown).");
        return;
      }

      var qty = qtyEl ? toNum(qtyEl.value) : NaN;
      if (needsPackage) {
        if (!isFinite(qty) || qty <= 0) { setErr("Qty wajib diisi angka yang valid."); return; }
        if (isFinite(minQ) && qty < minQ) { setErr("Qty minimal: " + minQ); return; }
        if (isFinite(maxQ) && qty > maxQ) { setErr("Qty maksimal: " + maxQ); return; }
      } else {
        if (!isFinite(qty) || qty <= 0) qty = "";
      }

      var amount = "";
      if (needsPackage && isFinite(price)) {
        var unitBase = parseUnitBase(unit);
        if (isFinite(unitBase) && unitBase > 0 && isFinite(qty) && qty > 0) {
          amount = Math.round(price * (qty / unitBase));
        } else {
          amount = price;
        }
      }

      setErr("");

      var payload = {
        customer_name: buyerName,
        wa: buyerWa,
        service_code: serviceCode,
        service_name: serviceName,
        qty: qty,
        target: buyerAccount,
        amount: amount,
        pay_method: "",
        channel: "reseller",
        note: "",
        meta: {
          category: category,
          package_code: (pkg && pkg.service_code) ? String(pkg.service_code) : "",
          package_name: (pkg && pkg.service_name) ? String(pkg.service_name) : "",
          unit: unit,
          price_wholesale: (isFinite(price) ? price : ""),
          reseller_name: resellerName,
          reseller_whatsapp: resellerWa,
          account: buyerAccount,
          deadline: deadline,
          brief: brief,
          source: "website",
          page: "reseller-order.html"
        }
      };

      var originalText = btn.textContent;
      btn.textContent = "Memproses...";
      setDisabled(btn, true);

      var result;
      try {
        result = await apiCreateOrder(payload);
        if (!result || !result.ok) throw new Error((result && result.message) ? result.message : "Create reseller order gagal");
      } catch (err) {
        result = createDummyOrder(payload);
        log("API reseller createOrder gagal, fallback dummy:", err);
      } finally {
        btn.textContent = originalText;
        setDisabled(btn, false);
      }

      if (result.order_id && result.secret) setSecret(result.order_id, result.secret);
      else if (result.order_id) setLastOrderId(result.order_id);
    // Update summary UI
      setText("#uiResellerOrderId", result.order_id || "-");
      setText("#uiResellerStatus", (result.status || "Menunggu Konfirmasi") + (result.secret ? " (Backend)" : " (Dummy)"));
      setText("#uiSelectedServiceReseller", serviceName || categoryLabel(category));
      setText("#uiResellerName", resellerName || "-");
      setText("#uiResellerWa", resellerWa || "-");
      setText("#uiBuyerName", buyerName || "-");
      setText("#uiBuyerWa", buyerWa || "-");

      var statusHref = "status.html?order_id=" + enc(result.order_id || "");
      setHref("#btnGoStatus", statusHref);
      setHref("#btnGoStatus2", statusHref);
      setHref("#btnGoStatusTop", statusHref);

      var msg =
        "Halo MR.K, saya reseller mau konfirmasi order buyer.\n\n" +
        "(Order ID): " + (result.order_id || "-") + "\n" +
        "(Kategori): " + (categoryLabel(category) || "-") + "\n" +
        "(Paket): " + (serviceName || "-") + "\n" +
        "(Qty): " + (qty || "-") + "\n" +
        "(Estimasi): " + (amount ? formatIDR(amount) : "-") + "\n" +
        "(Reseller): " + (resellerName || "-") + "\n" +
        "(WA Reseller): " + (resellerWa || "-") + "\n" +
        "(Buyer): " + (buyerName || "-") + "\n" +
        "(WA Buyer): " + (buyerWa || "-") + "\n" +
        "(Target/Username): " + (buyerAccount || "-") + "\n" +
        "(Deadline): " + (deadline || "-") + "\n" +
        "(Brief): " + (brief || "-");

      var waHref = "https://wa.me/6281314604337?text=" + enc(msg);
      setHref("#btnChatResellerOrder", waHref);
      setHref("#btnChatResellerOrder2", waHref);

      var summary = qs(".summary-card");
      if (summary && summary.scrollIntoView) {
        summary.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, true);

    // Reset local (dummy + secrets + package selection)
    var resetBtn = qs("#btnResetResellerDummy");
    on(resetBtn, "click", function (e) {
      e.preventDefault();
      clearSecrets();
      lsDel(LS_ORDERS);
      lsDel("khonsu_reseller_selected_package");
      var ok = qs("#resellerResetOk");
      if (ok) {
        ok.style.display = "inline-flex";
        window.setTimeout(function () { ok.style.display = "none"; }, 1800);
      }
    }, true);
  }

  /* =========================
    11) STATUS PAGE — backend first, fallback dummy
  ========================= */
  function renderStatusUIFromBackend(data) {
    if (!data || !data.ok) return;

    var order = data.order || {};
    var meta = data.meta || {};
    var history = data.status_history || [];

    setText("#uiSOrderId", data.order_id || "-");
    setText("#uiSService", order.service_name || "-");
    setText("#uiSName", order.customer_name || "-");
    setText("#uiSWa", order.wa || "-");
    setText("#uiSStatus", data.status || "-");
    setText("#uiSUpdated", humanDate(data.updated_at || order.updated_at));

    setText("#uiSBrief", (meta && meta.brief) ? meta.brief : (order.note || "-"));
    setText("#uiSAccount", (meta && meta.account) ? meta.account : (order.target || "-"));
    setText("#uiSDeadline", (meta && meta.deadline) ? meta.deadline : "-");

    setText("#uiSHistoryMeta", history.length ? (history.length + " update") : "-");

    var ul = qs("#uiSHistory");
    if (ul) {
      ul.innerHTML = "";
      if (!history.length) {
        ul.innerHTML = "<li>Belum ada history.</li>";
      } else {
        history.forEach(function (h) {
          var li = document.createElement("li");
          var at = h && h.at ? humanDate(h.at) : "-";
          var st = h && h.status ? h.status : "-";
          var note = h && h.note ? h.note : "";
          li.textContent = at + " — " + st + (note ? " (" + note + ")" : "");
          ul.appendChild(li);
        });
      }
    }

    var msg =
      "Halo MR.K, saya mau tanya status order.\n\n" +
      "(Order ID): " + (data.order_id || "-") + "\n" +
      "(Layanan): " + (order.service_name || "-") + "\n" +
      "(Nama): " + (order.customer_name || "-") + "\n" +
      "(WhatsApp): " + (order.wa || "-") + "\n" +
      "(Status): " + (data.status || "-");

    var waHref = "https://wa.me/6281314604337?text=" + enc(msg);
    setHref("#btnChatStatus", waHref);
    setHref("#btnChatStatus2", waHref);

    setText("#uiSNote", "Status ini berasal dari backend (Apps Script + Google Sheet).");
  }

  function renderStatusUIFromDummy(order) {
    if (!order) return;

    setText("#uiSOrderId", order.order_id || "-");
    setText("#uiSService", order.service_name || "-");
    setText("#uiSName", order.customer_name || "-");
    setText("#uiSWa", order.customer_whatsapp || "-");
    setText("#uiSStatus", order.status || "-");

    var lastAt = (order.status_history && order.status_history.length)
      ? order.status_history[order.status_history.length - 1].at
      : order.created_at;

    setText("#uiSUpdated", humanDate(lastAt));
    setText("#uiSBrief", order.brief || "-");
    setText("#uiSAccount", order.target || "-");
    setText("#uiSDeadline", order.deadline || "-");
    setText("#uiSHistoryMeta", (order.status_history && order.status_history.length) ? (order.status_history.length + " update") : "-");

    var ul = qs("#uiSHistory");
    if (ul) {
      ul.innerHTML = "";
      var hist = order.status_history || [];
      if (!hist.length) {
        ul.innerHTML = "<li>Belum ada history.</li>";
      } else {
        hist.forEach(function (h) {
          var li = document.createElement("li");
          var at = h && h.at ? humanDate(h.at) : "-";
          var st = h && h.status ? h.status : "-";
          var note = h && h.note ? h.note : "";
          li.textContent = at + " — " + st + (note ? " (" + note + ")" : "");
          ul.appendChild(li);
        });
      }
    }

    var msg =
      "Halo MR.K, saya mau tanya status order.\n\n" +
      "(Order ID): " + (order.order_id || "-") + "\n" +
      "(Layanan): " + (order.service_name || "-") + "\n" +
      "(Nama): " + (order.customer_name || "-") + "\n" +
      "(WhatsApp): " + (order.customer_whatsapp || "-") + "\n" +
      "(Status): " + (order.status || "-");

    var waHref = "https://wa.me/6281314604337?text=" + enc(msg);
    setHref("#btnChatStatus", waHref);
    setHref("#btnChatStatus2", waHref);

    setText("#uiSNote", "Status ini berasal dari dummy localStorage (fallback).");
  }

  async function loadStatus(orderId) {
    var raw = (orderId || "").trim();
    var oid = normalizeOrderId(raw) || raw;
    if (!oid) return { ok: false, error: "EMPTY" };

    var q = parseQuery();
    var secret = (q.secret || "").trim() || getSecret(oid);

    if (!secret) {
      var dummy = findDummyOrder(oid);
      if (dummy) return { ok: true, source: "dummy", dummy: dummy };
      return { ok: false, error: "NO_SECRET" };
    }

    try {
      var data = await apiGetStatus(oid, secret);
      if (data && data.ok) return { ok: true, source: "backend", data: data };

      var d2 = findDummyOrder(oid);
      if (d2) return { ok: true, source: "dummy", dummy: d2 };

      return { ok: false, error: (data && data.error) ? data.error : "BACKEND_ERROR", message: (data && data.message) ? data.message : "" };
    } catch (err) {
      var d3 = findDummyOrder(oid);
      if (d3) return { ok: true, source: "dummy", dummy: d3 };
      return { ok: false, error: "FETCH_ERROR", message: String(err && err.message ? err.message : err) };
    }
  }

  function initStatusPage() {
    var input = qs("#statusOrderId");
    var btnFind = qs("#btnFindOrder");
    var btnUseLast = qs("#btnUseLast");
    var btnClearAll = qs("#btnClearAll");

    // Result panel is hidden by default in status.html (uses the `hidden` attribute)
    var resultWrap = qs("#statusResultWrap");
    var emptyHint = qs("#statusEmptyHint");
    var errBox = qs("#statusError");
    var okBox = qs("#clearOk");

    if (!input && !btnFind) return;

    function showEl(el) {
      if (!el) return;
      el.hidden = false;
      // clear any forced display:none from older code
      if (el.style && el.style.display === "none") el.style.display = "";
    }

    function hideEl(el) {
      if (!el) return;
      el.hidden = true;
      if (el.style) el.style.display = "none";
    }

    function setErr(msg) {
      if (!errBox) return;
      if (!msg) {
        errBox.textContent = "";
        hideEl(errBox);
        return;
      }
      errBox.textContent = msg;
      showEl(errBox);
    }

    function flashOk(msg) {
      if (!okBox) return;
      okBox.textContent = msg || "Berhasil.";
      showEl(okBox);
      window.setTimeout(function () { hideEl(okBox); }, 1800);
    }

    function showResult() {
      if (resultWrap) resultWrap.hidden = false;
      if (emptyHint) emptyHint.hidden = true;
    }

    function hideResult() {
      if (resultWrap) resultWrap.hidden = true;
      if (emptyHint) emptyHint.hidden = false;
    }

    function getInput() {
      return input && input.value ? (normalizeOrderId(input.value) || input.value.trim()) : "";
    }

    function setInput(v) {
      if (input) input.value = normalizeOrderId(v) || (v || "");
    }

    async function runLookup(oid) {
      setErr("");
      hideEl(okBox);

      // Hide previous results while searching (prevents "looks stuck" when result panel stays hidden)
      hideResult();

      if (btnFind) {
        var t0 = btnFind.textContent;
        btnFind.textContent = "Mencari...";
        setDisabled(btnFind, true);

        try {
          var res = await loadStatus(oid);

          if (!res.ok) {
            if (res.error === "NO_SECRET") {
              setErr("Secret order ini tidak ada di browser. Buka status dari device yang sama saat order dibuat, atau tanya via WhatsApp dengan Order ID.");
            } else {
              setErr("Gagal ambil status: " + (res.message || res.error || "Unknown error"));
            }
            return;
          }

          if (res.source === "backend") renderStatusUIFromBackend(res.data);
          else renderStatusUIFromDummy(res.dummy);

          showResult();

          if (oid) setLastOrderId(oid);
        } finally {
          btnFind.textContent = t0;
          setDisabled(btnFind, false);
        }
      }
    }

    if (btnFind) {
      on(btnFind, "click", function (e) {
        e.preventDefault();
        var oid = getInput();
        if (!oid) { setErr("Masukkan Order ID dulu."); return; }
        runLookup(oid);
      }, true);
    }

    if (btnUseLast) {
      on(btnUseLast, "click", function (e) {
        e.preventDefault();
        var last = getLastOrderId();
        if (!last) { setErr("Belum ada order terakhir. Buat order dulu."); return; }
        setInput(last);
        runLookup(last);
      }, true);
    }

    if (input) {
      on(input, "keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          var oid = getInput();
          if (!oid) { setErr("Masukkan Order ID dulu."); return; }
          runLookup(oid);
        }
      });
    }

    if (btnClearAll) {
      on(btnClearAll, "click", function (e) {
        e.preventDefault();

        // Clear dummy + secrets + selection cache
        lsDel(LS_ORDERS);
        clearSecrets();
        lsDel("khonsu_selected_package");
        lsDel("khonsu_reseller_selected_package");

        hideResult();
        setInput("");
        setErr("");
        setText("#uiSNote", "Dummy data & secret lokal sudah dibersihkan.");
        flashOk("Data lokal berhasil dibersihkan.");
      }, true);
    }

    // Auto-load from query (?order_id=...) or last order
    window.setTimeout(function () {
      var q = parseQuery();
      var oid = normalizeOrderId((q.order_id || "").trim()) || getLastOrderId();
      if (oid) {
        setInput(oid);
        runLookup(oid);
      }
    }, 0);
  }

  /* =========================
    12) NAV ACTIVE HIGHLIGHT
  ========================= */
  function initNavActive() {
    var path = (location.pathname || "").split("/").pop();
    if (!path) return;

    qsa(".nav__link").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var clean = href.split("#")[0].split("?")[0].split("/").pop();
      if (clean && clean === path) a.classList.add("is-active");
    });
  }

  /* Shared public navigation. Keep transaction pages and their form contracts untouched. */
  function initLunarNav() {
    var nav = qs(".nav");
    if (!nav || nav.getAttribute("data-lunar-nav") === "true") return;
    var links = qs(".nav__center", nav);
    if (!links) {
      links = document.createElement("div");
      links.className = "nav__center";
      while (nav.firstChild) links.appendChild(nav.firstChild);
      nav.appendChild(links);
    }

    var inPages = /\/pages\//.test(location.pathname || "");
    var root = inPages ? "../" : "./";
    var current = (location.pathname || "").split("/").pop() || "index.html";
    var activePage = current === "website-development.html" ? "layanan.html" : current;
    var items = [
      [root + "index.html", "Beranda", "index.html"],
      [root + "pages/layanan.html", "Layanan", "layanan.html"],
      [root + "pages/hasil-kerja.html", "Hasil Kerja", "hasil-kerja.html"],
      [root + "pages/status.html", "Cek Status", "status.html"],
      [root + "pages/reseller.html", "Reseller", "reseller.html"]
    ];

    if (inPages) {
      items[1][0] = "layanan.html";
      items[2][0] = "hasil-kerja.html";
      items[3][0] = "status.html";
      items[4][0] = "reseller.html";
    }

    links.innerHTML = items.map(function (item) {
      var active = item[2] === activePage ? ' aria-current="page"' : "";
      return '<a class="nav__link" href="' + item[0] + '"' + active + ">" + item[1] + "</a>";
    }).join("");

    var header = nav.closest(".site-header");
    var brandName = qs(".brand__name, .brand__title", header);
    var brandTag = qs(".brand__tag, .brand__sub", header);
    if (brandName) brandName.textContent = "Khonsu Socials";
    if (brandTag) brandTag.textContent = "Lunar Digital Studio";

    var right = qs(".nav__right", nav);
    if (!right) {
      right = document.createElement("div");
      right.className = "nav__right";
      nav.appendChild(right);
    }

    var themeToggle = document.createElement("button");
    themeToggle.className = "nav__theme-toggle";
    themeToggle.type = "button";
    themeToggle.innerHTML =
      '<svg class="nav__theme-icon nav__theme-icon--sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"></path></svg>' +
      '<svg class="nav__theme-icon nav__theme-icon--moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.2 14.7A8.5 8.5 0 0 1 9.3 3.8 8.5 8.5 0 1 0 20.2 14.7Z"></path></svg>';
    right.appendChild(themeToggle);
    syncThemeControls(document.documentElement.getAttribute("data-theme") || "dark");
    themeToggle.addEventListener("click", function () {
      var currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      setTheme(currentTheme === "dark" ? "light" : "dark", true);
    });

    var consult = document.createElement("a");
    consult.className = "btn nav__consult";
    consult.href = "https://wa.me/6281314604337?text=Halo%20Khonsu%20Socials%2C%20saya%20ingin%20konsultasi%20proyek.";
    consult.target = "_blank";
    consult.rel = "noopener noreferrer";
    consult.textContent = "Konsultasi";
    right.appendChild(consult);

    var toggle = document.createElement("button");
    toggle.className = "nav__toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "lunar-nav-links");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
    links.id = "lunar-nav-links";
    nav.appendChild(toggle);
    nav.setAttribute("data-lunar-nav", "true");

    function closeMenu() {
      nav.setAttribute("data-nav-open", "false");
      toggle.setAttribute("aria-expanded", "false");
    }
    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-nav-open") === "true";
      nav.setAttribute("data-nav-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
    });
    links.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeMenu();
        toggle.focus();
      }
    });
  }

  function initBrandFavicon() {
    if (qs('link[rel~="icon"]')) return;
    var icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/png";
    icon.href = /\/pages\//.test(location.pathname || "") ? "../assets/images/brand/logo.png" : "./assets/images/brand/logo.png";
    document.head.appendChild(icon);
  }

  /* =========================
    13) BOOT
  ========================= */
  function boot() {
    initTheme();
    initYear();
    initBrandFavicon();
    initLunarNav();
    initNavActive();
    initClickMicro();
    initHeroEntrance();
    initScrollReveal();
    initPortfolioModal();

    initServiceSelect();
    initOrderPage();
    initResellerOrderPage();
    initStatusPage();

    // Expose minimal debug
    window.KHONSU = {
      config: KS_CONFIG,
      apiUrl: apiUrl
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
