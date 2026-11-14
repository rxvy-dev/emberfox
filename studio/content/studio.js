/* Ignifox Studio — about:ignifox
 * Privileged page (system principal): talks to Services.prefs and
 * CustomizableUI directly. Every control is live: change it and every
 * browser window repaints immediately, no restart. */

import * as M from "chrome://ignifox/content/prefs.sys.mjs";
import * as D from "chrome://ignifox/content/data.sys.mjs";

const { IgniBoot } = ChromeUtils.importESModule("chrome://ignifox/content/boot.sys.mjs");
const Importer = ChromeUtils.importESModule("chrome://ignifox/content/importer.sys.mjs");
const Fonts = ChromeUtils.importESModule("chrome://ignifox/content/fonts.sys.mjs");
let CUI = null;
try {
  ({ CustomizableUI: CUI } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
  ));
} catch (e) {
  try {
    ({ CustomizableUI: CUI } = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs"));
  } catch (e2) {
    console.warn("[Ignifox Studio] CustomizableUI unavailable", e2);
  }
}

const P = Services.prefs;
const $ = (sel, root = document) => root.querySelector(sel);

// ------------------------------------------------------------------ dom
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k == "class") el.className = v;
    else if (k == "text") el.textContent = v;
    else if (k == "style" && typeof v == "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k == "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------------------------------------------------------------- prefs
function typeOf(key) {
  return M.typeOf(key) || "string";
}
function get(key) {
  const v = M.readPref(P, key, typeOf(key));
  return v === undefined ? M.IGNI_PREFS[key]?.def : v;
}
function set(key, value) {
  if (!M.writePref(P, key, typeOf(key), value)) {
    toast("That setting is locked by policy");
  }
}
function igniValues() {
  const out = {};
  for (const key of Object.keys(M.IGNI_PREFS)) out[key] = get(key);
  return out;
}

// Controls register an update() so external pref changes re-sync the UI.
// bind(fn, el): fn re-runs on any pref change; dropped once `el` leaves the DOM.
const bindings = new Set();
function bind(fn, el = null) {
  bindings.add({ fn, el });
  fn();
  return fn;
}
let refreshQueued = false;
function refreshAll() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    paintStudio();
    for (const b of bindings) {
      if (b.el && !b.el.isConnected) { bindings.delete(b); continue; }
      try { b.fn(); } catch (e) { console.error(e); }
    }
  });
}

const prefObserver = { observe: () => refreshAll() };
P.addObserver("ignifox.", prefObserver);
for (const key of Object.keys(M.NATIVE_PREFS)) P.addObserver(key, prefObserver);
window.addEventListener("unload", () => {
  P.removeObserver("ignifox.", prefObserver);
  for (const key of Object.keys(M.NATIVE_PREFS)) P.removeObserver(key, prefObserver);
  if (CUI && placementListener) CUI.removeListener(placementListener);
});

/** Studio wears the active palette. */
function paintStudio() {
  const pal = M.resolvePalette(igniValues());
  const s = document.documentElement.style;
  s.setProperty("--bg", pal.bg);
  s.setProperty("--bg2", pal.bg2);
  s.setProperty("--bg3", pal.bg3);
  s.setProperty("--fg", pal.fg);
  s.setProperty("--dim", pal.fgDim);
  s.setProperty("--accent", pal.accent);
  s.setProperty("--accent2", pal.accent2);
  document.documentElement.toggleAttribute("data-light", !pal.dark);
}

// ---------------------------------------------------------- row builders
function row(key, label, desc, ctl) {
  const reset = key
    ? h("button", { class: "reset", title: "Reset to default", onclick: () => P.clearUserPref(key) }, "↺")
    : null;
  const lockBadge = h("span", { class: "badge", hidden: true }, "Locked");
  const r = h("div", { class: "row" },
    h("div", {},
      h("div", { class: "label" }, label, lockBadge),
      desc ? h("div", { class: "desc" }, desc) : null),
    h("div", { class: "ctl" }, ctl, reset));
  if (key) {
    bind(() => {
      const locked = P.prefIsLocked(key);
      r.classList.toggle("locked", locked);
      r.classList.toggle("modified", P.prefHasUserValue(key) && !locked);
      lockBadge.hidden = !locked;
      r.querySelectorAll("input, select, textarea").forEach(i => (i.disabled = locked));
    }, r);
  }
  return r;
}

function toggle(key, label, desc, { on = true, off = false } = {}) {
  const input = h("input", { type: "checkbox", role: "switch", "aria-label": label });
  input.addEventListener("change", () => set(key, input.checked ? on : off));
  bind(() => { input.checked = get(key) === on; }, input);
  return row(key, label, desc, h("label", { class: "switch" }, input));
}

function select(key, label, desc, options) {
  const sel = h("select", { "aria-label": label },
    options.map(([v, l]) => h("option", { value: String(v) }, l)));
  sel.addEventListener("change", () => set(key, typeOf(key) == "int" ? parseInt(sel.value, 10) : sel.value));
  bind(() => {
    const v = String(get(key));
    if (![...sel.options].some(o => o.value == v)) sel.append(h("option", { value: v }, v));
    sel.value = v;
  }, sel);
  return row(key, label, desc, sel);
}

function range(key, label, desc, min, max, step = 1, fmt = v => v) {
  const input = h("input", { type: "range", min, max, step, "aria-label": label });
  const out = h("span", { class: "val" });
  input.addEventListener("input", () => { out.textContent = fmt(+input.value); set(key, +input.value); });
  bind(() => { const v = get(key) ?? min; input.value = v; out.textContent = fmt(+v); }, input);
  return row(key, label, desc, [input, out]);
}

function dateRow(key, label, desc) {
  const input = h("input", { type: "datetime-local", "aria-label": label });
  input.addEventListener("change", () => set(key, input.value));
  bind(() => { if (document.activeElement != input) input.value = get(key) || ""; }, input);
  const clear = h("button", { class: "btn", onclick: () => set(key, "") }, "Clear");
  return row(key, label, desc, h("span", { class: "btns" }, input, clear));
}

function textArea(key, label, desc, placeholder = "") {
  const input = h("textarea", { rows: 4, placeholder, spellcheck: "false", "aria-label": label, class: "ta" });
  input.addEventListener("change", () => set(key, input.value.trim()));
  bind(() => { if (document.activeElement != input) input.value = get(key) || ""; }, input);
  return row(key, label, desc, input);
}

function text(key, label, desc, { placeholder = "", list = null } = {}) {
  const input = h("input", { type: "text", placeholder, list: list ? list.id : null, "aria-label": label });
  input.addEventListener("change", () => set(key, input.value.trim()));
  bind(() => { if (document.activeElement != input) input.value = get(key) || ""; }, input);
  return row(key, label, desc, [input, list]);
}

function colorPick(key, label, desc) {
  const input = h("input", { type: "color", "aria-label": label });
  const clear = h("button", { class: "btn", onclick: () => P.clearUserPref(key) }, "Use preset");
  input.addEventListener("input", () => set(key, input.value));
  bind(() => {
    const v = get(key);
    const pal = M.resolvePalette(igniValues());
    input.value = M.isHex(v) && v.length == 7 ? v : pal.accent;
    clear.hidden = !M.isHex(v);
  }, input);
  return row(null, label, desc, [input, clear]);
}

const card = (...rows) => h("div", { class: "card" }, rows);
function safeJSON(s) {
  try { const v = JSON.parse(s || "{}"); return v && typeof v == "object" ? v : {}; } catch (e) { return {}; }
}

// ------------------------------------------------------------ mini preview
function miniBrowser(p) {
  return h("div", { class: "mini", style: { background: p.bg, "--a": p.accent } },
    h("div", { class: "strip" },
      h("div", { class: "tab sel", style: { background: p.bg2 } }),
      h("div", { class: "tab", style: { background: "transparent", border: `1px solid ${p.fgDim}33` } })),
    h("div", { class: "bar", style: { background: p.bg2 } },
      h("div", { class: "ic", style: { background: p.fgDim } }),
      h("div", { class: "url", style: { background: p.bg3, boxShadow: `inset 0 0 0 1px ${p.accent}55` } }),
      h("div", { class: "ic", style: { background: p.accent } })),
    h("div", { class: "page", style: { background: p.bg } },
      h("b", { style: { background: `linear-gradient(90deg, ${p.accent}, ${p.accent2})` } })));
}

function themeCard(id, pal, label) {
  const btn = h("button", { class: "theme" + (get("ignifox.theme.preset") == id ? " selected" : ""), title: label, onclick: () => set("ignifox.theme.preset", id) },
    miniBrowser(pal),
    h("div", { class: "name" }, h("span", {}, label),
      h("span", { class: "dots" }, [pal.accent, pal.accent2, pal.fg].map(c => h("i", { style: { background: c } })))));
  return btn;
}

function themeGallery() {
  const grid = h("div", { class: "themes" });
  bind(() => {
    grid.replaceChildren(
      ...Object.entries(M.THEMES).map(([id, t]) => themeCard(id, t, t.name)),
      ...Object.entries(M.savedThemes(igniValues())).map(([name, p]) =>
        themeCard("user:" + name, M.completePalette(p, name), "★ " + name)),
      themeCard("custom", M.completePalette(safeJSON(get("ignifox.theme.custom")), "Custom"), "✎ Custom"));
  }, grid);
  return grid;
}

// ---------------------------------------------------------- palette editor
function paletteEditor() {
  const inputs = {};
  const rows = M.PALETTE_KEYS.map(k => {
    const input = h("input", { type: "color", "aria-label": M.PALETTE_LABELS[k] });
    const hex = h("span", { class: "val" });
    inputs[k] = { input, hex };
    input.addEventListener("input", () => editColor(k, input.value));
    return row(null, M.PALETTE_LABELS[k], null, [hex, input]);
  });

  function editColor(k, value) {
    const v = igniValues();
    const cur = M.resolvePalette(v);
    const next = {};
    M.PALETTE_KEYS.forEach(key => (next[key] = cur[key]));
    next[k] = value;
    set("ignifox.theme.custom", JSON.stringify(next));
    if (v["ignifox.theme.preset"] != "custom") {
      P.clearUserPref("ignifox.theme.accent");
      set("ignifox.theme.preset", "custom");
    }
  }

  bind(() => {
    const pal = M.resolvePalette(igniValues());
    for (const k of M.PALETTE_KEYS) {
      if (document.activeElement != inputs[k].input) inputs[k].input.value = pal[k];
      inputs[k].hex.textContent = pal[k];
    }
  }, inputs.bg.input);

  // save / share / delete
  const nameIn = h("input", { type: "text", placeholder: "Theme name", "aria-label": "Theme name", style: { minWidth: "150px" } });
  const codeIn = h("input", { type: "text", placeholder: "igni:0b0607,…", "aria-label": "Theme code", style: { minWidth: "220px" } });
  const delBtn = h("button", { class: "btn danger", onclick: deleteSaved }, "Delete saved theme");

  function saveTheme() {
    const name = nameIn.value.trim().replace(/[^\w \-]/g, "").slice(0, 30);
    if (!name) { toast("Give the theme a name first"); return; }
    const v = igniValues();
    const saved = M.savedThemes(v);
    const pal = M.resolvePalette(v);
    saved[name] = Object.fromEntries(M.PALETTE_KEYS.map(k => [k, pal[k]]));
    set("ignifox.theme.saved", JSON.stringify(saved));
    set("ignifox.theme.preset", "user:" + name);
    nameIn.value = "";
    toast(`Saved “${name}”`);
  }
  function deleteSaved() {
    const preset = get("ignifox.theme.preset");
    if (!preset.startsWith("user:")) return;
    const saved = M.savedThemes(igniValues());
    delete saved[preset.slice(5)];
    set("ignifox.theme.saved", JSON.stringify(saved));
    set("ignifox.theme.preset", "ignis");
    toast("Theme deleted");
  }
  async function copyCode() {
    const code = M.paletteToCode(M.resolvePalette(igniValues()));
    await navigator.clipboard.writeText(code);
    toast("Theme code copied: " + code);
  }
  function applyCode() {
    const pal = M.codeToPalette(codeIn.value);
    if (!pal) { toast("That isn't a valid igni: theme code"); return; }
    set("ignifox.theme.custom", JSON.stringify(Object.fromEntries(M.PALETTE_KEYS.map(k => [k, pal[k]]))));
    set("ignifox.theme.preset", "custom");
    codeIn.value = "";
    toast("Theme applied");
  }
  bind(() => { delBtn.hidden = !String(get("ignifox.theme.preset")).startsWith("user:"); }, delBtn);

  return h("div", {},
    card(...rows),
    h("div", { class: "card", style: { marginTop: "14px" } },
      row(null, "Save as my theme", "Keeps the current colors as a named theme in the gallery.",
        [nameIn, h("button", { class: "btn primary", onclick: saveTheme }, "Save")]),
      row(null, "Share", "Copy a short code anyone can paste into their Ignifox, or scan it with your phone.",
        [h("button", { class: "btn", onclick: copyCode }, "Copy theme code"),
         h("button", { class: "btn", onclick: () => showThemeQR(M.resolvePalette(igniValues())) }, "QR for my phone"), delBtn]),
      row(null, "Paste a theme code", null,
        [codeIn, h("button", { class: "btn", onclick: applyCode }, "Apply")])));
}

