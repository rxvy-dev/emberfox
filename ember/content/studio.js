/* Ember Studio — about:ember
 * Privileged page (system principal): talks to Services.prefs and
 * CustomizableUI directly. Every control is live: change it and every
 * browser window repaints immediately, no restart. */

import * as M from "chrome://ember/content/prefs.sys.mjs";

const { EmberBoot } = ChromeUtils.importESModule("chrome://ember/content/boot.sys.mjs");
let CUI = null;
try {
  ({ CustomizableUI: CUI } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
  ));
} catch (e) {
  try {
    ({ CustomizableUI: CUI } = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs"));
  } catch (e2) {
    console.warn("[Ember Studio] CustomizableUI unavailable", e2);
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
  return v === undefined ? M.EMBER_PREFS[key]?.def : v;
}
function set(key, value) {
  if (!M.writePref(P, key, typeOf(key), value)) {
    toast("That setting is locked by policy");
  }
}
function emberValues() {
  const out = {};
  for (const key of Object.keys(M.EMBER_PREFS)) out[key] = get(key);
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
P.addObserver("ember.", prefObserver);
for (const key of Object.keys(M.NATIVE_PREFS)) P.addObserver(key, prefObserver);
window.addEventListener("unload", () => {
  P.removeObserver("ember.", prefObserver);
  for (const key of Object.keys(M.NATIVE_PREFS)) P.removeObserver(key, prefObserver);
  if (CUI && placementListener) CUI.removeListener(placementListener);
});

/** Studio wears the active Ember palette. */
function paintStudio() {
  const pal = M.resolvePalette(emberValues());
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
    const pal = M.resolvePalette(emberValues());
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
  const btn = h("button", { class: "theme" + (get("ember.theme.preset") == id ? " selected" : ""), title: label, onclick: () => set("ember.theme.preset", id) },
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
      ...Object.entries(M.savedThemes(emberValues())).map(([name, p]) =>
        themeCard("user:" + name, M.completePalette(p, name), "★ " + name)),
      themeCard("custom", M.completePalette(safeJSON(get("ember.theme.custom")), "Custom"), "✎ Custom"));
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
    const v = emberValues();
    const cur = M.resolvePalette(v);
    const next = {};
    M.PALETTE_KEYS.forEach(key => (next[key] = cur[key]));
    next[k] = value;
    set("ember.theme.custom", JSON.stringify(next));
    if (v["ember.theme.preset"] != "custom") {
      P.clearUserPref("ember.theme.accent");
      set("ember.theme.preset", "custom");
    }
  }

  bind(() => {
    const pal = M.resolvePalette(emberValues());
    for (const k of M.PALETTE_KEYS) {
      if (document.activeElement != inputs[k].input) inputs[k].input.value = pal[k];
      inputs[k].hex.textContent = pal[k];
    }
  }, inputs.bg.input);

  // save / share / delete
  const nameIn = h("input", { type: "text", placeholder: "Theme name", "aria-label": "Theme name", style: { minWidth: "150px" } });
  const codeIn = h("input", { type: "text", placeholder: "ember:0b0607,…", "aria-label": "Theme code", style: { minWidth: "220px" } });
  const delBtn = h("button", { class: "btn danger", onclick: deleteSaved }, "Delete saved theme");

  function saveTheme() {
    const name = nameIn.value.trim().replace(/[^\w \-]/g, "").slice(0, 30);
    if (!name) { toast("Give the theme a name first"); return; }
    const v = emberValues();
    const saved = M.savedThemes(v);
    const pal = M.resolvePalette(v);
    saved[name] = Object.fromEntries(M.PALETTE_KEYS.map(k => [k, pal[k]]));
    set("ember.theme.saved", JSON.stringify(saved));
    set("ember.theme.preset", "user:" + name);
    nameIn.value = "";
    toast(`Saved “${name}”`);
  }
  function deleteSaved() {
    const preset = get("ember.theme.preset");
    if (!preset.startsWith("user:")) return;
    const saved = M.savedThemes(emberValues());
    delete saved[preset.slice(5)];
    set("ember.theme.saved", JSON.stringify(saved));
    set("ember.theme.preset", "ember");
    toast("Theme deleted");
  }
  async function copyCode() {
    const code = M.paletteToCode(M.resolvePalette(emberValues()));
    await navigator.clipboard.writeText(code);
    toast("Theme code copied: " + code);
  }
  function applyCode() {
    const pal = M.codeToPalette(codeIn.value);
    if (!pal) { toast("That isn't a valid ember: theme code"); return; }
    set("ember.theme.custom", JSON.stringify(Object.fromEntries(M.PALETTE_KEYS.map(k => [k, pal[k]]))));
    set("ember.theme.preset", "custom");
    codeIn.value = "";
    toast("Theme applied");
  }
  bind(() => { delBtn.hidden = !String(get("ember.theme.preset")).startsWith("user:"); }, delBtn);

  return h("div", {},
    card(...rows),
    h("div", { class: "card", style: { marginTop: "14px" } },
      row(null, "Save as my theme", "Keeps the current colors as a named theme in the gallery.",
        [nameIn, h("button", { class: "btn primary", onclick: saveTheme }, "Save")]),
      row(null, "Share", "Copy a short code anyone can paste into their Emberfox.",
        [h("button", { class: "btn", onclick: copyCode }, "Copy theme code"), delBtn]),
      row(null, "Paste a theme code", null,
        [codeIn, h("button", { class: "btn", onclick: applyCode }, "Apply")])));
}

// ------------------------------------------------------------------ nav
const ICONS = {
  look: "M12 2c1 4 6 5 5 10-.5 2.6-2.6 4-5 4s-4.6-1.4-5-4c-.6-3.6 2.4-4.6 2.8-8 1 2 1.6 3.2 1.6 4.8C12.2 7 12.6 4.6 12 2zM4 20h16v2H4z",
  placement: "M3 4h18v4H3zM3 10h7v10H3zM12 10h9v4h-9zM12 16h9v4h-9z",
  browsing: "M4 4h16v16H4zM6 8h12v2H6zM6 12h8v2H6z",
  privacy: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zm0 4a3 3 0 00-3 3v2H8v6h8v-6h-1V9a3 3 0 00-3-3zm0 2a1 1 0 011 1v2h-2V9a1 1 0 011-1z",
  ai: "M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2zM19 16l1 2.5 2.5 1-2.5 1L19 23l-1-2.5-2.5-1 2.5-1z",
  css: "M8 4L2 12l6 8 1.6-1.2L4.5 12l5.1-6.8zM16 4l-1.6 1.2 5.1 6.8-5.1 6.8L16 20l6-8z",
  backup: "M12 3l5 5h-3v6h-4V8H7zM4 16h2v3h12v-3h2v5H4z",
  about: "M12 2a10 10 0 110 20 10 10 0 010-20zm-1 8v7h2v-7zm0-4v2h2V6z",
};
const SECTIONS = [
  ["look", "Look & Color", renderLook],
  ["placement", "Placement", renderPlacement],
  ["browsing", "Tabs & Browsing", renderBrowsing],
  ["privacy", "Privacy", renderPrivacy],
  ["ai", "AI Features", renderAI],
  ["css", "Custom CSS", renderCSS],
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
      toggle("ember.theme.enabled", "Ember theming", "Paint the browser with the palette below. Turn off to use plain Firefox colors."),
      toggle("ember.theme.respectAddonThemes", "Step aside for add-on themes", "If you install a theme from addons.mozilla.org, show it instead of Ember colors."),
      toggle("ember.theme.contentBg", "Tint blank pages", "New tabs and loading pages use the theme background instead of flashing white.")),

    h("h2", {}, "Presets"),
    themeGallery(),

    h("h2", {}, "Quick accent"),
    card(colorPick("ember.theme.accent", "Accent color", "Keep the preset, just swap its highlight color (focus rings, glow, progress).")),

    h("h2", {}, "Palette editor"),
    h("p", { class: "lede" }, "Change any surface. Editing switches you to your Custom theme, starting from whatever is active, so you never lose a preset."),
    paletteEditor(),

    h("h2", {}, "Effects"),
    card(
      toggle("ember.fx.glow", "Ember glow on the active tab", "A soft accent halo around the selected tab and focused URL bar."),
      toggle("ember.fx.emberStrip", "Ember strip", "A thin accent gradient line between tabs and toolbar."),
      toggle("ember.fx.progressBar", "Ember loading bar", "Animated accent line on tabs that are loading."),
      toggle("ui.prefersReducedMotion", "Reduce motion", "Turn off UI animations everywhere, including websites that respect it.", { on: 1, off: 0 })),

    h("h2", {}, "Shape & type"),
    card(
      range("ember.shape.radius", "Corner roundness", "Tabs, buttons, URL bar and menus.", 0, 20, 1, v => `${v}px`),
      range("browser.tabs.tabMinWidth", "Tab minimum width", "Smaller = more tabs before scrolling.", 40, 250, 5, v => `${v}px`),
      range("ember.shape.tabMaxWidth", "Tab maximum width", null, 120, 500, 5, v => `${v}px`),
      select("browser.uidensity", "Density", "Compact trims padding across all toolbars.", [[0, "Normal"], [1, "Compact"]]),
      text("ember.font.family", "Interface font", "Any installed font. Leave empty for your system font.", {
        placeholder: "e.g. Inter, JetBrains Mono",
        list: h("datalist", { id: "fonts" },
          ["Inter", "Cantarell", "Noto Sans", "Ubuntu", "Fira Sans", "IBM Plex Sans", "JetBrains Mono", "Iosevka", "Hack", "monospace"]
            .map(f => h("option", { value: f }))),
      }),
      range("ember.font.size", "Interface text size", "0 = system default.", 0, 20, 1, v => (v < 9 ? "auto" : `${v}px`)),
      select("layout.css.prefers-color-scheme.content-override", "Websites prefer", "What color scheme sites see when they offer light/dark versions.",
        [[0, "Dark"], [1, "Light"], [2, "Follow system"], [3, "Follow browser theme"]])),
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
    const b = h("button", { class: "layout", onclick: () => set("ember.layout.tabs", id) },
      h("div", { class: "pic" }, boxes.map(([c, x, y, w, hh]) =>
        h("i", { class: c, style: { left: `${x}%`, top: `${y}px`, width: `${w}%`, height: `${hh}px` } }))),
      h("b", {}, name), h("small", {}, sub));
    bind(() => b.classList.toggle("selected", get("ember.layout.tabs") == id), b);
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
    h("h2", {}, "Bars & sidebar"),
    card(
      toggle("sidebar.position_start", "Sidebar on the left", "Turn off to dock the sidebar (and vertical tabs) on the right."),
      select("sidebar.visibility", "Vertical tab sidebar", null,
        [["always-show", "Always expanded"], ["expand-on-hover", "Collapsed, expand on hover"], ["hide-sidebar", "Hidden until toggled"]]),
      select("browser.toolbars.bookmarks.visibility", "Bookmarks bar", null,
        [["always", "Always show"], ["newtab", "Only on new tab"], ["never", "Never"]]),
      toggle("ember.layout.autohide", "Focus mode", "Toolbars slide away and come back when you point at the top edge. Ctrl+Alt+Z toggles it."),
      toggle("ember.layout.urlbarCentered", "Center the address", "URL text sits in the middle until you click in."),
      toggle("ember.layout.compactNavbar", "Slim navigation bar", "Less padding around buttons and the URL bar."),
      toggle("ember.layout.tabCloseHover", "Close buttons on hover only", "Cleaner tabs: × appears on the active or hovered tab.")),

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

    h("h2", {}, "Hide things"),
    card(
      toggle("ember.hide.newTabButton", "New-tab (+) button", "Ctrl+T still works."),
      toggle("ember.hide.allTabsButton", "List-all-tabs button"),
      toggle("ember.hide.extensionsButton", "Extensions puzzle button", "Pinned extension icons stay visible."),
      toggle("ember.hide.disabledNavButtons", "Back/forward when there's nowhere to go"),
      toggle("ember.hide.urlbarIcons", "Extra URL bar icons", "Tracking shield and page actions, until you click into the bar."),
      toggle("ember.hide.tabIcons", "Tab favicons", "Text-only tabs (pinned tabs keep their icons).")),
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
      toggle("browser.tabs.warnOnClose", "Warn before closing many tabs")),
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
      toggle("browser.urlbar.suggest.topsites", "Show shortcuts when the bar is empty")),
    h("h2", {}, "Media & performance (Linux)"),
    card(
      select("media.autoplay.default", "Autoplay", null, [[0, "Allow audio and video"], [1, "Block audio"], [5, "Block audio and video"]]),
      toggle("media.videocontrols.picture-in-picture.video-toggle.enabled", "Picture-in-picture button on videos"),
      toggle("media.hardware-video-decoding.force-enabled", "Force hardware video decoding", "VA-API on Intel/AMD, and NVIDIA via nvidia-vaapi-driver. Lower CPU use on YouTube & Twitch."),
      toggle("media.ffmpeg.vaapi.enabled", "Use VA-API through FFmpeg"),
      select("dom.ipc.processCount", "Content processes", "More = better isolation and speed with many tabs, more RAM.",
        [[4, "4 (low RAM)"], [8, "8 (default)"], [12, "12"], [16, "16 (lots of RAM)"]]),
      toggle("browser.download.useDownloadDir", "Save downloads without asking", "Off = choose a folder every time."),
      toggle("findbar.highlightAll", "Find bar highlights every match")),
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

