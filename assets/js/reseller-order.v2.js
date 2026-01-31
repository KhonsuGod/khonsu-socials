/* ==========================================================
  KHONSU SOCIALS — RESELLER ORDER v2 (STABLE)
  File: /assets/js/reseller-order.v2.js

  Prasyarat:
  1) reseller-order.html include:
     <meta name="khonsu-api" content="https://script.google.com/macros/s/.../exec">
  2) reseller-order.html include:
     <script src="../assets/js/main.js"></script>
     <script src="../assets/js/reseller-order.v2.js"></script>

  Catatan:
  - Tanpa framework.
  - GET request untuk hindari CORS/preflight saat test Live Server.
========================================================== */
(() => {
  "use strict";

  // tanda untuk cek apakah script benar-benar ke-load
  window.__KS_RESELLER_ORDER_V2_LOADED__ = true;

  /* =========================
    Helpers DOM
  ========================= */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setText(el, txt) {
    if (!el) return;
    el.textContent = String(txt ?? "");
  }
  function setHtml(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }
  function showMsg(el, txt) {
    if (!el) return;
    el.style.display = "block";
    el.textContent = String(txt ?? "");
  }
  function hideMsg(el) {
    if (!el) return;
    el.style.display = "none";
    el.textContent = "";
  }
  function setActiveCard(cards, activeCard) {
    cards.forEach((c) => c.classList.remove("is-active"));
    if (activeCard) activeCard.classList.add("is-active");
  }

  /* =========================
    Safe storage
  ========================= */
  function safeGetLS(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSetLS(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }

  // ===== Local storage (untuk halaman status.html) =====
  const LS_LAST_ID_KEY = "khonsu_last_order_id";
  const LS_SECRETS_KEY = "khonsu_secrets"; // map: { [order_id]: secret }

  function saveOrderSecret(orderId, secret) {
    const api = (window && window.KhonsuStorage) ? window.KhonsuStorage : null;
    if (api && typeof api.saveOrderSecret === "function") {
      api.saveOrderSecret(orderId, secret);
      return;
    }
    // Fallback (should rarely happen if main.js is loaded as required)
    if (!orderId || !secret) return;
    let map = {};
    try { map = JSON.parse(safeGetLS(LS_SECRETS_KEY) || "{}") || {}; } catch { map = {}; }
    map[String(orderId)] = String(secret);
    safeSetLS(LS_SECRETS_KEY, JSON.stringify(map));
    safeSetLS(LS_LAST_ID_KEY, String(orderId));
  }

  function saveLastOrderId(orderId) {
    const api = (window && window.KhonsuStorage) ? window.KhonsuStorage : null;
    if (api && typeof api.saveLastOrderId === "function") {
      api.saveLastOrderId(orderId);
      return;
    }
    if (!orderId) return;
    safeSetLS(LS_LAST_ID_KEY, String(orderId));
  }
/* =========================
    API URL (meta > window > storage)
  ========================= */
  function getApiUrl() {
    const fromMeta = (() => {
      const meta = document.querySelector('meta[name="khonsu-api"]');
      return meta ? (meta.getAttribute("content") || "").trim() : "";
    })();

    const fromWindow =
      (typeof window !== "undefined" &&
        (window.KHONSU_API_URL ||
          window.KS_API_URL ||
          window.API_URL ||
          window.APPS_SCRIPT_URL)) ||
      "";

    const fromStorage =
      safeGetLS("KHONSU_API_URL") ||
      safeGetLS("KS_API_URL") ||
      safeGetLS("API_URL") ||
      safeGetLS("APPS_SCRIPT_URL") ||
      "";

    return (fromMeta || fromWindow || fromStorage || "").trim();
  }

  /* =========================
    Normalisasi & Parsing
  ========================= */
  function normCategory(v) {
    const s = String(v || "").trim().toLowerCase();
    if (!s) return "";
    if (s === "ig" || s.includes("insta") || s.includes("instagram")) return "instagram";
    if (s === "tt" || s.includes("tiktok") || s.includes("tik tok")) return "tiktok";
    if (s === "sh" || s.includes("shopee")) return "shopee";
    return s.replace(/[^a-z0-9]+/g, "");
  }

  function toInt(v, fallback = 0) {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function toNum(v, fallback = 0) {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  function parseUnitBase(unitText) {
    const m = String(unitText || "").match(/(\d[\d.,]*)/);
    if (!m) return 1;
    const n = toInt(m[1], 1);
    return n > 0 ? n : 1;
  }
  function formatIDR(amount) {
    const n = toNum(amount, 0);
    try {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
  }

  /* =========================
    JSON parser tahan banting
  ========================= */
  function parseJsonLoose(text) {
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const cut = text.slice(start, end + 1);
        return JSON.parse(cut);
      }
      throw new Error("Respon bukan JSON: " + String(text).slice(0, 200));
    }
  }

  /* =========================
    Fetch JSON (GET)
  ========================= */
  async function fetchJson(params) {
    const apiUrl = getApiUrl();
    if (!apiUrl) {
      throw new Error(
        'API URL kosong. Pastikan <meta name="khonsu-api" content="https://script.google.com/.../exec"> ada di <head>.'
      );
    }

    let url;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new Error("API URL tidak valid: " + apiUrl);
    }

    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
    url.searchParams.set("t", String(Date.now())); // anti-cache

    const res = await fetch(url.toString(), { method: "GET" });
    const text = await res.text();
    const data = parseJsonLoose(text);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (data && data.ok === false) throw new Error(data.message || "API ok=false");

    return data;
  }

  /* =========================
  Submit (POST form-urlencoded)
========================= */
async function postForm(params) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new Error(
      'API URL kosong. Pastikan <meta name="khonsu-api" content="https://script.google.com/.../exec"> ada di <head>.'
    );
  }

  const body = new URLSearchParams();
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null) return;
    body.append(k, String(v));
  });

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
  const text = await res.text();
  const data = parseJsonLoose(text);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (data && data.ok === false) throw new Error(data.message || "API ok=false");
  return data;
}