// ------------------------------------------------------------------ theme gallery + QR
function themeSwatch(p) {
  return h("div", { class: "g-swatch", style: { background: p.bg, color: p.fg, borderColor: p.bg3 } },
    h("div", { class: "g-bar", style: { background: p.bg2 } },
      h("i", { style: { background: p.accent } }), h("i", { style: { background: p.accent2 } }), h("i", { style: { background: p.fgDim } })),
    h("div", { class: "g-body" }, h("b", { style: { color: p.fg } }, "Aa"), h("span", { style: { color: p.fgDim } }, "text"),
      h("span", { class: "g-pill", style: { background: p.accent, color: M.luminance(p.accent) > 0.4 ? "#000" : "#fff" } }, "accent")));
}

function useGalleryTheme(t) {
  const pal = M.codeToPalette(t.code);
  if (!pal) return;
  const saved = M.savedThemes(igniValues());
  const name = t.name.replace(/[^\w \-]/g, "").slice(0, 30) || "Gallery theme";
  saved[name] = Object.fromEntries(M.PALETTE_KEYS.map(k => [k, pal[k]]));
  set("ignifox.theme.saved", JSON.stringify(saved));
  set("ignifox.theme.accent", "");
  set("ignifox.theme.auto", "off");
  set("ignifox.theme.preset", "user:" + name);
  toast(`Using “${t.name}” (saved to your themes)`);
}

function communityGallery() {
  const grid = h("div", { class: "gallery" });
  const filter = h("input", { type: "search", placeholder: "Filter: dark, red, retro…", "aria-label": "Filter themes", hidden: true });
  const status = h("span", { class: "val", style: { textAlign: "start" } });
  let themes = [];
  const render = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = themes.filter(t => !q || (t.name + " " + t.tags.join(" ") + " " + t.description).toLowerCase().includes(q));
    grid.replaceChildren(...shown.map(t => {
      const p = M.codeToPalette(t.code);
      return h("div", { class: "g-card" }, themeSwatch(p),
        h("div", { class: "g-meta" }, h("b", {}, t.name), h("span", { class: "desc" }, t.description || (t.author ? "by " + t.author : ""))),
        h("div", { class: "btns" },
          h("button", { class: "btn primary", onclick: () => useGalleryTheme(t) }, "Use"),
          h("button", { class: "btn", title: "QR code for Ignifox on your phone", onclick: () => showThemeQR(p, t.name) }, "QR")));
    }));
    status.textContent = shown.length ? `${shown.length} theme${shown.length == 1 ? "" : "s"}` : themes.length ? "No theme matches" : "";
  };
  filter.addEventListener("input", render);
  const browse = h("button", { class: "btn primary", onclick: async () => {
    browse.disabled = true;
    status.textContent = "Loading…";
    try {
      themes = await IgniBoot.fetchGallery();
      filter.hidden = false;
      browse.hidden = true;
      render();
    } catch (e) {
      status.textContent = "Couldn't load the gallery: " + e.message;
      browse.disabled = false;
    }
  } }, "Browse the gallery");
  const submit = h("button", { class: "btn", onclick: () => window.open(M.GALLERY_SUBMIT) }, "Share my theme");
  return h("div", {}, h("div", { class: "btns", style: { marginBottom: "10px" } }, browse, filter, submit, status), grid);
}

