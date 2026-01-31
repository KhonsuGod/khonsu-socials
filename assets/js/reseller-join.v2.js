/* ==========================================================
  KHONSU SOCIALS — RESELLER JOIN v2 (FORM-ENCODED + CLEAN UI)
  File: /assets/js/reseller-join.v2.js

  NOTES:
  - Uses the same Apps Script POST style as order.v2.js (x-www-form-urlencoded)
  - Safe validation + clear error messages
========================================================== */
(() => {
  "use strict";

  // ---- DOM ----
  const byId = (id) => document.getElementById(id);

  const form = byId("joinForm");
  const btn = byId("joinSubmit");
  const msg = byId("joinMsg");

  const elName = byId("joinName");
  const elWa = byId("joinWa");
  const elCity = byId("joinCity");
  const elExp = byId("joinExperience");
  const elNote = byId("joinNote");

  // ---- Helpers ----
  function safeText(v) {
    return (v == null ? "" : String(v)).trim();
  }

  function showMsg(text, kind) {
    msg.textContent = text || "";
    msg.classList.remove("is-hidden", "is-error", "is-ok");
    if (!text) {
      msg.classList.add("is-hidden");
      return;
    }
    if (kind === "error") msg.classList.add("is-error");
    else if (kind === "ok") msg.classList.add("is-ok");
  }

  function disableSubmit(disabled) {
    if (!btn) return;
    btn.disabled = !!disabled;
    btn.setAttribute("aria-disabled", String(!!disabled));
  }

  // Normalize WhatsApp:
  // - keep + if present
  // - remove spaces/dashes/() etc
  // - convert 08xxxx -> +628xxxx (Indonesia common)
  function normalizeWa(raw) {
    let v = safeText(raw);
    v = v.replace(/[\s\-().]/g, "");
    v = v.replace(/[^\d+]/g, "");

    // 08xxxx -> +628xxxx
    if (/^0\d{8,}$/.test(v)) v = "+62" + v.slice(1);

    // 62xxxx -> +62xxxx
    if (/^62\d{7,}$/.test(v)) v = "+"+v;

    // +620 -> +62 (rare typo)
    v = v.replace(/^\+620/, "+62");

    return v;
  }

  function getApiUrl() {
    const meta = document.querySelector('meta[name="khonsu-api"]');
    const fromMeta = meta ? safeText(meta.getAttribute("content")) : "";
    const fromWindow =
      (typeof window !== "undefined" &&
        (window.KHONSU_API_URL || window.KS_API_URL || window.__KHONSU_API_URL__)) ||
      "";
    return safeText(fromMeta || fromWindow);
  }

  function parseJsonLoose(text) {
    try {
      return JSON.parse(text);
    } catch {
      // allow Apps Script returning text before JSON etc
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        try {
          return JSON.parse(text.slice(first, last + 1));
        } catch {}
      }
      return null;
    }
  }

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

    // if Apps Script returns plain text, still treat as ok but pass raw
    return data || { ok: true, raw: text };
  }

  function validate() {
    const name = safeText(elName?.value);
    const waRaw = safeText(elWa?.value);
    const city = safeText(elCity?.value);
    const experience = safeText(elExp?.value);

    if (!name) return { ok: false, message: "Nama wajib diisi." };
    if (!waRaw) return { ok: false, message: "WhatsApp wajib diisi." };
    if (!city) return { ok: false, message: "Kota wajib diisi." };
    if (!experience) return { ok: false, message: "Pengalaman wajib dipilih." };

    const wa = normalizeWa(waRaw);
    if (!/^\+?\d{9,16}$/.test(wa.replace(/^\+/, ""))) {
      return { ok: false, message: "Format WhatsApp tidak valid. Contoh: 08xxx atau +62xxx" };
    }

    return { ok: true, data: { name, wa, city, experience } };
  }

  async function submitJoin() {
    const check = validate();
    if (!check.ok) {
      showMsg(check.message, "error");
      return;
    }

    const note = safeText(elNote?.value);
    const payload = {
      action: "createResellerJoin",
      name: check.data.name,
      wa: check.data.wa,
      city: check.data.city,
      experience: check.data.experience,
      note: note,
      status: "", // biarkan kosong agar admin set (hindari validation mismatch)
      source: "website",
      t: Date.now(), // anti-cache / logging helper
    };

    disableSubmit(true);
    showMsg("Mengirim pendaftaran...", "ok");

    try {
      const data = await postForm(payload);

      // Some scripts may return {ok:true, row:..., id:...}
      if (data && data.ok === false) {
        throw new Error(data.message || "Gagal submit (ok=false)");
      }

      showMsg("Berhasil! Pendaftaran terkirim. Admin akan menghubungi kamu via WhatsApp.", "ok");
      // optional: reset fields after success
      form?.reset();
    } catch (err) {
      const msgText = (err && err.message) ? err.message : String(err);

      // Common case: Apps Script belum punya action join
      const hint =
        /action|unknown|unsupported|not found|invalid/i.test(msgText)
          ? "\n\nCatatan: Pastikan Apps Script support action 'createResellerJoin' dan menulis ke sheet 'Reseller_Join'."
          : "";

      showMsg("Gagal submit: " + msgText + hint, "error");
      console.error("[KS] reseller join submit failed", err);
    } finally {
      disableSubmit(false);
    }
  }

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitJoin();
  });

  form.addEventListener("reset", () => {
    showMsg("", "ok");
  });
})();