/* =========================
    Services Cache + Normalizer
  ========================= */
  let _servicesCache = null;

  function normalizeServiceRow(row) {
    const code =
      row.service_code ?? row.serviceCode ?? row.code ?? row.id ?? row.service_id ?? row.serviceId ?? "";

    const name = row.service_name ?? row.serviceName ?? row.name ?? row.title ?? "";

    const categoryRaw =
      row.category ??
      row.kategori ??
      row.service_category ??
      row.serviceCategory ??
      row.platform ??
      row.channel ??
      "";

    const category = normCategory(categoryRaw);

    const unit = row.unit ?? row.satuan ?? "";
    const minQty = row.min_qty ?? row.minQty ?? row.min ?? "";
    const maxQty = row.max_qty ?? row.maxQty ?? row.max ?? "";
    const priceWholesale =
      row.price_wholesale ??
      row.priceWholesale ??
      row.price ??
      row.price_retail ??
      row.priceRetail ??
      0;

    // kalau is_active ada tapi kosong -> aktif
    const isActiveRaw = row.is_active ?? row.isActive ?? row.active;
    const isActiveStr = String(isActiveRaw ?? "").trim().toLowerCase();
    const isActive =
      isActiveStr === ""
        ? true
        : ["true", "1", "yes", "y", "aktif", "active", "on"].includes(isActiveStr) || isActiveRaw === true;

    return {
      code: String(code || "").trim(),
      name: String(name || "").trim(),
      category,
      unit: String(unit || "").trim(),
      minQty: toInt(minQty, 0),
      maxQty: toInt(maxQty, 0),
      price: toNum(priceWholesale, 0),
      isActive,
      raw: row,
    };
  }

  async function loadServices() {
    if (_servicesCache) return _servicesCache;

    let data;
    try {
      data = await fetchJson({ action: "services" });
    } catch (e1) {
      try {
        data = await fetchJson({ action: "listServices" });
      } catch (e2) {
        try {
          data = await fetchJson({ action: "getServices" });
        } catch {
          throw e1;
        }
      }
    }

    const raw =
      (data && (data.services || data.items || data.data)) ||
      (Array.isArray(data) ? data : []) ||
      [];

    const list = (Array.isArray(raw) ? raw : [])
      .map(normalizeServiceRow)
      .filter((s) => s.code && s.name && s.category);

    _servicesCache = list;

    console.log("[KS] reseller services loaded:", list.length, list.slice(0, 3));
    return list;
  }

  /* =========================
    Build option paket
  ========================= */
  function buildOption(svc) {
    const opt = document.createElement("option");
    opt.value = svc.code;
    opt.textContent = `${svc.name} — ${formatIDR(svc.price)} / ${svc.unit || "unit"}`;
    opt.dataset.name = svc.name;
    opt.dataset.category = svc.category;
    opt.dataset.unit = svc.unit || "";
    opt.dataset.min = String(svc.minQty || "");
    opt.dataset.max = String(svc.maxQty || "");
    opt.dataset.price = String(svc.price || 0);
    return opt;
  }

  /* =========================
    UI: Update hint harga (reseller)
  ========================= */
  function updatePriceHint() {
    const pkgSel = qs("#resellerPackage");
    const qtyEl = qs("#resellerQty");
    const hintEl = qs("#resellerPriceHint");

    const codeHidden = qs("#serviceCode");
    const nameHidden = qs("#serviceName");

    if (!pkgSel || !hintEl) return;

    const opt = pkgSel.selectedOptions && pkgSel.selectedOptions[0];
    if (!opt || !opt.value) {
      setHtml(
        hintEl,
        `<p style="margin:0; line-height:1.8;">Pilih paket untuk melihat estimasi harga.</p>
         <p class="hint" style="margin:6px 0 0;">Harga final tetap via konfirmasi WhatsApp. QRIS belum tersedia.</p>`
      );
      if (codeHidden) codeHidden.value = "";
      if (nameHidden) nameHidden.value = "";
      return;
    }

    const svcName = opt.dataset.name || opt.textContent || "";
    const unit = opt.dataset.unit || "";
    const minQty = toInt(opt.dataset.min, 0);
    const maxQty = toInt(opt.dataset.max, 0);
    const price = toNum(opt.dataset.price, 0);

    if (codeHidden) codeHidden.value = opt.value;
    if (nameHidden) nameHidden.value = svcName;

    const qty = qtyEl ? toInt(qtyEl.value, 0) : 0;

    const base = parseUnitBase(unit);
    const ratio = qty > 0 ? (qty / base) : 0;
  const est = qty > 0 ? Math.round(ratio * price) : 0;

    const rules = [
      minQty ? `<span class="code-pill">min ${minQty}</span>` : "",
      maxQty ? `<span class="code-pill">max ${maxQty}</span>` : "",
      unit ? `<span class="code-pill">${unit}</span>` : "",
    ]
      .filter(Boolean)
      .join(" ");

    setHtml(
      hintEl,
      `
      <div style="display:grid; gap:8px;">
        <div>
          <div style="font-weight:700; line-height:1.35;">${svcName}</div>
          <div class="hint" style="margin-top:4px;">${rules || "Aturan qty mengikuti paket."}</div>
        </div>
        <div class="divider"></div>
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div class="hint" style="margin:0;">Harga per unit</div>
            <div style="font-weight:700; line-height:1.35;">${formatIDR(price)}</div>
          </div>
          <div style="text-align:right;">
            <div class="hint" style="margin:0;">Estimasi (qty sekarang)</div>
            <div style="font-weight:800; line-height:1.35;">${qty > 0 ? formatIDR(est) : "-"}</div>
          </div>
        </div>
        <div class="hint" style="margin:0;">Harga final tetap via konfirmasi WhatsApp.</div>
      </div>
      `
    );
  }

  /* =========================
    Render paket sesuai kategori (reseller)
  ========================= */
  async function renderPackages(categoryPicked) {
    const pkgSel = qs("#resellerPackage");
    const hint = qs("#resellerPackageHint");
    const hiddenCat = qs("#serviceCategory");

    if (!pkgSel) return;

    pkgSel.innerHTML = "";
    const loadingOpt = document.createElement("option");
    loadingOpt.value = "";
    loadingOpt.textContent = "Loading paket...";
    pkgSel.appendChild(loadingOpt);

    try {
      const services = await loadServices();
      const cat = normCategory(categoryPicked);

      if (hiddenCat) hiddenCat.value = cat;

      const list = services
        .filter((s) => s.isActive)
        .filter((s) => s.category === cat)
        .sort((a, b) => a.name.localeCompare(b.name, "id"));

      pkgSel.innerHTML = "";
      const head = document.createElement("option");
      head.value = "";
      head.textContent = list.length ? "— Pilih paket —" : "— Paket belum tersedia —";
      pkgSel.appendChild(head);

      list.forEach((svc) => pkgSel.appendChild(buildOption(svc)));

      if (hint) {
        hint.textContent = list.length
          ? `Paket dimuat: ${list.length}. Pilih paket untuk lihat harga.`
          : `Tidak ada service aktif untuk kategori "${cat}".`;
      }

      updatePriceHint();
    } catch (err) {
      pkgSel.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Gagal load paket —";
      pkgSel.appendChild(opt);

      if (hint) hint.textContent = "Gagal load services: " + (err?.message || String(err));
      updatePriceHint();

      console.error("[KS] reseller renderPackages error:", err);
    }
  }

  /* =========================
    Submit reseller order
  ========================= */
  async function submitResellerOrder() {
    const msgEl = qs("#resellerFormMsg");
    hideMsg(msgEl);

    const apiUrl = getApiUrl();
    if (!apiUrl) {
      showMsg(msgEl, "API URL kosong. Pastikan meta khonsu-api ada di <head>.");
      return;
    }

    const category = qs("#serviceCategory")?.value || "";
    const serviceCode = qs("#serviceCode")?.value || "";
    const serviceName = qs("#serviceName")?.value || "";

    const qty = toInt(qs("#resellerQty")?.value || 0, 0);

    const resellerName = (qs("#resellerName")?.value || "").trim();
    const resellerWa = (qs("#resellerWhatsapp")?.value || "").trim();

    const customerName = (qs("#customerName")?.value || "").trim();
    const customerWa = (qs("#customerWa")?.value || "").trim();

    const target = (qs("#targetLink")?.value || "").trim();
    const deadline = (qs("#deadline")?.value || "").trim();
    const brief = (qs("#brief")?.value || "").trim();
    const payMethod = qs("#payMethod")?.value || "MANUAL";

    // validasi minimum
    if (!category) return showMsg(msgEl, "Pilih kategori dulu.");
    if (!serviceCode) return showMsg(msgEl, "Pilih paket dulu.");
    if (!qty || qty < 1) return showMsg(msgEl, "Qty wajib diisi (minimal 1).");
    if (!resellerName) return showMsg(msgEl, "Nama reseller wajib diisi.");
    if (!resellerWa) return showMsg(msgEl, "WhatsApp reseller wajib diisi.");
    if (!customerName) return showMsg(msgEl, "Nama customer wajib diisi.");
    if (!customerWa) return showMsg(msgEl, "WhatsApp customer wajib diisi.");
    if (!target) return showMsg(msgEl, "Target (username/link/produk) wajib diisi.");

    // estimasi amount (berdasarkan paket terpilih)
    const opt = qs("#resellerPackage")?.selectedOptions?.[0];
    const unit = opt?.dataset?.unit || "";
    const price = toNum(opt?.dataset?.price, 0);
    const base = parseUnitBase(unit);
    const amount = Math.round((qty / base) * price);

    showMsg(msgEl, "Mengirim reseller order...");

    try {
      const meta = {
        deadline,
        brief,
        channel: "reseller",
        category,
        reseller_name: resellerName,
        reseller_wa: resellerWa,
      };

      // pakai createOrder supaya konsisten dengan direct order,
      // channel dibedakan jadi "reseller"
      const data = await postForm({ action: "createOrder",
        channel: "reseller",
        service_category: category,
        service_code: serviceCode,
        service_name: serviceName,
        qty,
        target,
        amount,
        pay_method: payMethod,

        reseller_name: resellerName,
        reseller_wa: resellerWa,
        customer_name: customerName,
        wa: customerWa,
        customer_wa: customerWa,

        note: brief || "",
        meta_json: JSON.stringify(meta),
      });

      const order = data.order || data.data || data;

      const orderId = order.order_id || order.orderId || order.id || "-";
      const secret =
        order.secret ||
        order.secret_order ||
        order.order_secret ||
        order.secretKey ||
        order.secret_key ||
        order.orderSecret ||
        order.secretOrder ||
        order.token ||
        order.order_token ||
        order.secret_token ||
        "";
      if (orderId && orderId !== "-" && secret) saveOrderSecret(orderId, secret);
      else if (orderId && orderId !== "-") saveLastOrderId(orderId);

      const status = order.status || "Menunggu Konfirmasi";
      const paket = order.service_name || serviceName || "-";
      const amt = order.amount ?? amount;

      setText(qs("#resellerResultOrderId"), orderId);
      setText(qs("#resellerResultStatus"), status);
      setText(qs("#resellerResultPackage"), paket);
      setText(qs("#resellerResultAmount"), formatIDR(amt));

      const note = qs("#resellerResultNote");
      if (note) {
        note.textContent =
          orderId && orderId !== "-"
            ? "Reseller order berhasil dibuat. Simpan Order ID untuk cek status."
            : "Order berhasil, tapi Order ID tidak terbaca. Cek response Apps Script.";
      }

      // copy button
      const copyBtn = qs("#btnCopyOrderId");
      if (copyBtn) {
        copyBtn.onclick = (e) => {
          e.preventDefault();
          if (!orderId || orderId === "-") return;
          navigator.clipboard?.writeText(orderId).then(() => {
            showMsg(msgEl, "Order ID berhasil di-copy: " + orderId);
          });
        };
      }

      showMsg(msgEl, "Berhasil. Order ID: " + orderId);
    } catch (err) {
      showMsg(msgEl, "Gagal submit: " + (err?.message || String(err)));
      console.error("[KS] reseller submit error:", err);
    }
  }

  /* =========================
    Init (reseller)
  ========================= */
  function initResellerOrder() {
    const grid = qs("#resellerCategoryGrid");
    const pkgSel = qs("#resellerPackage");
    const qtyEl = qs("#resellerQty");
    const btn = qs("#btnResellerSubmit");

    if (!grid || !pkgSel) {
      console.log("[KS] Reseller Order elements not found on this page (skip init).");
      return;
    }

    // health check API
    const api = getApiUrl();
    console.log("[KS] RESELLER API URL:", api || "(EMPTY)");

    const cards = qsa(".select-card[data-service-category]", grid);

    const pickCategory = (card) => {
      const cat = card.getAttribute("data-service-category") || "";
      setActiveCard(cards, card);
      renderPackages(cat);
    };

    cards.forEach((card) => {
      card.addEventListener("click", () => pickCategory(card));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pickCategory(card);
        }
      });
    });

    pkgSel.addEventListener("change", updatePriceHint);
    if (qtyEl) qtyEl.addEventListener("input", updatePriceHint);
    if (btn) btn.addEventListener("click", submitResellerOrder);

    updatePriceHint();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const year = qs("#year");
    if (year) year.textContent = String(new Date().getFullYear());

    initResellerOrder();
  });
})();