/** A dialog with a QR code that opens the theme in Ignifox for Android. */
function showThemeQR(p, name = "My theme") {
  const code = M.paletteToCode(p);
  const link = M.themeLink(code);
  const qr = window.qrcode(0, "M");
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount(), scale = 6, quiet = 4;
  const canvas = h("canvas", { width: (n + quiet * 2) * scale, height: (n + quiet * 2) * scale, class: "qr" });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  const dlg = h("dialog", { class: "qr-dialog" },
    h("h2", {}, name),
    canvas,
    h("p", { class: "lede" }, "Scan with your phone's camera to open this theme in Ignifox for Android. If your camera app only shows text, copy it and paste it in Studio → “Use a theme from Ignifox on Linux”."),
    h("code", { class: "qr-code" }, code),
    h("div", { class: "btns" },
      h("button", { class: "btn", onclick: async () => { await navigator.clipboard.writeText(code); toast("Theme code copied"); } }, "Copy code"),
      h("button", { class: "btn primary", onclick: () => dlg.close() }, "Done")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ------------------------------------------------------------------ nav
const ICONS = {
  look: "M12 2c1 4 6 5 5 10-.5 2.6-2.6 4-5 4s-4.6-1.4-5-4c-.6-3.6 2.4-4.6 2.8-8 1 2 1.6 3.2 1.6 4.8C12.2 7 12.6 4.6 12 2zM4 20h16v2H4z",
  placement: "M3 4h18v4H3zM3 10h7v10H3zM12 10h9v4h-9zM12 16h9v4h-9z",
  workspaces: "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm12 0h2v3h3v2h-3v3h-2v-3h-3v-2h3z",
  newtab: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v12h16V6zm7 2h2v3h3v2h-3v3h-2v-3H8v-2h3z",
  search: "M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z",
  browsing: "M4 4h16v16H4zM6 8h12v2H6zM6 12h8v2H6z",
  privacy: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zm0 4a3 3 0 00-3 3v2H8v6h8v-6h-1V9a3 3 0 00-3-3zm0 2a1 1 0 011 1v2h-2V9a1 1 0 011-1z",
  ai: "M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2zM19 16l1 2.5 2.5 1-2.5 1L19 23l-1-2.5-2.5-1 2.5-1z",
  css: "M8 4L2 12l6 8 1.6-1.2L4.5 12l5.1-6.8zM16 4l-1.6 1.2 5.1 6.8-5.1 6.8L16 20l6-8z",
  backup: "M12 3l5 5h-3v6h-4V8H7zM4 16h2v3h12v-3h2v5H4z",
  fonts: "M4 20l6-16h2l6 16h-2.3l-1.6-4.5H7.9L6.3 20zm4.6-6.5h4.8L11 6.6z",
  addons: "M10 2a2 2 0 012 2v1h4a1 1 0 011 1v4h1a2 2 0 110 4h-1v4a1 1 0 01-1 1h-4v-1a2 2 0 10-4 0v1H4a1 1 0 01-1-1v-4h1a2 2 0 100-4H3V6a1 1 0 011-1h4V4a2 2 0 012-2z",
  import: "M12 3v10.6l3.3-3.3 1.4 1.4L11 17.4l-5.7-5.7 1.4-1.4 3.3 3.3V3zM4 19h14v2H4z",
  about: "M12 2a10 10 0 110 20 10 10 0 010-20zm-1 8v7h2v-7zm0-4v2h2V6z",
};
const SECTIONS = [
  ["look", "Look & Color", renderLook],
  ["fonts", "Fonts", renderFonts],
  ["newtab", "New Tab", renderNewtab],
  ["search", "Search", renderSearch],
  ["placement", "Placement", renderPlacement],
  ["workspaces", "Workspaces & Panels", renderWorkspaces],
  ["browsing", "Tabs & Browsing", renderBrowsing],
  ["privacy", "Privacy", renderPrivacy],
  ["ai", "AI Features", renderAI],
  ["addons", "Add-ons", renderAddons],
  ["css", "Custom CSS", renderCSS],
  ["import", "Import", renderImport],
  ["backup", "Backup & Reset", renderBackup],
  ["about", "About", renderAbout],
];

function svgIcon(d) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

// ================================================================ LOOK
function renderLook() {
  return [
    h("h1", {}, "Look & Color"),
    h("p", { class: "lede" }, "Pick a preset, or take any color you like and make it yours. Every change paints the whole browser instantly."),
    card(
      toggle("ignifox.theme.enabled", "Theme painting", "Paint the browser with the palette below. Turn off to use plain Firefox colors."),
      toggle("ignifox.theme.respectAddonThemes", "Step aside for add-on themes", "If you install a theme from addons.mozilla.org, show it instead of Ignifox colors."),
      toggle("ignifox.theme.contentBg", "Tint blank pages", "New tabs and loading pages use the theme background instead of flashing white.")),

    h("h2", {}, "One-click looks"),
    h("p", { class: "lede" }, "Each look changes the theme, tab layout, shapes and spacing together. Tweak anything after."),
    looksPicker(),
    h("h2", {}, "Themes"),
    themeGallery(),
    h("div", { class: "btns", style: { marginTop: "12px" } },
      h("button", { class: "btn", onclick: surpriseMe }, "🎲 Surprise me"),
      h("span", { class: "val", style: { textAlign: "start" } }, "Random colors that are always readable. Keep it with Save as my theme below.")),

    h("h2", {}, "Theme gallery"),
    h("p", { class: "lede" }, "Themes made by other Ignifox users. Browsing downloads the list from the Ignifox GitHub repository."),
    communityGallery(),

    h("h2", {}, "Day and night"),
    h("p", { class: "lede" }, "Let Ignifox change theme by the clock: one for the day, one for the night."),
    card(
      toggle("ignifox.theme.auto", "Switch themes automatically", "Uses the two themes below instead of the one picked above.", { on: "time", off: "off" }),
      select("ignifox.theme.day", "Day theme", null, Object.entries(M.THEMES).map(([k, t]) => [k, t.name])),
      select("ignifox.theme.night", "Night theme", null, Object.entries(M.THEMES).map(([k, t]) => [k, t.name])),
      range("ignifox.theme.dayStart", "Day starts at", null, 0, 23, 1, v => `${String(v).padStart(2, "0")}:00`),
      range("ignifox.theme.nightStart", "Night starts at", null, 0, 23, 1, v => `${String(v).padStart(2, "0")}:00`)),

    h("h2", {}, "Site tint"),
    card(
      toggle("ignifox.theme.siteTint", "Tint the toolbars with each site's colour", "Taken from the site's icon, like Arc. Grey icons leave your theme as it is."),
      range("ignifox.theme.siteTint.strength", "Tint strength", null, 5, 80, 5, v => `${v}%`)),

    h("h2", {}, "Quick accent"),
    card(colorPick("ignifox.theme.accent", "Accent color", "Keep the preset, just swap its highlight color (focus rings, glow, progress).")),

    h("h2", {}, "Palette editor"),
    h("p", { class: "lede" }, "Change any surface. Editing switches you to your Custom theme, starting from whatever is active, so you never lose a preset."),
    paletteEditor(),

    h("h2", {}, "Effects"),
    card(
      toggle("ignifox.fx.glow", "Glow on the active tab", "A soft accent halo around the selected tab and focused URL bar."),
      toggle("ignifox.fx.accentStrip", "Accent strip", "A thin accent gradient line between tabs and toolbar."),
      toggle("ignifox.fx.progressBar", "Flame loading bar", "Animated accent line on tabs that are loading."),
      toggle("ui.prefersReducedMotion", "Reduce motion", "Turn off UI animations everywhere, including websites that respect it.", { on: 1, off: 0 })),

    h("h2", {}, "Tab strip background"),
    card(
      select("ignifox.frame.style", "Background", "What sits behind the tabs and toolbar.",
        [["solid", "Solid theme color"], ["gradient", "Accent gradient"], ["image", "My own picture"]]),
      row(null, "Picture", "A wide image works best, like a Firefox theme header.", [frameFile(), h("button", { class: "btn", onclick: () => document.getElementById("frame-file").click() }, "Choose a picture…")]),
      range("ignifox.frame.dim", "Darken picture", "Keeps tab text readable.", 0, 90, 5, v => `${v}%`)),
    h("h2", {}, "Shape"),
    card(
      range("ignifox.shape.radius", "Corner roundness", "Tabs, buttons, URL bar and menus.", 0, 20, 1, v => `${v}px`),
      select("ignifox.tabs.style", "Tab style", null,
        [["default", "Default"], ["pill", "Pills"], ["underline", "Underline (flat, accent line)"], ["boxy", "Boxy (square corners)"]]),
      range("ignifox.tabs.height", "Tab height", "Leave at auto for Firefox's size.", 0, 56, 1, v => (v < 20 ? "auto" : `${v}px`)),
      toggle("ignifox.layout.floatingContent", "Floating page", "Web pages sit in a rounded card with a gap around them."),
      range("ignifox.layout.contentGap", "Floating page gap", null, 2, 24, 1, v => `${v}px`),
      select("layout.css.devPixelsPerPx", "Interface scale", "Scales the whole browser. Handy on HiDPI or TV screens.",
        [["-1.0", "Auto (follow system)"], ["0.9", "90%"], ["1.0", "100%"], ["1.1", "110%"], ["1.25", "125%"], ["1.5", "150%"], ["1.75", "175%"], ["2.0", "200%"]]),
      select("widget.non-native-theme.scrollbar.style", "Scrollbar style", null,
        [[0, "Default"], [1, "Thin rounded (macOS-like)"], [2, "GTK"], [3, "Minimal overlay (Android-like)"], [4, "Classic (Windows 10)"], [5, "Modern (Windows 11)"]]),
      toggle("widget.gtk.overlay-scrollbars.enabled", "Overlay scrollbars", "Scrollbars float over the page and fade out."),
      toggle("ignifox.layout.compactMenus", "Compact menus", "Tighter right-click and app menus."),
      range("browser.tabs.tabMinWidth", "Tab minimum width", "Smaller = more tabs before scrolling.", 40, 250, 5, v => `${v}px`),
      range("ignifox.shape.tabMaxWidth", "Tab maximum width", null, 120, 500, 5, v => `${v}px`),
      select("browser.uidensity", "Density", "Compact trims padding across all toolbars.", [[0, "Normal"], [1, "Compact"]]),
      select("layout.css.prefers-color-scheme.content-override", "Websites prefer", "What color scheme sites see when they offer light/dark versions.",
        [[0, "Dark"], [1, "Light"], [2, "Follow system"], [3, "Follow browser theme"]])),
  ];
}

// ============================================================== NEW TAB
/** Static background for each wallpaper, used by the preview and the picker tiles. */
function wallBackground(id, p) {
  return {
    embers: `radial-gradient(120% 90% at 50% 120%, ${p.accent}aa, transparent 70%), ${p.bg}`,
    aurora: `radial-gradient(70% 70% at 20% 20%, ${p.accent}aa, transparent 60%), radial-gradient(70% 70% at 90% 100%, ${p.accent2}88, transparent 60%), ${p.bg}`,
    starfield: `radial-gradient(80% 80% at 50% 50%, ${p.accent}33, transparent 70%), ${p.bg}`,
    matrix: p.bg,
    snow: `linear-gradient(180deg, ${p.bg2}, ${p.bg} 75%)`,
    gradient: `radial-gradient(90% 90% at 80% 0%, ${p.accent}88, transparent 60%), linear-gradient(160deg, ${p.bg2}, ${p.bg})`,
    solid: p.bg2, none: p.bg,
    image: `repeating-linear-gradient(45deg, ${p.bg2} 0 8px, ${p.bg3} 8px 16px)`,
  }[id] || p.bg;
}

/**
 * Paints a box like wallpaper `id` and, for the animated ones, runs the very same effect the
 * new tab page runs (newtab/fx.js) in a canvas behind the box's content.
 */
function paintWall(el, id, p, motion) {
  el.style.background = wallBackground(id, p);
  el.classList.add("fxsw");
  el.dataset.fx = id;
  el.dataset.motion = motion;
  for (const [k, c] of [["--sw-a", p.accent], ["--sw-a2", p.accent2], ["--sw-fg", p.fg]]) {
    el.style.setProperty(k, c);
  }
  const FX = window.IGNI_FX;
  if (FX && FX.has(id)) {
    const cv = h("canvas", { class: "fxc", "aria-hidden": "true" });
    el.prepend(cv);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const still = () => motion == "off" || (motion == "system" && reduce.matches);
    let draw = null, W = 0, H = 0, frames = 0;
    const frame = t => {
      if (!cv.isConnected && frames > 0) return;           // the tile was re-rendered: stop
      const w = cv.clientWidth, hh = cv.clientHeight;
      if (w != W || hh != H) {
        W = w; H = hh;
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
        const ctx = cv.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw = FX.create(id, W, H, p);
      }
      if (draw) draw(cv.getContext("2d"), t);
      frames++;
      // A still frame needs a few steps to look like the effect, then it stops.
      if (!still() || frames < 40) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  return el;
}

function newtabPreview() {
  const box = h("div", { class: "nt-preview" });
  bind(() => {
    const v = igniValues();
    const p = M.resolvePalette(v);
    const wall = v["ignifox.newtab.wallpaper"];
    box.style.color = p.fg;
    const links = M.newtabLinks(v).slice(0, v["ignifox.newtab.columns"]);
    const now = new Date();
    let hr = now.getHours();
    const mm = String(now.getMinutes()).padStart(2, "0");
    if (!v["ignifox.newtab.clock24"]) hr = hr % 12 || 12;
    const top = v["ignifox.newtab.layout"] == "top";
    const minimal = v["ignifox.newtab.layout"] == "minimal";
    box.replaceChildren(h("div", { class: "nt-col", style: { justifyContent: top ? "flex-start" : "center", paddingTop: top ? "26px" : "0" } },
      v["ignifox.newtab.clock"] && !minimal ? h("div", { class: "nt-clock" }, `${hr}:${mm}`) : null,
      v["ignifox.newtab.greeting"] && !minimal ? h("div", { class: "nt-greet", style: { color: p.accent2 } },
        v["ignifox.newtab.name"] ? `Good evening, ${v["ignifox.newtab.name"]}` : "Good evening") : null,
      v["ignifox.newtab.search"] ? h("div", { class: "nt-search", style: { background: p.bg2, borderColor: p.accent + "66" } },
        h("span", { class: "nt-chip", style: { background: p.fg + "18" } }, "engine ▾"), h("span", { style: { opacity: .5 } }, "Search…")) : null,
      h("div", { class: "nt-tiles" }, links.map(l => h("i", {
        class: "nt-tile " + v["ignifox.newtab.tileStyle"], style: { background: p.bg2, color: p.accent },
      }, (l.title || "?").charAt(0))))));
    paintWall(box, wall in M.WALLPAPERS ? wall : "embers", p, v["ignifox.newtab.motion"]);
  }, box);
  return box;
}

function wallpaperPicker() {
  const grid = h("div", { class: "walls" });
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm", hidden: true });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    if (!f) return;
    const video = f.type.startsWith("video/");
    if (f.size > (video ? 200 : 40) * 1024 * 1024) { toast(video ? "That video is over 200 MB" : "That picture is over 40 MB"); return; }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      await IgniBoot.setNewtabWallpaper(bytes, (f.name.split(".").pop() || "jpg"));
      toast("Wallpaper set");
    } catch (e) {
      toast("Couldn't use that picture: " + e.message);
    }
    file.value = "";
  });
  bind(() => {
    const v = igniValues();
    const p = M.resolvePalette(v);
    const cur = v["ignifox.newtab.wallpaper"];
    grid.replaceChildren(...Object.entries(M.WALLPAPERS).map(([id, label]) =>
      h("button", {
        class: "wall" + (cur == id ? " selected" : ""),
        onclick: () => (id == "image" && !v["ignifox.newtab.wallpaperFile"] ? file.click() : set("ignifox.newtab.wallpaper", id)),
      }, paintWall(h("div", { class: "sw" }), id, p, v["ignifox.newtab.motion"]), h("span", {}, label))),
      file);
  }, grid);
  return h("div", {}, grid, h("div", { class: "btns", style: { marginTop: "10px" } },
    h("button", { class: "btn", onclick: () => file.click() }, "Choose a picture, GIF or video…"),
    h("span", { class: "val", style: { textAlign: "start" } }, "Videos (MP4/WebM) play muted on a loop.")));
}

function linksEditor() {
  const wrap = h("div", { class: "card" });
  const save = list => set("ignifox.newtab.links", JSON.stringify(list));
  const fixURL = u => {
    u = u.trim();
    if (!u) return "";
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  };
  function render() {
    const list = M.newtabLinks(igniValues());
    const rows = list.map((l, i) => {
      const t = h("input", { type: "text", value: l.title, placeholder: "Name", "aria-label": "Shortcut name", style: { minWidth: "130px", width: "140px" } });
      const u = h("input", { type: "url", value: l.url, placeholder: "https://…", "aria-label": "Shortcut address", style: { minWidth: "260px" } });
      const commit = () => {
        const next = M.newtabLinks(igniValues());
        const url = fixURL(u.value);
        if (!url) return;
        next[i] = { title: t.value.trim() || new URL(url).hostname.replace(/^www\./, ""), url };
        save(next);
      };
      t.addEventListener("change", commit);
      u.addEventListener("change", commit);
      const move = d => () => {
        const next = M.newtabLinks(igniValues());
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        save(next);
      };
      return h("div", { class: "row" },
        h("div", { class: "ctl" }, t, u),
        h("div", { class: "ctl" },
          h("button", { class: "btn", title: "Move up", onclick: move(-1) }, "▲"),
          h("button", { class: "btn", title: "Move down", onclick: move(1) }, "▼"),
          h("button", { class: "btn danger", title: "Remove", onclick: () => { const n = M.newtabLinks(igniValues()); n.splice(i, 1); save(n); } }, "✕")));
    });
    const nt = h("input", { type: "text", placeholder: "Name (optional)", "aria-label": "New shortcut name", style: { minWidth: "130px", width: "140px" } });
    const nu = h("input", { type: "url", placeholder: "example.com", "aria-label": "New shortcut address", style: { minWidth: "260px" } });
    const add = () => {
      const url = fixURL(nu.value);
      if (!url) { nu.focus(); return; }
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { toast("That address doesn't look right"); return; }
      save([...M.newtabLinks(igniValues()), { title: nt.value.trim() || host, url }]);
    };
    nu.addEventListener("keydown", e => { if (e.key == "Enter") add(); });
    wrap.replaceChildren(...rows,
      h("div", { class: "row" }, h("div", { class: "ctl" }, nt, nu),
        h("div", { class: "ctl" },
          h("button", { class: "btn primary", onclick: add }, "Add shortcut"),
          h("button", { class: "btn", onclick: () => P.clearUserPref("ignifox.newtab.links") }, "Defaults"))));
  }
  let last = null;
  bind(() => {
    const cur = get("ignifox.newtab.links");
    if (cur !== last) { last = cur; render(); }
  }, wrap);
  return wrap;
}

function renderNewtab() {
  return [
    h("h1", {}, "New Tab"),
    h("p", { class: "lede" }, "Your own start page: wallpaper, clock, search with your engine, and shortcuts. It's a plain local page: no ads, no tracking, no network requests unless you turn on site icons."),
    card(
      toggle("ignifox.newtab.enabled", "Use the Ignifox New Tab", "Off = Firefox's standard new tab page."),
      toggle("ignifox.newtab.home", "Also use it as my home page", "Only applies if you haven't set a home page yourself."),
      row(null, "See it", null, h("button", { class: "btn", onclick: () => browserWin()?.openTrustedLinkIn(IgniBoot.newtabURL(), "tab") }, "Open a new tab"))),
    newtabPreview(),
    h("h2", {}, "Wallpaper"),
    wallpaperPicker(),
    card(
      range("ignifox.newtab.dim", "Darken wallpaper", "Keeps text readable on bright pictures.", 0, 90, 5, v => `${v}%`),
      range("ignifox.newtab.blur", "Blur wallpaper", null, 0, 30, 1, v => `${v}px`),
      select("ignifox.newtab.motion", "Wallpaper animation", "Animated wallpapers keep moving unless you pick otherwise.",
        [["on", "Always animate"], ["system", "Pause when my desktop asks for less motion"], ["off", "Still picture (saves battery)"]])),
    h("h2", {}, "Layout"),
    card(
      select("ignifox.newtab.layout", "Arrangement", null, [["center", "Centered"], ["top", "Near the top"], ["minimal", "Minimal (search + shortcuts only)"]]),
      toggle("ignifox.newtab.clock", "Clock"),
      toggle("ignifox.newtab.clock24", "24-hour time"),
      toggle("ignifox.newtab.seconds", "Show seconds"),
      toggle("ignifox.newtab.date", "Date"),
      toggle("ignifox.newtab.greeting", "Greeting", "\"Good evening\", in black-metal lettering."),
      text("ignifox.newtab.name", "Your name for the greeting", null, { placeholder: "e.g. rxvy" }),
      toggle("ignifox.newtab.search", "Search box"),
      toggle("ignifox.newtab.engineSwitcher", "Engine switcher in the search box", "Pick an engine per search, or type a keyword like @yt first."),
      toggle("ignifox.newtab.notes", "Notes", "A small notepad in the side column. Saved only on this computer.")),
    h("h2", {}, "Widgets"),
    h("p", { class: "lede" }, "A column on the right of the new tab. To-do items and notes stay on this computer."),
    card(
      toggle("ignifox.newtab.todo", "To-do list", "Tick things off, or remove them with ×."),
      text("ignifox.newtab.countdown.title", "Countdown name", "Leave the date empty to hide the countdown.", { placeholder: "e.g. Summer break" }),
      dateRow("ignifox.newtab.countdown.date", "Countdown to"),
      textArea("ignifox.newtab.feeds", "News feeds", "RSS or Atom addresses, one per line. Ignifox fetches them every 30 minutes, without cookies.",
        "https://archlinux.org/feeds/news/\nhttps://www.phoronix.com/rss.php"),
      range("ignifox.newtab.feeds.count", "Headlines to show", null, 3, 20, 1, v => `${v}`)),
    h("h2", {}, "Shortcuts"),
    linksEditor(),
    card(
      select("ignifox.newtab.tileStyle", "Tile style", null, [["rounded", "Rounded"], ["circle", "Circles"], ["square", "Square"], ["minimal", "Minimal (no background)"]]),
      range("ignifox.newtab.columns", "Shortcuts per row", null, 3, 10, 1, v => `${v}`),
      toggle("ignifox.newtab.topSites", "Add my most-visited sites", "Fills in after your shortcuts, from your own history."),
      toggle("ignifox.newtab.favicons", "Site icons", "Loads each site's own icon. That contacts the site; off = letter tiles with no network use.")),
  ];
}

// ================================================================ SEARCH
const SEARCH_REASON = () => Services.search.CHANGE_REASON?.USER ?? "user";

async function searchState() {
  await Services.search.init();
  const [engines, def, priv] = await Promise.all([
    Services.search.getVisibleEngines(), Services.search.getDefault(), Services.search.getDefaultPrivate(),
  ]);
  return { engines, def, priv };
}

function engineIcon(e) {
  const img = h("img", { class: "eng-ico", alt: "", width: 20, height: 20 });
  e.getIconURL?.(32).then(u => { if (u) img.src = u; }, () => {});
  return img;
}

function renderSearch() {
  const wrap = h("div", {});
  async function render() {
    let st;
    try {
      st = await searchState();
    } catch (e) {
      wrap.replaceChildren(card(row(null, "Search engines unavailable", String(e))));
      return;
    }
    const { engines, def, priv } = st;
    const installed = new Set(engines.map(e => e.name.toLowerCase()));
    const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
    const installedHosts = new Set(engines.map(e => {
      try { return hostOf(e.getSubmission("x").uri.spec); } catch (err) { return ""; }
    }).filter(Boolean));

    const grid = h("div", { class: "engines" }, engines.map(e =>
      h("button", {
        class: "engine-card" + (def && e.name == def.name ? " selected" : ""),
        title: `Make ${e.name} the default`,
        onclick: async () => { await Services.search.setDefault(e, SEARCH_REASON()); toast(`${e.name} is now your search engine`); },
      }, engineIcon(e), h("b", {}, e.name), h("small", {}, e.alias || ""))));

    const privSel = h("select", { "aria-label": "Private window search engine" },
      engines.map(e => h("option", { value: e.name }, e.name)));
    privSel.value = priv?.name || def?.name || "";
    bind(() => { privSel.disabled = !get("browser.search.separatePrivateDefault"); }, privSel);
    privSel.addEventListener("change", async () => {
      const e = engines.find(x => x.name == privSel.value);
      if (e) { await Services.search.setDefaultPrivate(e, SEARCH_REASON()); toast(`Private windows use ${e.name}`); }
    });

    const rows = engines.map(e => {
      const alias = h("input", { type: "text", value: e.alias || "", placeholder: "@keyword", "aria-label": `Keyword for ${e.name}`, style: { minWidth: "120px", width: "130px" } });
      alias.addEventListener("change", () => {
        const a = M.normalizeAlias(alias.value);
        const clash = engines.find(x => x !== e && (x.alias || "").toLowerCase() == a.toLowerCase());
        if (a && clash) { toast(`${a} is already used by ${clash.name}`); alias.value = e.alias || ""; return; }
        e.alias = a;
        alias.value = a;
        toast(a ? `Type “${a} something” in the address bar to search ${e.name}` : "Keyword removed");
      });
      const isDef = def && e.name == def.name;
      return h("div", { class: "row" },
        h("div", { class: "label" }, engineIcon(e), e.name, isDef ? h("span", { class: "badge" }, "Default") : null),
        h("div", { class: "ctl" }, alias,
          h("button", { class: "btn", disabled: isDef, onclick: () => Services.search.setDefault(e, SEARCH_REASON()) }, "Make default"),
          h("button", { class: "btn danger", disabled: isDef, title: isDef ? "Pick another default first" : "Remove",
            onclick: async () => { await Services.search.removeEngine(e, SEARCH_REASON()); toast(`${e.name} removed`); } }, "Remove")));
    });

    const groups = {};
    for (const p of M.POPULAR_ENGINES) {
      if (installed.has(p.name.toLowerCase()) || installedHosts.has(hostOf(p.url))) continue;
      (groups[p.group] ||= []).push(p);
    }
    const addPopular = async (p, makeDefault) => {
      try {
        const clash = engines.find(x => (x.alias || "").toLowerCase() == p.alias.toLowerCase());
        const e = await Services.search.addUserEngine({ name: p.name, url: p.url, alias: clash ? "" : p.alias, suggestUrl: p.suggestUrl });
        if (makeDefault) await Services.search.setDefault(e, SEARCH_REASON());
        toast(makeDefault ? `${p.name} added and set as default` : `${p.name} added. Keyword ${clash ? "(pick one below)" : p.alias}`);
      } catch (e) {
        toast(`Couldn't add ${p.name}: ${e.message}`);
      }
    };
    const popular = Object.entries(groups).map(([g, list]) => h("div", { class: "pop-group" },
      h("div", { class: "pop-title" }, g),
      h("div", { class: "snips" }, list.map(p => h("span", { class: "pop" },
        h("button", { class: "btn", title: `Add ${p.name} (${p.alias})`, onclick: () => addPopular(p, false) }, "+ " + p.name),
        h("button", { class: "btn star", title: `Add ${p.name} and make it the default`, onclick: () => addPopular(p, true) }, "★"))))));

    const cn = h("input", { type: "text", placeholder: "Name, e.g. My SearXNG", "aria-label": "Engine name" });
    const cu = h("input", { type: "url", placeholder: "https://example.org/search?q=%s", "aria-label": "Search URL", style: { minWidth: "300px" } });
    const ck = h("input", { type: "text", placeholder: "@keyword", "aria-label": "Keyword", style: { minWidth: "110px", width: "120px" } });
    const addCustom = async () => {
      const url = M.normalizeEngineURL(cu.value);
      const name = cn.value.trim();
      if (!name) { toast("Give the engine a name"); cn.focus(); return; }
      if (!url) { toast("The address needs %s where the search words go"); cu.focus(); return; }
      if (installed.has(name.toLowerCase())) { toast(`There's already an engine called ${name}`); return; }
      try {
        await Services.search.addUserEngine({ name, url, alias: M.normalizeAlias(ck.value) });
        toast(`${name} added`);
      } catch (e) {
        toast("Couldn't add it: " + e.message);
      }
    };

    wrap.replaceChildren(
      h("h2", {}, "Your search engine"),
      h("p", { class: "lede" }, "Click one to use it everywhere: address bar, new tab, and right-click › Search."),
      grid,
      h("h2", {}, "Private windows"),
      card(
        toggle("browser.search.separatePrivateDefault", "Use a different engine in private windows"),
        row(null, "Private window engine", null, privSel)),
      h("h2", {}, "Add an engine in one click"),
      h("p", { class: "lede" }, "+ adds it with a keyword, ★ adds it and makes it your default."),
      ...popular,
      h("h2", {}, "Add any site"),
      h("div", { class: "card" },
        h("div", { class: "row" }, h("div", { class: "ctl", style: { flexWrap: "wrap" } }, cn, cu, ck),
          h("div", { class: "ctl" }, h("button", { class: "btn primary", onclick: addCustom }, "Add"))),
        h("div", { class: "row" }, h("div", { class: "desc" },
          "Tip: search a site once, copy the results address, and swap your search words for %s."))),
      h("h2", {}, "Installed engines & keywords"),
      h("p", { class: "lede" }, "Type a keyword before your search in the address bar, like “@yt lofi”, to use that engine just once."),
      h("div", { class: "card" }, rows),
      h("h2", {}, "Suggestions"),
      card(
        toggle("browser.search.suggest.enabled", "Search suggestions while typing", "Sends what you type to your search engine."),
        toggle("browser.search.suggest.enabled.private", "Suggestions in private windows"),
        toggle("browser.search.openintab", "Open search results in a new tab")));
    // the private-engine toggle also needs Firefox's UI switch
    if (!get("browser.search.separatePrivateDefault.ui.enabled")) set("browser.search.separatePrivateDefault.ui.enabled", true);
  }
  render();
  const obs = { observe: () => { if (wrap.isConnected) render(); } };
  Services.obs.addObserver(obs, "browser-search-engine-modified");
  window.addEventListener("unload", () => Services.obs.removeObserver(obs, "browser-search-engine-modified"));
  return [
    h("h1", {}, "Search"),
    h("p", { class: "lede" }, "Switch engines in one click, add the ones you actually use, and give each a keyword."),
    wrap,
  ];
}

// =========================================================== PLACEMENT
const LAYOUTS = [
  ["top", "Tabs on top", "Classic", [["t", 6, 6, 88, 14], ["", 6, 24, 88, 12]]],
  ["bottom", "Tabs below bar", "Address bar first", [["", 6, 6, 88, 12], ["t", 6, 22, 88, 14]]],
  ["vertical", "Vertical tabs", "Native sidebar tabs", [["t", 4, 4, 22, 62], ["", 30, 4, 66, 12]]],
  ["hidden", "No tab strip", "For tree-tab add-ons", [["", 6, 6, 88, 12]]],
];
function layoutPicker() {
  return h("div", { class: "layouts" }, LAYOUTS.map(([id, name, sub, boxes]) => {
    const b = h("button", { class: "layout", onclick: () => set("ignifox.layout.tabs", id) },
      h("div", { class: "pic" }, boxes.map(([c, x, y, w, hh]) =>
        h("i", { class: c, style: { left: `${x}%`, top: `${y}px`, width: `${w}%`, height: `${hh}px` } }))),
      h("b", {}, name), h("small", {}, sub));
    bind(() => b.classList.toggle("selected", get("ignifox.layout.tabs") == id), b);
    return b;
  }));
}

let placementListener = null;
function browserWin() {
  return Services.wm.getMostRecentWindow("navigator:browser");
}
function widgetLabel(id) {
  if (M.WIDGETS[id]) return M.WIDGETS[id];
  if (/spring/.test(id)) return "Flexible space";
  if (/spacer/.test(id)) return "Space";
  if (/separator/.test(id)) return "Separator";
  if (id == "tabbrowser-tabs") return "Tabs";
  try {
    const w = CUI.getWidget(id);
    const node = w?.forWindow?.(browserWin())?.node;
    return node?.getAttribute("label") || w?.label || id;
  } catch (e) {
    return id;
  }
}

/** Ids of widgets that really exist: placed in a toolbar area, or sitting in the palette. */
function availableWidgetIds() {
  const ids = new Set();
  if (!CUI) return ids;
  for (const area of Object.keys(M.AREAS).filter(Boolean)) {
    for (const id of CUI.getWidgetIdsInArea(area)) ids.add(id);
  }
  try {
    const win = browserWin();
    if (win) for (const w of CUI.getUnusedWidgets(win.gNavToolbox.palette)) ids.add(w.id);
  } catch (e) {}
  return ids;
}

function placementTable() {
  const wrap = h("div", { class: "card" });
  function render() {
    if (!CUI) {
      wrap.replaceChildren(row(null, "Toolbar layout unavailable", "CustomizableUI could not be loaded in this build."));
      return;
    }
    const avail = availableWidgetIds();
    // known widgets first (in our friendly order), then anything else that's placed (extensions etc.)
    const ids = [...Object.keys(M.WIDGETS).filter(id => avail.has(id)), ...[...avail].filter(id => !M.WIDGETS[id])];

    const rows = ids.filter(id => !/spring|spacer|separator/.test(id)).map(id => {
      const place = CUI.getPlacementOfWidget(id);
      const removable = CUI.isWidgetRemovable(id);
      const sel = h("select", { "aria-label": `Where to put ${widgetLabel(id)}` },
        Object.entries(M.AREAS).map(([a, l]) => h("option", { value: a }, l)));
      sel.value = place?.area && M.AREAS[place.area] !== undefined ? place.area : "";
      sel.disabled = !removable;
      sel.addEventListener("change", () => {
        try {
          if (sel.value) CUI.addWidgetToArea(id, sel.value);
          else CUI.removeWidgetFromArea(id);
        } catch (e) {
          toast("Couldn't move that button");
        }
      });
      const move = d => () => {
        const p = CUI.getPlacementOfWidget(id);
        if (p) CUI.moveWidgetWithinArea(id, Math.max(0, p.position + d));
      };
      return row(null, widgetLabel(id), place ? `${M.AREAS[place.area] ?? place.area} · position ${place.position + 1}` : "Not shown", [
        h("button", { class: "btn", title: "Move left", disabled: !place, onclick: move(-1) }, "◀"),
        h("button", { class: "btn", title: "Move right", disabled: !place, onclick: move(1) }, "▶"),
        sel,
      ]);
    });
    wrap.replaceChildren(...rows);
  }
  render();
  if (CUI && !placementListener) {
    let q = false;
    const rerender = () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; render(); }); } };
    placementListener = { onWidgetAdded: rerender, onWidgetRemoved: rerender, onWidgetMoved: rerender, onAreaReset: rerender };
    CUI.addListener(placementListener);
  }
  return wrap;
}