function renderPrivacy() {
  return [
    h("h1", {}, "Privacy"),
    h("p", { class: "lede" }, "Emberfox never phones home. Telemetry, studies, experiments and crash uploads are locked off at the engine level. Below is how hard you want to go beyond that."),
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
      toggle("privacy.sanitize.sanitizeOnShutdown", "Clear data when Emberfox closes"),
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
  border: 1px solid color-mix(in srgb, var(--ember-accent, currentColor) 45%, transparent) !important;
}`,
  "Taller tabs": `:root { --tab-min-height: 40px !important; }`,
  "Monospace URL bar": `.urlbar-input { font-family: "JetBrains Mono", monospace !important; }`,
  "Accent tab text": `.tabbrowser-tab[selected] .tab-label { color: var(--ember-accent) !important; font-weight: 600; }`,
};
const CSS_TEMPLATE = `/* Ember Studio custom CSS
 * Applied live to the browser UI when you press Save (Ctrl+S).
 * Ember variables you can use:
 *   --ember-bg --ember-bg-2 --ember-bg-3 --ember-fg --ember-fg-dim
 *   --ember-accent --ember-accent-2 --ember-radius
 * Browser Toolbox (Ctrl+Alt+Shift+I) lets you inspect the UI.
 */

`;

function renderCSS() {
  const path = EmberBoot.customCSSPath();
  const area = h("textarea", { class: "editor", spellcheck: "false", "aria-label": "Custom CSS" });
  const status = h("span", { class: "val", style: { textAlign: "start" } });
  IOUtils.readUTF8(path).then(t => (area.value = t), () => (area.value = CSS_TEMPLATE));

  async function save() {
    try {
      await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
      await IOUtils.writeUTF8(path, area.value);
      EmberBoot.bumpCustomCSS();
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
    h("p", { class: "lede" }, "Restyle anything in the browser UI. Stored in your profile as chrome/ember-custom.css. Classic userChrome.css works too."),
    card(toggle("ember.customcss.enabled", "Apply my custom CSS")),
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
  const data = { emberfox: 1, saved: new Date().toISOString(), prefs: {} };
  for (const key of [...Object.keys(M.EMBER_PREFS), ...Object.keys(M.NATIVE_PREFS)]) {
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
      if (!data || data.emberfox != 1) throw new Error("not an Emberfox settings file");
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
      row(null, "Export settings", "Saves emberfox-settings.json.", h("button", { class: "btn primary", onclick: () => {
        const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: "emberfox-settings.json" });
        document.body.append(a);
        a.click();
        a.remove();
      } }, "Export")),
      row(null, "Import settings", null, [file, h("button", { class: "btn", onclick: () => file.click() }, "Import…")]),
      row(null, "Reset Ember Studio", "Theme, layout and effects back to Emberfox defaults. Saved themes are kept.",
        h("button", { class: "btn danger", onclick: () => {
          for (const k of Object.keys(M.EMBER_PREFS)) if (k != "ember.theme.saved" && k != "ember.firstrun.done") P.clearUserPref(k);
          toast("Ember Studio reset");
        } }, "Reset")),
      row(null, "Run the welcome setup again", null,
        h("button", { class: "btn", onclick: () => openWelcome() }, "Start"))),
  ];
}

// =============================================================== ABOUT
function renderAbout() {
  const ai = Services.appinfo;
  const verCell = h("div", {}, ai.version);
  EmberBoot.version?.().then(v => (verCell.textContent = v), () => {});
  const result = h("span", { class: "val", style: { textAlign: "start", minWidth: "0" } });
  async function checkNow(btn) {
    btn.disabled = true;
    result.textContent = "checking…";
    try {
      const r = await EmberBoot.checkForUpdate({ manual: true });
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
      h("img", { class: "logo", src: "chrome://ember/content/logo.svg", alt: "" }),
      h("div", {},
        h("img", { src: "chrome://ember/content/wordmark.svg", alt: "Emberfox", height: 64 }),
        h("p", { class: "lede", style: { margin: "8px 0 0" } }, "Private by force. Yours by design."))),
    h("div", { class: "card kv" },
      h("div", {}, "Emberfox"), verCell,
      h("div", {}, "Gecko engine"), h("div", {}, `${ai.platformVersion} (build ${ai.appBuildID})`),
      h("div", {}, "Platform"), h("div", {}, `${ai.OS} ${Services.sysinfo.getProperty("arch")}`),
      h("div", {}, "Profile"), h("div", {}, PathUtils.profileDir),
      h("div", {}, "Source"), h("div", {}, h("a", { href: "https://github.com/rxvy-dev/emberfox" }, "github.com/rxvy-dev/emberfox"))),
    h("h2", {}, "Updates"),
    card(
      toggle("ember.update.check", "Tell me when a new Emberfox is out",
        "Once a day, asks GitHub's public releases page for the latest version. No cookies, no IDs, nothing about you is sent. If you installed from a distro package, update through it instead."),
      row(null, "Check now", null, [result, h("button", { class: "btn", onclick: e => checkNow(e.currentTarget) }, "Check for updates")])),
    h("h2", {}, "Shortcuts"),
    h("div", { class: "card kv" },
      h("div", {}, "Ctrl+Alt+E"), h("div", {}, "Open Ember Studio"),
      h("div", {}, "Ctrl+Alt+Z"), h("div", {}, "Toggle focus mode"),
      h("div", {}, "Ctrl+Alt+Shift+I"), h("div", {}, "Browser Toolbox (inspect the UI for custom CSS)")),
    h("p", { class: "lede", style: { marginTop: "20px", fontSize: "12px" } },
      "Emberfox is built from Mozilla Firefox source code under the MPL 2.0. Firefox is a trademark of the Mozilla Foundation; Emberfox is not affiliated with or endorsed by Mozilla. Metal Mania font © Open Window, SIL OFL 1.1."),
  ];
}

// ============================================================= WELCOME
function openWelcome() {
  const w = $("#welcome");
  let step = 0;
  const steps = [
    () => h("div", { class: "step" },
      h("img", { class: "logo", src: "chrome://ember/content/logo.svg", alt: "" }),
      h("h1", {}, "Welcome to Emberfox"),
      h("p", { class: "lede" }, "Firefox's engine with the telemetry ripped out and the customization turned all the way up. Three quick picks and you're done.")),
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
    set("ember.firstrun.done", true);
    w.hidden = true;
    if (location.hash == "#welcome") history.replaceState(null, "", "#look");
    route();
  }
  w.hidden = false;
  render();
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