function applyToolbarPreset(preset) {
  if (!CUI) return;
  const avail = availableWidgetIds();
  const want = preset.navbar.filter(id => avail.has(id));
  // Move everything not wanted out of the nav bar (to the overflow menu, so nothing is lost).
  for (const id of CUI.getWidgetIdsInArea("nav-bar")) {
    if (!want.includes(id) && CUI.isWidgetRemovable(id)) {
      CUI.addWidgetToArea(id, "widget-overflow-fixed-list");
    }
  }
  want.forEach((id, i) => CUI.addWidgetToArea(id, "nav-bar", i));
  toast(`${preset.name} toolbar applied`);
}

function renderPlacement() {
  return [
    h("h1", {}, "Placement"),
    h("p", { class: "lede" }, "Put the tab strip, sidebar, bars and every button exactly where you want them."),
    h("h2", {}, "Tab strip"),
    layoutPicker(),
    h("p", { class: "desc", style: { color: "var(--dim)", fontSize: "12px" } },
      "With tabs below the bar or hidden, window buttons move with the tab strip. Turn on the system title bar in Customize if you prefer them at the top."),
    card(
      toggle("ignifox.tabs.multirow", "Multi-row tabs", "Tabs wrap onto more rows instead of scrolling sideways. Experimental."),
      range("ignifox.tabs.maxRows", "Rows before scrolling", null, 2, 8, 1, v => `${v}`)),
    h("h2", {}, "Bars & sidebar"),
    card(
      toggle("sidebar.position_start", "Sidebar on the left", "Turn off to dock the sidebar (and vertical tabs) on the right."),
      select("sidebar.visibility", "Vertical tab sidebar", null,
        [["always-show", "Always expanded"], ["expand-on-hover", "Collapsed, expand on hover"], ["hide-sidebar", "Hidden until toggled"]]),
      select("browser.toolbars.bookmarks.visibility", "Bookmarks bar", null,
        [["always", "Always show"], ["newtab", "Only on new tab"], ["never", "Never"]]),
      toggle("ignifox.layout.autohide", "Focus mode", "Toolbars slide away and come back when you point at the top edge. Ctrl+Alt+Z toggles it."),
      toggle("ignifox.layout.urlbarCentered", "Center the address", "URL text sits in the middle until you click in."),
      toggle("ignifox.layout.compactNavbar", "Slim navigation bar", "Less padding around buttons and the URL bar."),
      range("ignifox.layout.urlbarMaxWidth", "Address bar width", "Cap the URL bar and center it, for wide screens.", 0, 1800, 50, v => (v < 300 ? "full" : `${v}px`)),
      toggle("ignifox.layout.bookmarksIconsOnly", "Bookmarks bar: icons only", "Hide bookmark names, keep folders labelled."),
      toggle("ignifox.layout.tabCloseHover", "Close buttons on hover only", "Cleaner tabs: × appears on the active or hovered tab.")),

    h("h2", {}, "Toolbar arrangement"),
    h("div", { class: "levels" }, Object.values(M.TOOLBAR_PRESETS).map(p =>
      h("button", { class: "level", onclick: () => applyToolbarPreset(p) },
        h("span", { class: "lvl-name" }, p.name), h("p", {}, p.blurb)))),

    h("h2", {}, "Buttons"),
    h("p", { class: "lede" }, "Send any button to the navigation bar, the tab strip, the bookmarks bar or the overflow menu, or hide it. Arrows reorder it."),
    placementTable(),
    h("div", { class: "btns", style: { marginTop: "12px" } },
      h("button", { class: "btn", onclick: () => browserWin()?.gCustomizeMode?.enter() }, "Open drag-and-drop customizer"),
      h("button", { class: "btn danger", onclick: () => { CUI?.reset(); toast("Toolbars reset"); } }, "Reset all toolbars")),

    h("h2", {}, "Right-click menu"),
    h("p", { class: "lede" }, "Tick what you never use and it disappears from right-click menus."),
    menuCleanup(),
    h("h2", {}, "Hide things"),
    card(
      toggle("ignifox.hide.newTabButton", "New-tab (+) button", "Ctrl+T still works."),
      toggle("ignifox.hide.allTabsButton", "List-all-tabs button"),
      toggle("ignifox.hide.extensionsButton", "Extensions puzzle button", "Pinned extension icons stay visible."),
      toggle("ignifox.hide.disabledNavButtons", "Back/forward when there's nowhere to go"),
      toggle("ignifox.hide.urlbarIcons", "Extra URL bar icons", "Tracking shield and page actions, until you click into the bar."),
      toggle("ignifox.hide.tabIcons", "Tab favicons", "Text-only tabs (pinned tabs keep their icons).")),
  ];
}

// ============================================================ BROWSING
function renderBrowsing() {
  return [
    h("h1", {}, "Tabs & Browsing"),
    h("p", { class: "lede" }, "Hidden Firefox powers, out in the open."),
    h("h2", {}, "Tabs"),
    card(
      select("browser.startup.page", "On startup", null, [[1, "Open home page"], [3, "Restore previous session"], [0, "Blank page"]]),
      toggle("browser.tabs.closeTabByDblclick", "Double-click a tab to close it"),
      toggle("toolkit.tabbox.switchByScrolling", "Scroll over tabs to switch"),
      toggle("browser.tabs.insertAfterCurrent", "Open new tabs next to the current one"),
      toggle("browser.tabs.loadInBackground", "Open links in the background"),
      toggle("browser.tabs.closeWindowWithLastTab", "Closing the last tab closes the window"),
      toggle("browser.tabs.hoverPreview.enabled", "Tab hover previews"),
      toggle("browser.tabs.groups.enabled", "Tab groups"),
      toggle("browser.tabs.splitView.enabled", "Split view", "Two tabs side by side."),
      toggle("browser.tabs.unloadOnLowMemory", "Unload idle tabs when memory is low"),
      select("ignifox.tabs.unloadAfter", "Unload tabs I haven't looked at for", "Frees memory; an unloaded tab reloads when you click it. Pinned tabs and tabs playing sound are never unloaded.",
        [[0, "Never"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"]]),
      toggle("ignifox.palette.enabled", "Command palette (Ctrl+K)", "Search tabs, bookmarks, actions, themes and settings from one box. Off = Ctrl+K focuses the search bar as in Firefox."),
      toggle("browser.tabs.warnOnClose", "Warn before closing many tabs"),
      toggle("browser.ctrlTab.sortByRecentlyUsed", "Ctrl+Tab cycles in recently-used order"),
      toggle("privacy.userContext.enabled", "Container tabs", "Keep work, shopping and social logins in separate color-coded tabs."),
      toggle("browser.tabs.loadBookmarksInTabs", "Open bookmarks in a new tab")),
    h("h2", {}, "Keyboard"),
    card(row(null, "Keyboard shortcuts", "Change or turn off any shortcut, Firefox's or Ignifox's.",
      h("button", { class: "btn", onclick: () => browserWin()?.openTrustedLinkIn("about:keyboard", "tab") }, "Edit shortcuts"))),
    h("h2", {}, "Scrolling & mouse"),
    card(
      toggle("general.smoothScroll", "Smooth scrolling"),
      toggle("general.smoothScroll.msdPhysics.enabled", "Spring-physics scrolling", "Snappier, more natural feel."),
      range("mousewheel.default.delta_multiplier_y", "Scroll speed", null, 40, 300, 10, v => `${v}%`),
      toggle("general.autoScroll", "Middle-click autoscroll"),
      toggle("middlemouse.paste", "Middle-click pastes (Linux style)")),
    h("h2", {}, "Address bar"),
    card(
      toggle("browser.urlbar.trimURLs", "Shorten URLs", "Off = always show https:// and the full address.", {}),
      toggle("browser.search.suggest.enabled", "Search suggestions"),
      toggle("browser.urlbar.suggest.history", "Suggest history"),
      toggle("browser.urlbar.suggest.bookmark", "Suggest bookmarks"),
      toggle("browser.urlbar.suggest.openpage", "Suggest open tabs"),
      toggle("browser.urlbar.suggest.topsites", "Show shortcuts when the bar is empty"),
      toggle("browser.urlbar.openintab", "Address bar results open in a new tab")),
    h("h2", {}, "Media & performance (Linux)"),
    card(
      select("media.autoplay.default", "Autoplay", null, [[0, "Allow audio and video"], [1, "Block audio"], [5, "Block audio and video"]]),
      toggle("media.videocontrols.picture-in-picture.video-toggle.enabled", "Picture-in-picture button on videos"),
      toggle("media.hardware-video-decoding.force-enabled", "Force hardware video decoding", "VA-API on Intel/AMD, and NVIDIA via nvidia-vaapi-driver. Lower CPU use on YouTube & Twitch."),
      toggle("media.ffmpeg.vaapi.enabled", "Use VA-API through FFmpeg"),
      select("dom.ipc.processCount", "Content processes", "More = better isolation and speed with many tabs, more RAM.",
        [[4, "4 (low RAM)"], [8, "8 (default)"], [12, "12"], [16, "16 (lots of RAM)"]]),
      toggle("browser.download.useDownloadDir", "Save downloads without asking", "Off = choose a folder every time."),
      toggle("findbar.highlightAll", "Find bar highlights every match"),
      toggle("browser.download.alwaysOpenPanel", "Show the downloads panel when a download starts"),
      select("layout.spellcheckDefault", "Spell check", null, [[0, "Off"], [1, "Multi-line boxes"], [2, "All text boxes"]])),
  ];
}

// ============================================================= PRIVACY
function currentLevel() {
  for (const [id, lvl] of Object.entries(M.PRIVACY_LEVELS)) {
    if (Object.entries(lvl.prefs).every(([k, v]) => get(k) === v)) return id;
  }
  return null;
}
function applyLevel(id) {
  const lvl = M.PRIVACY_LEVELS[id];
  for (const [k, v] of Object.entries(lvl.prefs)) set(k, v);
  toast(`${lvl.name} privacy applied`);
}
function levelCards() {
  const flames = { balanced: "🔥", hardened: "🔥🔥", fortress: "🔥🔥🔥" };
  return h("div", { class: "levels" }, Object.entries(M.PRIVACY_LEVELS).map(([id, lvl]) => {
    const b = h("button", { class: "level", onclick: () => applyLevel(id) },
      h("span", { class: "flames" }, flames[id]),
      h("span", { class: "lvl-name" }, lvl.name),
      h("p", {}, lvl.blurb));
    bind(() => b.classList.toggle("selected", currentLevel() == id), b);
    return b;
  }));
}

function dohRow() {
  const sel = h("select", { "aria-label": "DNS provider" },
    Object.entries(M.DOH_PROVIDERS).map(([id, p]) => h("option", { value: p.uri }, p.name)),
    h("option", { value: "custom" }, "Custom…"));
  const custom = h("input", { type: "url", placeholder: "https://…/dns-query", hidden: true, "aria-label": "Custom DoH URL" });
  sel.addEventListener("change", () => {
    if (sel.value == "custom") { custom.hidden = false; custom.focus(); return; }
    custom.hidden = true;
    set("network.trr.uri", sel.value);
  });
  custom.addEventListener("change", () => { set("network.trr.uri", custom.value.trim()); set("network.trr.custom_uri", custom.value.trim()); });
  bind(() => {
    const uri = get("network.trr.uri");
    const known = Object.values(M.DOH_PROVIDERS).some(p => p.uri == uri);
    sel.value = known ? uri : "custom";
    custom.hidden = known;
    if (!known && document.activeElement != custom) custom.value = uri || "";
  }, sel);
  return row("network.trr.uri", "DNS provider", "Used when encrypted DNS is on.", [sel, custom]);
}

function telemetryProof() {
  const grid = h("div", { class: "proof" });
  bind(() => {
    const cells = M.TELEMETRY_LOCKS.map(([k, want]) => {
      const ok = get(k) === want && P.prefIsLocked(k);
      return h("div", {}, h("span", {}, k), h("span", { class: ok ? "ok" : "bad" }, ok ? "locked off ✓" : "NOT LOCKED"));
    });
    // Binaries the repack strips out entirely.
    for (const bin of ["crashreporter", "crashhelper", "pingsender", "updater"]) {
      let gone = true;
      try {
        const f = Services.dirsvc.get("GreD", Ci.nsIFile);
        f.append(bin);
        gone = !f.exists();
      } catch (e) {}
      cells.push(h("div", {}, h("span", {}, `${bin} binary`), h("span", { class: gone ? "ok" : "bad" }, gone ? "removed ✓" : "present")));
    }
    grid.replaceChildren(...cells);
  }, grid);
  return h("div", { class: "card" }, grid);
}

function autoDeleteStats() {
  const out = h("span", { class: "val" });
  bind(() => {
    const n = get("ignifox.privacy.autoDelete.cleaned") || 0;
    out.textContent = n ? `${n} site${n == 1 ? "" : "s"} cleaned so far` : "Nothing cleaned yet";
  }, out);
  return row(null, "Cleaned", null, out);
}

// ============================================================ WORKSPACES & PANELS
function renderWorkspaces() {
  return [
    h("h1", {}, "Workspaces & Panels"),
    h("p", { class: "lede" }, "Workspaces are separate sets of tabs, each with its own theme: one for work, one for gaming, one for school. Pinned tabs show in every workspace. Switch with the button in the tab strip, Ctrl+Alt+1…9, or Ctrl+K."),
    card(toggle("ignifox.workspaces.enabled", "Workspaces", "Off shows all your tabs together again.")),
    workspacesEditor(),
    h("h2", {}, "Web panels"),
    h("p", { class: "lede" }, "Keep sites like Discord, Spotify or a chat app open in a strip beside every page. Each panel stays loaded while you browse. Middle-click a panel icon to unload it."),
    card(
      toggle("ignifox.panels.enabled", "Web panels"),
      select("ignifox.panels.side", "Side", null, [["right", "Right"], ["left", "Left"]]),
      range("ignifox.panels.width", "Panel width", "You can also drag the panel's edge.", 260, 900, 10, v => `${v}px`)),
    panelsEditor(),
  ];
}

function workspacesEditor() {
  const wrap = h("div", { class: "card" });
  const save = list => set("ignifox.workspaces.list", JSON.stringify(list));
  const themes = [["", "Same as the browser"], ...Object.entries(M.THEMES).map(([k, t]) => [k, t.name]),
    ...Object.keys(M.savedThemes(igniValues())).map(n => ["user:" + n, n + " (mine)"])];
  function render() {
    const list = D.parseWorkspaces(get("ignifox.workspaces.list"));
    const rows = list.map((ws, i) => {
      const icon = h("select", { "aria-label": "Icon", class: "ws-icon" },
        [...new Set([ws.icon, ...D.WORKSPACE_ICONS])].map(ic => h("option", { value: ic, selected: ic == ws.icon }, ic)));
      const name = h("input", { type: "text", value: ws.name, "aria-label": "Workspace name", style: { width: "180px" } });
      const theme = h("select", { "aria-label": "Workspace theme" }, themes.map(([k, n]) => h("option", { value: k, selected: k == ws.theme }, n)));
      const commit = () => {
        const next = D.parseWorkspaces(get("ignifox.workspaces.list"));
        next[i] = { ...next[i], icon: icon.value, name: name.value.trim() || next[i].name, theme: theme.value };
        save(next);
      };
      [icon, name, theme].forEach(c => c.addEventListener("change", commit));
      const remove = h("button", { class: "btn danger", title: "Remove (its tabs move to the first workspace)", disabled: list.length == 1, onclick: () => {
        const next = D.parseWorkspaces(get("ignifox.workspaces.list"));
        next.splice(i, 1);
        save(next);
      } }, "✕");
      return h("div", { class: "row" },
        h("div", { class: "ctl" }, h("span", { class: "val", style: { minWidth: "70px" } }, `Ctrl+Alt+${i + 1}`), icon, name, theme),
        h("div", { class: "ctl" }, remove));
    });
    const add = h("button", { class: "btn primary", disabled: list.length >= 9, onclick: () => {
      const next = D.parseWorkspaces(get("ignifox.workspaces.list"));
      const icon = D.WORKSPACE_ICONS.find(ic => !next.some(w => w.icon == ic)) || "•";
      next.push({ id: "w" + Date.now().toString(36), name: `Workspace ${next.length + 1}`, icon, theme: "" });
      save(next);
      set("ignifox.workspaces.enabled", true);
    } }, "Add workspace");
    wrap.replaceChildren(...rows, h("div", { class: "row" }, h("div", { class: "ctl" }, add)));
  }
  let last = null;
  bind(() => {
    const cur = get("ignifox.workspaces.list");
    if (cur !== last) { last = cur; render(); }
  }, wrap);
  return wrap;
}

function panelsEditor() {
  const wrap = h("div", { class: "card" });
  const save = list => set("ignifox.panels.list", JSON.stringify(list));
  function render() {
    const list = D.parsePanels(get("ignifox.panels.list"));
    const rows = list.map((p, i) => h("div", { class: "row" },
      h("div", { class: "ctl" }, h("b", {}, p.title), h("span", { class: "val", style: { textAlign: "start" } }, p.url)),
      h("div", { class: "ctl" }, h("button", { class: "btn danger", title: "Remove", onclick: () => {
        const next = D.parsePanels(get("ignifox.panels.list")); next.splice(i, 1); save(next);
      } }, "✕"))));
    const nt = h("input", { type: "text", placeholder: "Name", "aria-label": "Panel name", style: { width: "140px" } });
    const nu = h("input", { type: "url", placeholder: "https://…", "aria-label": "Panel address", style: { minWidth: "260px" } });
    const add = (url, title) => {
      url = String(url || "").trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      const next = D.parsePanels(get("ignifox.panels.list"));
      if (!next.some(p => p.url == url)) next.push({ url, title: title || "" });
      save(D.parsePanels(JSON.stringify(next)));
      set("ignifox.panels.enabled", true);
    };
    nu.addEventListener("keydown", e => { if (e.key == "Enter") add(nu.value, nt.value.trim()); });
    const have = new Set(list.map(p => p.url));
    const chips = D.PANEL_SUGGESTIONS.filter(p => !have.has(p.url))
      .map(p => h("button", { class: "btn", onclick: () => add(p.url, p.title) }, "+ " + p.title));
    wrap.replaceChildren(...rows,
      h("div", { class: "row" }, h("div", { class: "ctl" }, nt, nu),
        h("div", { class: "ctl" }, h("button", { class: "btn primary", onclick: () => add(nu.value, nt.value.trim()) }, "Add panel"))),
      chips.length ? h("div", { class: "row" }, h("div", { class: "ctl", style: { flexWrap: "wrap", gap: "6px" } }, h("span", { class: "val" }, "Quick add:"), ...chips)) : null);
  }
  let last = null;
  bind(() => {
    const cur = get("ignifox.panels.list");
    if (cur !== last) { last = cur; render(); }
  }, wrap);
  return wrap;
}

function renderPrivacy() {
  return [
    h("h1", {}, "Privacy"),
    h("p", { class: "lede" }, "Ignifox never phones home. Telemetry, studies, experiments and crash uploads are locked off at the engine level. Below is how hard you want to go beyond that."),
    levelCards(),
    h("h2", {}, "Fine-tune"),
    card(
      select("browser.contentblocking.category", "Tracking protection", null, [["standard", "Standard"], ["strict", "Strict"], ["custom", "Custom (Firefox settings)"]]),
      toggle("dom.security.https_only_mode", "HTTPS-only mode", "Upgrade every connection; ask before falling back to HTTP."),
      toggle("privacy.globalprivacycontrol.enabled", "Global Privacy Control", "Tell sites not to sell or share your data."),
      toggle("privacy.fingerprintingProtection", "Fingerprinting protection", "Randomizes the signals trackers use to recognize you."),
      toggle("privacy.resistFingerprinting", "Resist fingerprinting (Tor-style)", "Strongest, but sets your timezone to UTC and can break sites."),
      select("network.trr.mode", "Encrypted DNS (DoH)", null, [[0, "Off (system DNS)"], [2, "On, fall back to system"], [3, "On, never fall back"], [5, "Explicitly off"]]),
      dohRow(),
      toggle("ignifox.privacy.autoDelete", "Delete a site's cookies when I close it",
        "15 seconds after a site's last tab closes, its cookies and storage are deleted. Logs you out of sites you don't keep."),
      textArea("ignifox.privacy.keepSites", "Keep cookies for these sites", "One domain per line; covers its subdomains. Ctrl+K → “Keep cookies for …” adds the current site.",
        "github.com\nyoutube.com"),
      autoDeleteStats(),
      toggle("privacy.sanitize.sanitizeOnShutdown", "Clear data when Ignifox closes"),
      toggle("privacy.clearOnShutdown_v2.cookiesAndStorage", "…cookies & site data"),
      toggle("privacy.clearOnShutdown_v2.historyFormDataAndDownloads", "…history, forms & downloads"),
      toggle("privacy.clearOnShutdown_v2.cache", "…cache"),
      toggle("media.peerconnection.enabled", "WebRTC", "Needed for video calls in the browser."),
      toggle("media.peerconnection.ice.default_address_only", "Hide local IP from WebRTC"),
      toggle("webgl.disabled", "Disable WebGL", "Blocks a big fingerprinting surface; breaks 3D sites."),
      toggle("geo.enabled", "Location requests", "Uses BeaconDB, not Google."),
      toggle("network.captive-portal-service.enabled", "Captive portal detection", "Off = no background request to detect hotel/airport Wi-Fi logins."),
      toggle("network.connectivity-service.enabled", "Connectivity checks"),
      toggle("browser.safebrowsing.malware.enabled", "Block malware sites", "Uses local hash lists; your URLs are not sent."),
      toggle("browser.safebrowsing.phishing.enabled", "Block phishing sites"),
      select("network.http.referer.XOriginTrimmingPolicy", "Referrer sent to other sites", null, [[0, "Full URL"], [1, "Without query string"], [2, "Domain only"]]),
      toggle("signon.rememberSignons", "Offer to save passwords"),
      toggle("browser.formfill.enable", "Remember form & search history"),
      toggle("extensions.formautofill.addresses.enabled", "Autofill addresses"),
      toggle("extensions.formautofill.creditCards.enabled", "Autofill payment methods")),
    h("h2", {}, "No-telemetry proof (live)"),
    h("p", { class: "lede" }, "Read straight from the running browser. Locked means nothing (not a setting, an experiment, nor Sync) can turn it back on."),
    telemetryProof(),
  ];
}

// ================================================================== AI
function renderAI() {
  return [
    h("h1", {}, "AI Features"),
    h("p", { class: "lede" }, "Off by default. Translations run fully on your machine; nothing else is enabled unless you say so."),
    card(
      select("browser.ai.control.default", "AI features", "Master switch for Firefox's built-in AI (chatbot sidebar, smart tab groups, link previews…).",
        [["blocked", "Blocked"], ["available", "Available"]]),
      toggle("browser.ml.chat.enabled", "Chatbot sidebar", "Lets you pick a chatbot provider in the sidebar."),
      toggle("browser.translations.enable", "Local page translation", "Language models download once and run offline.")),
  ];
}

// ========================================================== CUSTOM CSS
const SNIPPETS = {
  "Hide tab bar with one tab": `/* hide the tab strip when only one tab is open */
:root:not([customizing]) #TabsToolbar:not(:has(.tabbrowser-tab:not([hidden]) ~ .tabbrowser-tab:not([hidden]))) {
  visibility: collapse !important;
}`,
  "Outline URL bar": `/* see-through URL bar with an accent outline */
.urlbar-background {
  background: transparent !important;
  border: 1px solid color-mix(in srgb, var(--igni-accent, currentColor) 45%, transparent) !important;
}`,
  "Taller tabs": `:root { --tab-min-height: 40px !important; }`,
  "Monospace URL bar": `.urlbar-input { font-family: "JetBrains Mono", monospace !important; }`,
  "Accent tab text": `.tabbrowser-tab[selected] .tab-label { color: var(--igni-accent) !important; font-weight: 600; }`,
};
const CSS_TEMPLATE = `/* Ignifox Studio custom CSS
 * Applied live to the browser UI when you press Save (Ctrl+S).
 * Ignifox variables you can use:
 *   --igni-bg --igni-bg-2 --igni-bg-3 --igni-fg --igni-fg-dim
 *   --igni-accent --igni-accent-2 --igni-radius
 * Browser Toolbox (Ctrl+Alt+Shift+I) lets you inspect the UI.
 */

`;

function renderCSS() {
  const path = IgniBoot.customCSSPath();
  const area = h("textarea", { class: "editor", spellcheck: "false", "aria-label": "Custom CSS" });
  const status = h("span", { class: "val", style: { textAlign: "start" } });
  IOUtils.readUTF8(path).then(t => (area.value = t), () => (area.value = CSS_TEMPLATE));

  async function save() {
    try {
      await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
      await IOUtils.writeUTF8(path, area.value);
      IgniBoot.bumpCustomCSS();
      status.textContent = "saved " + new Date().toLocaleTimeString();
      toast("Custom CSS applied");
    } catch (e) {
      toast("Save failed: " + e.message);
    }
  }
  area.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key == "s") { e.preventDefault(); save(); }
    if (e.key == "Tab" && !e.shiftKey) {
      e.preventDefault();
      area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end");
    }
  });

  return [
    h("h1", {}, "Custom CSS"),
    h("p", { class: "lede" }, "Restyle anything in the browser UI. Stored in your profile as chrome/igni-custom.css. Classic userChrome.css works too."),
    card(toggle("ignifox.customcss.enabled", "Apply my custom CSS")),
    h("div", { class: "snips" }, h("span", { class: "val", style: { textAlign: "start" } }, "Snippets:"),
      Object.entries(SNIPPETS).map(([name, css]) =>
        h("button", { class: "btn", onclick: () => { area.value += (area.value.endsWith("\n") ? "\n" : "\n\n") + css + "\n"; area.focus(); } }, "+ " + name))),
    area,
    h("div", { class: "btns", style: { marginTop: "12px", alignItems: "center" } },
      h("button", { class: "btn primary", onclick: save }, "Save & apply"),
      h("button", { class: "btn", onclick: () => {
        const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
        f.append("chrome");
        if (!f.exists()) f.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
        try { f.reveal(); } catch (e) { f.launch(); }
      } }, "Open chrome folder"),
      status),
  ];
}

// ============================================================== BACKUP
function collect() {
  const data = { ignifox: 1, saved: new Date().toISOString(), prefs: {} };
  for (const key of [...Object.keys(M.IGNI_PREFS), ...Object.keys(M.NATIVE_PREFS)]) {
    if (P.prefHasUserValue(key)) data.prefs[key] = get(key);
  }
  try { data.toolbars = P.getStringPref("browser.uiCustomization.state", ""); } catch (e) {}
  return data;
}
function renderBackup() {
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  file.addEventListener("change", async () => {
    try {
      const data = JSON.parse(await file.files[0].text());
      if (!data || data.ignifox != 1) throw new Error("not an Ignifox settings file");
      let n = 0;
      for (const [k, v] of Object.entries(data.prefs || {})) {
        if (M.typeOf(k)) { set(k, v); n++; }
      }
      if (data.toolbars && CUI) {
        P.setStringPref("browser.uiCustomization.state", data.toolbars);
        toast(`Imported ${n} settings. Restart to apply toolbar layout.`);
      } else {
        toast(`Imported ${n} settings`);
      }
    } catch (e) {
      toast("Import failed: " + e.message);
    }
    file.value = "";
  });
  return [
    h("h1", {}, "Backup & Reset"),
    h("p", { class: "lede" }, "Take your whole setup (theme, saved themes, layout, toolbars, privacy) to another machine in one file."),
    card(
      row(null, "Export settings", "Saves ignifox-settings.json.", h("button", { class: "btn primary", onclick: () => {
        const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: "ignifox-settings.json" });
        document.body.append(a);
        a.click();
        a.remove();
      } }, "Export")),
      row(null, "Import settings", null, [file, h("button", { class: "btn", onclick: () => file.click() }, "Import…")]),
      row(null, "Reset Ignifox Studio", "Theme, layout and effects back to Ignifox defaults. Saved themes are kept.",
        h("button", { class: "btn danger", onclick: () => {
          for (const k of Object.keys(M.IGNI_PREFS)) if (k != "ignifox.theme.saved" && k != "ignifox.firstrun.done") P.clearUserPref(k);
          toast("Ignifox Studio reset");
        } }, "Reset")),
      row(null, "Run the welcome setup again", null,
        h("button", { class: "btn", onclick: () => openWelcome() }, "Start"))),
  ];
}

// =============================================================== ABOUT
function renderAbout() {
  const ai = Services.appinfo;
  const verCell = h("div", {}, ai.version);
  IgniBoot.version?.().then(v => (verCell.textContent = v), () => {});
  const result = h("span", { class: "val", style: { textAlign: "start", minWidth: "0" } });
  async function checkNow(btn) {
    btn.disabled = true;
    result.textContent = "checking…";
    try {
      const r = await IgniBoot.checkForUpdate({ manual: true });
      result.textContent = {
        current: `up to date (${r.current})`,
        available: `${r.latest} available`,
        error: "couldn't reach GitHub",
      }[r.status] || r.status;
    } catch (e) {
      result.textContent = "check failed";
    }
    btn.disabled = false;
  }
  return [
    h("div", { class: "about-hero" },
      h("img", { class: "logo", src: "chrome://ignifox/content/logo.svg", alt: "" }),
      h("div", {},
        h("img", { src: "chrome://ignifox/content/wordmark.svg", alt: "Ignifox", height: 64 }),
        h("p", { class: "lede", style: { margin: "8px 0 0" } }, "Private by force. Yours by design."))),
    h("div", { class: "card kv" },
      h("div", {}, "Ignifox"), verCell,
      h("div", {}, "Gecko engine"), h("div", {}, `${ai.platformVersion} (build ${ai.appBuildID})`),
      h("div", {}, "Platform"), h("div", {}, `${ai.OS} ${Services.sysinfo.getProperty("arch")}`),
      h("div", {}, "Profile"), h("div", {}, PathUtils.profileDir),
      h("div", {}, "Source"), h("div", {}, h("a", { href: "https://github.com/rxvy-dev/ignifox" }, "github.com/rxvy-dev/ignifox"))),
    h("h2", {}, "Updates"),
    card(
      toggle("ignifox.update.check", "Tell me when a new Ignifox is out",
        "Once a day, asks GitHub's public releases page for the latest version. No cookies, no IDs, nothing about you is sent. If you installed from a distro package, update through it instead."),
      row(null, "Check now", null, [result, h("button", { class: "btn", onclick: e => checkNow(e.currentTarget) }, "Check for updates")])),
    h("h2", {}, "Shortcuts"),
    h("div", { class: "card kv" },
      h("div", {}, "Ctrl+Alt+I"), h("div", {}, "Open Ignifox Studio"),
      h("div", {}, "Ctrl+Alt+Z"), h("div", {}, "Toggle focus mode"),
      h("div", {}, "Ctrl+Alt+Shift+I"), h("div", {}, "Browser Toolbox (inspect the UI for custom CSS)")),
    h("p", { class: "lede", style: { marginTop: "20px", fontSize: "12px" } },
      "Ignifox is built from Mozilla Firefox source code under the MPL 2.0. Firefox is a trademark of the Mozilla Foundation; Ignifox is not affiliated with or endorsed by Mozilla. Metal Mania font © Open Window, SIL OFL 1.1."),
  ];
}

// ============================================================= WELCOME
function openWelcome() {
  const w = $("#welcome");
  let step = 0;
  const steps = [
    () => h("div", { class: "step" },
      h("img", { class: "logo", src: "chrome://ignifox/content/logo.svg", alt: "" }),
      h("h1", {}, "Welcome to Ignifox"),
      h("p", { class: "lede" }, "Firefox's engine with the telemetry ripped out and the customization turned all the way up. Three quick picks and you're done.")),
    () => {
      const box = h("div", { class: "step" }, h("h1", {}, "Coming from another browser?"),
        h("p", { class: "lede" }, "Bring bookmarks, history, passwords, logins, tabs and extensions over in a minute."));
      const list = h("div", { class: "btns", style: { justifyContent: "center" } }, h("span", { class: "val" }, "Looking…"));
      Importer.findProfiles().then(pfs => {
        const names = [...new Set(pfs.map(p => p.browser))];
        list.replaceChildren(...(names.length
          ? [h("p", { class: "lede", style: { width: "100%" } }, `Found: ${names.join(", ")}`),
             h("button", { class: "btn primary", onclick: () => { finish(); location.hash = "#import"; } }, "Import now")]
          : [h("span", { class: "val" }, "No Firefox-family browsers found. Chrome-family imports live in Studio → Import.")]),
        h("button", { class: "btn", onclick: () => { finish(); location.hash = "#import"; } }, "Chrome, Brave, Edge…"));
      }, () => list.replaceChildren());
      box.append(list);
      return box;
    },
    () => h("div", { class: "step" }, h("h1", {}, "Pick your look"), h("p", { class: "lede" }, "One click sets theme, tabs and shapes together. Everything stays tweakable."), looksPicker()),
    () => h("div", { class: "step" }, h("h1", {}, "Pick your fire"), h("p", { class: "lede" }, "You can tweak every color later."), themeGallery()),
    () => h("div", { class: "step" }, h("h1", {}, "Where do tabs go?"), layoutPicker()),
    () => h("div", { class: "step" }, h("h1", {}, "How private?"), h("p", { class: "lede" }, "Telemetry is off at every level. This is about how much you harden on top."), levelCards()),
  ];
  function render() {
    const last = step == steps.length - 1;
    w.replaceChildren(h("div", {},
      steps[step](),
      h("div", { class: "pager step" },
        h("button", { class: "btn", onclick: () => (step ? (step--, render()) : finish()) }, step ? "Back" : "Skip"),
        h("div", { class: "pips" }, steps.map((_, i) => h("i", { class: i == step ? "on" : "" }))),
        h("button", { class: "btn primary", onclick: () => (last ? finish() : (step++, render())) }, last ? "Let it burn 🔥" : "Next"))));
  }
  function finish() {
    set("ignifox.firstrun.done", true);
    w.hidden = true;
    if (location.hash == "#welcome") history.replaceState(null, "", "#look");
    route();
  }
  w.hidden = false;
  render();
}

// ============================================================ LOOKS etc.
function applyLook(id) {
  const look = D.LOOKS[id];
  for (const [k, v] of Object.entries(look.prefs)) {
    if (M.typeOf(k)) set(k, v);
  }
  toast(`${look.name} look applied`);
}

function looksPicker() {
  const swatch = {
    classic: ["ignis", "top"], zen: ["obsidian", "vertical"], arc: ["synthwave", "vertical"],
    chrome: ["ash", "top"], minimal: ["void", "top"], hacker: ["toxic", "top"],
  };
  return h("div", { class: "looks" }, Object.entries(D.LOOKS).map(([id, look]) => {
    const t = M.THEMES[swatch[id][0]];
    const vertical = swatch[id][1] == "vertical";
    return h("button", { class: "look", onclick: () => applyLook(id) },
      h("div", { class: "look-pic", style: { background: t.bg } },
        vertical ? h("i", { class: "lp-side", style: { background: t.bg2 } }) : h("i", { class: "lp-top", style: { background: t.bg2 } }),
        h("i", { class: "lp-page" + (look.prefs["ignifox.layout.floatingContent"] ? " floating" : ""), style: { background: t.bg3, borderColor: t.accent + "55" } }),
        h("i", { class: "lp-dot", style: { background: t.accent } })),
      h("b", {}, look.name), h("small", {}, look.blurb));
  }));
}

function surpriseMe() {
  const p = D.randomPalette();
  set("ignifox.theme.custom", JSON.stringify(p));
  P.clearUserPref("ignifox.theme.accent");
  set("ignifox.theme.preset", "custom");
  toast("New colors rolled. Hit Surprise me again, or save them below");
}

function frameFile() {
  const file = h("input", { id: "frame-file", type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/avif", hidden: true });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) { toast("That picture is over 30 MB"); return; }
    try {
      await IgniBoot.setFrameImage(new Uint8Array(await f.arrayBuffer()), f.name.split(".").pop());
      toast("Tab strip picture set");
    } catch (e) {
      toast("Couldn't use that picture: " + e.message);
    }
    file.value = "";
  });
  return file;
}

function menuCleanup() {
  const wrap = h("div", { class: "card" });
  const keysNow = () => new Set(String(get("ignifox.menu.hide") || "").split(",").filter(Boolean));
  for (const [key, item] of Object.entries(D.MENU_ITEMS)) {
    const input = h("input", { type: "checkbox", role: "switch", "aria-label": `Hide ${item.label}` });
    input.addEventListener("change", () => {
      const k = keysNow();
      input.checked ? k.add(key) : k.delete(key);
      set("ignifox.menu.hide", [...k].join(","));
    });
    bind(() => { input.checked = keysNow().has(key); }, input);
    wrap.append(row(null, item.label, null, h("label", { class: "switch" }, input)));
  }
  return wrap;
}

// ================================================================= FONTS
let fontFaceStyle = null;
async function refreshStudioFontFaces(list) {
  list ||= await Fonts.listImported();
  if (!fontFaceStyle) {
    fontFaceStyle = h("style", { id: "imported-fonts" });
    document.head.append(fontFaceStyle);
  }
  fontFaceStyle.textContent = Fonts.fontFaceCSS(list);
  return list;
}

function fontPickerList(id) {
  const dl = h("datalist", { id });
  Promise.all([Fonts.systemFamilies(), Fonts.listImported()]).then(([sys, imp]) => {
    const all = [...new Set([...imp.map(f => f.family), ...sys, "monospace", "serif", "sans-serif", "system-ui"])];
    dl.replaceChildren(...all.map(f => h("option", { value: f })));
  });
  return dl;
}

function fontRow(key, label, desc, listId) {
  return text(key, label, desc, { placeholder: "Type or pick a font", list: fontPickerList(listId) });
}

function renderFonts() {
  const listCard = h("div", { class: "card" });
  const sample = h("input", { type: "text", value: "Ignifox 0123 — The quick brown fox", "aria-label": "Preview text", style: { minWidth: "320px" } });
  const file = h("input", { type: "file", multiple: true, accept: ".ttf,.otf,.ttc,.woff,.woff2", hidden: true });

  async function render() {
    const list = await refreshStudioFontFaces();
    if (!list.length) {
      listCard.replaceChildren(row(null, "No imported fonts yet", "Add .ttf, .otf, .ttc, .woff or .woff2 files. Free fonts: fonts.google.com, fontsource.org, nerdfonts.com."));
      return;
    }
    const quote = f => (/[\s\d]/.test(f) ? `"${f}"` : f);
    listCard.replaceChildren(...list.map(f => h("div", { class: "row font-row" },
      h("div", {},
        h("div", { class: "font-sample", style: { fontFamily: `"${f.family}", monospace` } }, sample.value || f.family),
        h("div", { class: "desc" }, `${f.family} · ${f.file} · ${Math.max(1, Math.round(f.size / 1024))} KB`)),
      h("div", { class: "ctl", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
        h("button", { class: "btn", title: "Use for tabs, menus and toolbars", onclick: () => { set("ignifox.font.family", quote(f.family)); toast(`Interface font: ${f.family}`); } }, "Interface"),
        h("button", { class: "btn", title: "Default font for websites", onclick: () => { set("font.name.sans-serif.x-western", f.family); toast(`Websites now default to ${f.family}`); } }, "Websites"),
        h("button", { class: "btn", title: "Clock and greeting on the new tab", onclick: () => { set("ignifox.newtab.font", f.family); toast(`New tab font: ${f.family}`); } }, "New tab"),
        h("button", { class: "btn danger", onclick: async () => { await Fonts.removeFont(f.file); toast(`${f.family} removed`); render(); } }, "Remove")))));
  }

  file.addEventListener("change", async () => {
    let ok = 0;
    for (const f of file.files) {
      try {
        const r = await Fonts.importFont(f.name, new Uint8Array(await f.arrayBuffer()));
        ok++;
        toast(`Added ${r.family}`);
      } catch (e) {
        toast(`${f.name}: ${e.message}`);
      }
    }
    file.value = "";
    if (ok > 1) toast(`Added ${ok} fonts`);
    render();
  });
  sample.addEventListener("input", () => listCard.querySelectorAll(".font-sample").forEach(el => (el.textContent = sample.value || " ")));
  render();

  return [
    h("h1", {}, "Fonts"),
    h("p", { class: "lede" }, "Drop in any font file and use it for the browser itself, for websites, or for your new tab. Imported fonts go to ~/.local/share/fonts/ignifox, so your other apps can use them too."),
    h("div", { class: "btns" }, file,
      h("button", { class: "btn primary", onclick: () => file.click() }, "Add font files…"),
      sample),
    h("h2", {}, "Imported fonts"),
    listCard,
    h("h2", {}, "Browser interface"),
    card(
      fontRow("ignifox.font.family", "Interface font", "Tabs, menus and toolbars. Leave empty for your system font.", "fl-ui"),
      range("ignifox.font.size", "Interface text size", "0 = system default.", 0, 20, 1, v => (v < 9 ? "auto" : `${v}px`))),
    h("h2", {}, "Websites"),
    card(
      fontRow("font.name.sans-serif.x-western", "Sans-serif font", "Used by most websites that don't pick their own.", "fl-sans"),
      fontRow("font.name.serif.x-western", "Serif font", null, "fl-serif"),
      fontRow("font.name.monospace.x-western", "Monospace font", "Code blocks and terminals on the web.", "fl-mono"),
      range("font.size.variable.x-western", "Default text size", null, 9, 28, 1, v => `${v}px`),
      range("font.minimum-size.x-western", "Minimum text size", "Stops sites from using tiny text. 0 = no minimum.", 0, 24, 1, v => (v ? `${v}px` : "none")),
      toggle("browser.display.use_document_fonts", "Let websites use their own fonts", "Off = every site uses your fonts above.", { on: 1, off: 0 })),
    h("h2", {}, "New tab"),
    card(fontRow("ignifox.newtab.font", "Clock & greeting font", "Empty = the built-in look (thin clock, Metal Mania greeting).", "fl-nt")),
  ];
}

// ================================================================ ADD-ONS
function renderAddons() {
  const grid = h("div", { class: "addons" });
  let AM;
  try {
    ({ AddonManager: AM } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs"));
  } catch (e) {}
  async function render() {
    let names = [];
    try {
      names = (await AM.getAddonsByTypes(["extension"])).map(a => a.name.toLowerCase());
    } catch (e) {}
    grid.replaceChildren(...D.RECOMMENDED_ADDONS.map(a => {
      const have = names.some(n => n.includes(a.match));
      const btn = h("button", { class: "btn" + (have ? "" : " primary"), disabled: have }, have ? "Installed" : "Install");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Installing…";
        const r = await Importer.installAddon(a.slug);
        toast(r == "ok" ? `${a.name} installed` : r == "missing" ? `${a.name} isn't available right now` : `${a.name}: ${r}`);
        render();
      });
      return h("div", { class: "addon" }, h("b", {}, a.name), h("p", {}, a.blurb), btn);
    }));
  }
  render();
  return [
    h("h1", {}, "Add-ons"),
    h("p", { class: "lede" }, "Hand-picked, open-source add-ons that fit Ignifox. One click installs from addons.mozilla.org. uBlock Origin is already included."),
    grid,
    h("div", { class: "btns", style: { marginTop: "14px" } },
      h("button", { class: "btn", onclick: () => browserWin()?.openTrustedLinkIn("about:addons", "tab") }, "Manage add-ons"),
      h("button", { class: "btn", onclick: () => browserWin()?.openTrustedLinkIn("https://addons.mozilla.org/firefox/", "tab") }, "Browse addons.mozilla.org")),
  ];
}

// ================================================================= IMPORT
function fmtDate(ms) {
  if (!ms) return "unknown";
  const days = Math.round((Date.now() - ms) / 86400000);
  return days <= 0 ? "today" : days == 1 ? "yesterday" : days < 60 ? `${days} days ago` : new Date(ms).toLocaleDateString();
}

function renderImport() {
  const wrap = h("div", {});
  const pendingBox = h("div", {});
  const launcher = Importer.launcherAvailable();

  async function showPending() {
    const pend = await Importer.pendingImport();
    if (!pend) { pendingBox.replaceChildren(); return; }
    pendingBox.replaceChildren(h("div", { class: "card notice" },
      row(null, `Waiting to finish: ${pend.files.length} file(s) from ${pend.source}`,
        "Passwords, logins, tabs and form history are swapped in while Ignifox is closed. Your current files are backed up first.",
        [h("button", { class: "btn primary", disabled: !launcher, onclick: () => Importer.restartToFinishImport() }, "Restart to finish"),
          h("button", { class: "btn", onclick: async () => { await Importer.cancelPendingImport(); showPending(); toast("Pending import cancelled"); } }, "Cancel")])));
  }

  function profileCard(pf) {
    const body = h("div", { class: "imp-body", hidden: true });
    const logins = Importer.currentLoginCount();
    const live = [
      ["bookmarks", "Bookmarks", pf.hasPlaces, true],
      ["history", "History (last year)", pf.hasPlaces, true],
      ["settings", pf.legacy ? "All Emberfox settings, theme & layout" : "Settings (startup, downloads, fonts, privacy…)", true, true],
      ["chrome", pf.legacy ? "Custom CSS, userChrome & new tab wallpaper" : "userChrome.css / userContent.css tweaks", true, true],
      ["extensions", "Extensions (reinstalled from addons.mozilla.org)", true, true],
    ];
    const staged = Object.entries(D.STAGED_ITEMS).map(([k, it]) => [k, it.label, launcher && !(k == "passwords" && logins > 0), k != "tabs"]);
    const boxes = {};
    const opt = ([k, label, enabled, on]) => {
      const cb = h("input", { type: "checkbox", disabled: !enabled, checked: enabled && on ? true : null });
      boxes[k] = cb;
      return h("label", { class: "imp-opt" + (enabled ? "" : " off") }, cb, label);
    };
    const status = h("div", { class: "imp-status" });
    const extBox = h("div", {});
    const go = h("button", { class: "btn primary" }, "Import selected");
    go.addEventListener("click", async () => {
      go.disabled = true;
      const want = k => boxes[k] && boxes[k].checked && !boxes[k].disabled;
      const log = msg => status.append(h("div", {}, msg));
      status.replaceChildren();
      const step = async (k, label, fn) => {
        if (!want(k)) return;
        log(`… ${label}`);
        try {
          const r = await fn();
          status.lastChild.textContent = `✓ ${label}${typeof r == "number" || typeof r == "string" ? `: ${r}` : ""}`;
        } catch (e) {
          status.lastChild.textContent = `✗ ${label}: ${e.message || e}`;
        }
      };
      await step("bookmarks", "Bookmarks", () => Importer.importBookmarks(pf));
      await step("history", "History pages", () => Importer.importHistory(pf));
      await step("settings", "Settings", () => Importer.importSettings(pf));
      await step("chrome", "Style files", () => Importer.importChromeFolder(pf, { setWallpaper: (b, e) => IgniBoot.setNewtabWallpaper(b, e) }));
      const stageKeys = Object.keys(D.STAGED_ITEMS).filter(want);
      if (stageKeys.length) {
        await step(stageKeys[0], "Staged for restart", async () => (await Importer.stageImport(pf, stageKeys)).length + " file(s)");
        showPending();
      }
      if (want("extensions")) {
        const exts = await Importer.listExtensions(pf);
        const todo = exts.filter(x => !x.installed);
        if (!todo.length) {
          log(exts.length ? "✓ Extensions: all already installed" : "✓ Extensions: none found");
        } else {
          const checks = todo.map(x => ({ x, cb: h("input", { type: "checkbox", checked: x.enabled ? true : null }) }));
          const inst = h("button", { class: "btn primary" }, `Install ${todo.length} extension(s)`);
          inst.addEventListener("click", async () => {
            inst.disabled = true;
            for (const { x, cb } of checks) {
              if (!cb.checked) continue;
              const r = await Importer.installAddon(x.id);
              cb.parentElement.append(h("span", { class: "val" }, r == "ok" ? " ✓" : r == "missing" ? " not on addons.mozilla.org" : " ✗"));
            }
            inst.textContent = "Done";
          });
          extBox.replaceChildren(h("h2", {}, "Extensions to reinstall"),
            h("p", { class: "lede" }, "Add-ons come fresh from addons.mozilla.org; their own settings don't carry over (most can export/import or sync them)."),
            h("div", { class: "imp-opts" }, checks.map(({ x, cb }) => h("label", { class: "imp-opt" }, cb, x.name, x.type == "theme" ? " (theme)" : ""))),
            inst);
        }
      }
      log("Done. Bookmarks and history are in place now.");
      go.disabled = false;
    });

    const head = h("button", { class: "imp-head", onclick: () => (body.hidden = !body.hidden) },
      h("b", {}, pf.browser), h("span", {}, ` · ${pf.name}`),
      pf.isDefault ? h("span", { class: "badge" }, "Default") : null,
      pf.running ? h("span", { class: "badge" }, "Running") : null,
      h("small", {}, `used ${fmtDate(pf.modified)}`));
    body.append(...[
      h("div", { class: "desc" }, pf.path),
      pf.running ? h("p", { class: "warn" }, `${pf.browser} is open. Close it first for the newest data; otherwise you get a copy as of right now.`) : null,
      h("div", { class: "imp-title" }, "Right now"),
      h("div", { class: "imp-opts" }, live.map(opt)),
      h("div", { class: "imp-title" }, "On next start" + (launcher ? "" : " (needs the standard ignifox launcher)")),
      h("div", { class: "imp-opts" }, staged.map(opt)),
      logins > 0 ? h("p", { class: "desc" }, `You already have ${logins} saved password(s) here, so passwords won't be swapped. Instead export them from ${pf.browser} (about:logins → ⋯ → Export) and use Import from a file below.`) : null,
      h("div", { class: "btns", style: { marginTop: "10px" } }, go),
      status, extBox].filter(Boolean));
    return h("div", { class: "card imp" }, head, body);
  }

  async function render() {
    wrap.replaceChildren(h("p", { class: "lede" }, "Looking for browsers…"));
    let list = [];
    try {
      list = await Importer.findProfiles();
    } catch (e) {
      wrap.replaceChildren(card(row(null, "Couldn't scan for profiles", String(e))));
      return;
    }
    wrap.replaceChildren(
      list.length ? h("div", { class: "imp-list" }, list.map(profileCard))
        : card(row(null, "No other Firefox-family browsers found", "Looked for Firefox (incl. Snap & Flatpak), LibreWolf, Waterfox, Floorp, Zen, Mullvad Browser and Emberfox.")));
    const first = wrap.querySelector(".imp-body");
    if (first) first.hidden = false;
  }
  render();
  showPending();

  return [
    h("h1", {}, "Import"),
    h("p", { class: "lede" }, "Bring your bookmarks, history, passwords, logins, open tabs, settings and extensions from Firefox, any Firefox-based browser, or an older Emberfox. Your old browser isn't changed."),
    pendingBox,
    h("h2", {}, "Firefox-family browsers"),
    wrap,
    h("h2", {}, "Chrome, Brave, Edge, Vivaldi, Opera, Chromium"),
    card(
      row(null, "Import from a Chromium browser", "Bookmarks, history, passwords and payment methods, using Firefox's built-in importer.",
        h("button", { class: "btn", onclick: () => {
          try {
            const { MigrationUtils } = ChromeUtils.importESModule("moz-src:///browser/components/migration/MigrationUtils.sys.mjs");
            MigrationUtils.showMigrationWizard(browserWin(), {});
          } catch (e) {
            browserWin()?.openPreferences("general-migrate");
          }
        } }, "Open importer")),
      row(null, "Passwords from a file", "A CSV exported from any browser or password manager.",
        h("button", { class: "btn", onclick: () => browserWin()?.openTrustedLinkIn("about:logins", "tab") }, "Open passwords")),
      row(null, "Bookmarks from an HTML file", "Use the Library window: Import and Backup → Import Bookmarks from HTML.",
        h("button", { class: "btn", onclick: () => browserWin()?.PlacesCommandHook?.showPlacesOrganizer("AllBookmarks") }, "Open Library"))),
  ];
}

// =============================================================== router
const built = new Map();
function route() {
  let id = (location.hash || "#look").slice(1);
  if (id == "welcome") {
    openWelcome();
    id = "look";
  }
  if (!SECTIONS.some(s => s[0] == id)) id = "look";
  for (const [sid, , render] of SECTIONS) {
    let sec = built.get(sid);
    if (sid == id && !sec) {
      sec = h("section", { id: `s-${sid}` }, render());
      $("#main").append(sec);
      built.set(sid, sec);
    }
    sec?.classList.toggle("active", sid == id);
  }
  document.querySelectorAll("#nav-links a").forEach(a => a.classList.toggle("active", a.dataset.id == id));
  window.scrollTo(0, 0);
}

function init() {
  $("#nav-links").replaceChildren(...SECTIONS.map(([id, title]) =>
    h("a", { href: `#${id}`, dataset: { id } }, svgIcon(ICONS[id]), title)));
  paintStudio();
  window.addEventListener("hashchange", route);
  route();
}
init();
