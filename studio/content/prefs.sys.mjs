/* Ignifox — Ignifox Studio settings model.
 * Shared by the engine (boot.sys.mjs) and the Studio page (about:ignifox).
 * Pure data + tiny helpers: no side effects on import. */

// ---------------------------------------------------------------- themes
// bg  = tab strip / window frame      bg2 = toolbar, selected tab, panels
// bg3 = URL bar & fields              fg / fgDim = text
// accent / accent2 = highlights, glow, focus rings, progress
export const THEMES = {
  ignis:     { name: "Ignis",      dark: true,  bg: "#0b0607", bg2: "#170b0c", bg3: "#24110f", fg: "#f3e6e4", fgDim: "#a08c89", accent: "#ff3b1f", accent2: "#ffb02e" },
  bloodmoon: { name: "Bloodmoon",  dark: true,  bg: "#120203", bg2: "#1f0507", bg3: "#2e080c", fg: "#f6dede", fgDim: "#b08484", accent: "#e3121b", accent2: "#ff6a5c" },
  obsidian:  { name: "Obsidian",   dark: true,  bg: "#050505", bg2: "#0f0f11", bg3: "#1a1a1d", fg: "#e8e8ea", fgDim: "#8a8a92", accent: "#c9c9d1", accent2: "#ffffff" },
  void:      { name: "Void OLED",  dark: true,  bg: "#000000", bg2: "#000000", bg3: "#0e0e0e", fg: "#ffffff", fgDim: "#7a7a7a", accent: "#ff2a2a", accent2: "#ff8a7a" },
  ash:       { name: "Ash",        dark: true,  bg: "#1b1a1a", bg2: "#262423", bg3: "#312e2d", fg: "#ece7e5", fgDim: "#9d9593", accent: "#ff6b3d", accent2: "#ffc27a" },
  toxic:     { name: "Toxic",      dark: true,  bg: "#050a04", bg2: "#0c150a", bg3: "#14210f", fg: "#e2f5dc", fgDim: "#86a17c", accent: "#7dff3a", accent2: "#d4ff5a" },
  synthwave: { name: "Synthwave",  dark: true,  bg: "#0d0618", bg2: "#170b29", bg3: "#23103b", fg: "#f2e6ff", fgDim: "#9f8ab8", accent: "#ff2fb9", accent2: "#2de2ff" },
  glacier:   { name: "Glacier",    dark: true,  bg: "#060b12", bg2: "#0c1520", bg3: "#13202f", fg: "#e3eefa", fgDim: "#7f93a8", accent: "#38bdf8", accent2: "#a5f3fc" },
  frost:     { name: "Frost",      dark: false, bg: "#e6eaef", bg2: "#f7f9fb", bg3: "#ffffff", fg: "#18202b", fgDim: "#596676", accent: "#e3121b", accent2: "#ff6a3d" },
  paper:     { name: "Paper",      dark: false, bg: "#ece6dc", bg2: "#f8f4ec", bg3: "#fffdf8", fg: "#2b241c", fgDim: "#7a6d5c", accent: "#b4261a", accent2: "#e0892b" },
};

// Built-in Firefox themes that Ignifox is allowed to paint over.
// Anything else (an AMO theme) is respected when ignifox.theme.respectAddonThemes is on.
export const PAINTABLE_THEME_IDS = new Set([
  "default-theme@mozilla.org",
  "firefox-compact-dark@mozilla.org",
  "firefox-compact-light@mozilla.org",
]);

// --------------------------------------------------------- ignifox.* prefs
// Applied live by the engine to every browser window.
export const IGNI_PREFS = {
  "ignifox.theme.enabled":            { type: "bool",   def: true },
  "ignifox.theme.preset":             { type: "string", def: "ignis" },
  "ignifox.theme.accent":             { type: "string", def: "" },        // "" = use preset accent
  // Full custom palette (preset "custom"): JSON {bg,bg2,bg3,fg,fgDim,accent,accent2}
  "ignifox.theme.custom":             { type: "string", def: "" },
  // User-saved themes (preset "user:<name>"): JSON { name: palette, ... }
  "ignifox.theme.saved":              { type: "string", def: "{}" },
  "ignifox.theme.respectAddonThemes": { type: "bool",   def: true },
  "ignifox.theme.contentBg":          { type: "bool",   def: true },      // tint blank/new-tab page background
  "ignifox.fx.glow":                  { type: "bool",   def: true },
  "ignifox.fx.accentStrip":            { type: "bool",   def: false },     // accent gradient line under the tab strip
  "ignifox.fx.progressBar":           { type: "bool",   def: true },      // animated line on loading tabs
  "ignifox.layout.tabs":              { type: "string", def: "top" },     // top | bottom | vertical | hidden
  "ignifox.layout.autohide":          { type: "bool",   def: false },     // focus mode: toolbars slide in on hover
  "ignifox.layout.urlbarCentered":    { type: "bool",   def: false },
  "ignifox.layout.tabCloseHover":     { type: "bool",   def: false },
  "ignifox.layout.compactNavbar":     { type: "bool",   def: false },
  "ignifox.hide.newTabButton":        { type: "bool",   def: false },
  "ignifox.hide.allTabsButton":       { type: "bool",   def: false },
  "ignifox.hide.urlbarIcons":         { type: "bool",   def: false },
  "ignifox.hide.extensionsButton":    { type: "bool",   def: false },
  "ignifox.hide.disabledNavButtons":  { type: "bool",   def: false },
  "ignifox.hide.tabIcons":            { type: "bool",   def: false },
  "ignifox.shape.radius":             { type: "int",    def: 8,   min: 0,   max: 20 },
  "ignifox.shape.tabMaxWidth":        { type: "int",    def: 225, min: 120, max: 500 },
  "ignifox.font.family":              { type: "string", def: "" },
  "ignifox.font.size":                { type: "int",    def: 0,   min: 0,   max: 20 }, // 0 = system default
  // tabs & window
  "ignifox.tabs.style":               { type: "string", def: "default" }, // default | pill | underline | boxy
  "ignifox.tabs.height":              { type: "int",    def: 0,   min: 0,   max: 56 }, // 0 = Firefox default
  "ignifox.layout.floatingContent":   { type: "bool",   def: false },     // page area as a rounded card
  "ignifox.layout.contentGap":        { type: "int",    def: 6,   min: 2,   max: 24 },
  "ignifox.layout.urlbarMaxWidth":    { type: "int",    def: 0,   min: 0,   max: 1800 }, // 0 = fill
  "ignifox.layout.bookmarksIconsOnly":{ type: "bool",   def: false },
  "ignifox.layout.compactMenus":      { type: "bool",   def: false },
  // Ignifox New Tab
  "ignifox.newtab.enabled":           { type: "bool",   def: true },
  "ignifox.newtab.home":              { type: "bool",   def: true },      // also use it as the home page
  "ignifox.newtab.layout":            { type: "string", def: "center" },  // center | top | minimal
  "ignifox.newtab.wallpaper":         { type: "string", def: "embers" },  // embers | aurora | gradient | solid | image | none
  "ignifox.newtab.wallpaperFile":     { type: "string", def: "" },
  "ignifox.newtab.dim":               { type: "int",    def: 25,  min: 0,   max: 90 },
  "ignifox.newtab.blur":              { type: "int",    def: 0,   min: 0,   max: 30 },
  "ignifox.newtab.clock":             { type: "bool",   def: true },
  "ignifox.newtab.clock24":           { type: "bool",   def: false },
  "ignifox.newtab.seconds":           { type: "bool",   def: false },
  "ignifox.newtab.date":              { type: "bool",   def: true },
  "ignifox.newtab.greeting":          { type: "bool",   def: true },
  "ignifox.newtab.name":              { type: "string", def: "" },
  "ignifox.newtab.search":            { type: "bool",   def: true },
  "ignifox.newtab.engineSwitcher":    { type: "bool",   def: true },
  "ignifox.newtab.links":             { type: "string", def: "" },        // JSON [{title,url}], "" = defaults
  "ignifox.newtab.topSites":          { type: "bool",   def: false },     // add most-visited sites from history
  "ignifox.newtab.columns":           { type: "int",    def: 6,   min: 3,   max: 10 },
  "ignifox.newtab.tileStyle":         { type: "string", def: "rounded" }, // rounded | circle | square | minimal
  "ignifox.newtab.favicons":          { type: "bool",   def: false },     // fetch /favicon.ico from each site
  "ignifox.newtab.notes":             { type: "bool",   def: false },
  "ignifox.customcss.enabled":        { type: "bool",   def: true },
  "ignifox.customcss.rev":            { type: "int",    def: 0 },
  "ignifox.firstrun.done":            { type: "bool",   def: false },
  // Update notifier: asks GitHub's public releases API whether a newer Ignifox exists.
  // Sends no identifiers or cookies. The updater binary itself is removed.
  "ignifox.update.check":             { type: "bool",   def: true },
  "ignifox.update.lastCheck":         { type: "int",    def: 0 },       // unix seconds
  "ignifox.update.skipVersion":       { type: "string", def: "" },
};

// Firefox's own prefs that Studio surfaces (types used for read/write + backup).
export const NATIVE_PREFS = {
  // appearance
  "browser.uidensity": "int",
  "browser.toolbars.bookmarks.visibility": "string",
  "layout.css.prefers-color-scheme.content-override": "int",
  "ui.prefersReducedMotion": "int",
  "browser.tabs.tabMinWidth": "int",
  // tabs
  "sidebar.verticalTabs": "bool",
  "sidebar.revamp": "bool",
  "sidebar.visibility": "string",
  "sidebar.position_start": "bool",
  "sidebar.expandOnHover": "bool",
  "browser.tabs.closeTabByDblclick": "bool",
  "toolkit.tabbox.switchByScrolling": "bool",
  "browser.tabs.loadInBackground": "bool",
  "browser.tabs.insertAfterCurrent": "bool",
  "browser.tabs.closeWindowWithLastTab": "bool",
  "browser.tabs.hoverPreview.enabled": "bool",
  "browser.tabs.groups.enabled": "bool",
  "browser.tabs.splitView.enabled": "bool",
  "browser.tabs.unloadOnLowMemory": "bool",
  "browser.tabs.warnOnClose": "bool",
  "browser.startup.page": "int",
  // browsing
  "general.smoothScroll": "bool",
  "general.smoothScroll.msdPhysics.enabled": "bool",
  "mousewheel.default.delta_multiplier_y": "int",
  "general.autoScroll": "bool",
  "middlemouse.paste": "bool",
  "browser.urlbar.trimURLs": "bool",
  "browser.search.suggest.enabled": "bool",
  "browser.urlbar.suggest.history": "bool",
  "browser.urlbar.suggest.bookmark": "bool",
  "browser.urlbar.suggest.openpage": "bool",
  "browser.urlbar.suggest.topsites": "bool",
  "media.autoplay.default": "int",
  "media.videocontrols.picture-in-picture.video-toggle.enabled": "bool",
  "media.hardware-video-decoding.force-enabled": "bool",
  "media.ffmpeg.vaapi.enabled": "bool",
  "dom.ipc.processCount": "int",
  "browser.download.useDownloadDir": "bool",
  "browser.download.alwaysOpenPanel": "bool",
  "browser.ctrlTab.sortByRecentlyUsed": "bool",
  "privacy.userContext.enabled": "bool",
  "layout.spellcheckDefault": "int",
  "browser.tabs.loadBookmarksInTabs": "bool",
  "browser.urlbar.openintab": "bool",
  "layout.css.devPixelsPerPx": "string",
  "widget.non-native-theme.scrollbar.style": "int",
  "widget.gtk.overlay-scrollbars.enabled": "bool",
  "browser.startup.homepage": "string",
  // search
  "browser.search.suggest.enabled.private": "bool",
  "browser.search.openintab": "bool",
  "browser.search.separatePrivateDefault": "bool",
  "browser.search.separatePrivateDefault.ui.enabled": "bool",
  "findbar.highlightAll": "bool",
  // AI
  "browser.ai.control.default": "string",
  "browser.ml.chat.enabled": "bool",
  "browser.translations.enable": "bool",
  // privacy
  "browser.contentblocking.category": "string",
  "dom.security.https_only_mode": "bool",
  "privacy.globalprivacycontrol.enabled": "bool",
  "privacy.resistFingerprinting": "bool",
  "privacy.resistFingerprinting.letterboxing": "bool",
  "privacy.fingerprintingProtection": "bool",
  "network.trr.mode": "int",
  "network.trr.uri": "string",
  "network.trr.custom_uri": "string",
  "privacy.sanitize.sanitizeOnShutdown": "bool",
  "privacy.clearOnShutdown_v2.cookiesAndStorage": "bool",
  "privacy.clearOnShutdown_v2.historyFormDataAndDownloads": "bool",
  "privacy.clearOnShutdown_v2.cache": "bool",
  "media.peerconnection.enabled": "bool",
  "media.peerconnection.ice.default_address_only": "bool",
  "webgl.disabled": "bool",
  "geo.enabled": "bool",
  "network.captive-portal-service.enabled": "bool",
  "network.connectivity-service.enabled": "bool",
  "browser.safebrowsing.malware.enabled": "bool",
  "browser.safebrowsing.phishing.enabled": "bool",
  "network.http.referer.XOriginTrimmingPolicy": "int",
  "signon.rememberSignons": "bool",
  "browser.formfill.enable": "bool",
  "extensions.formautofill.addresses.enabled": "bool",
  "extensions.formautofill.creditCards.enabled": "bool",
};

// --------------------------------------------------------- privacy levels
export const DOH_PROVIDERS = {
  quad9:      { name: "Quad9 (Switzerland, malware blocking)", uri: "https://dns.quad9.net/dns-query" },
  mullvad:    { name: "Mullvad (no logs)",                      uri: "https://dns.mullvad.net/dns-query" },
  mullvadAds: { name: "Mullvad + ad/tracker blocking",          uri: "https://adblock.dns.mullvad.net/dns-query" },
  cloudflare: { name: "Cloudflare (fast)",                      uri: "https://mozilla.cloudflare-dns.com/dns-query" },
  nextdns:    { name: "NextDNS (custom filtering)",             uri: "https://firefox.dns.nextdns.io/" },
};

export const PRIVACY_LEVELS = {
  balanced: {
    name: "Balanced",
    blurb: "Ignifox defaults. Strict tracking protection, HTTPS-only, no telemetry, nothing breaks.",
    prefs: {
      "browser.contentblocking.category": "strict",
      "dom.security.https_only_mode": true,
      "privacy.globalprivacycontrol.enabled": true,
      "privacy.resistFingerprinting": false,
      "privacy.resistFingerprinting.letterboxing": false,
      "privacy.fingerprintingProtection": false,
      "network.trr.mode": 0,
      "privacy.sanitize.sanitizeOnShutdown": false,
      "media.peerconnection.enabled": true,
      "media.peerconnection.ice.default_address_only": true,
      "webgl.disabled": false,
      "geo.enabled": true,
      "network.captive-portal-service.enabled": true,
      "network.connectivity-service.enabled": true,
      "network.http.referer.XOriginTrimmingPolicy": 2,
      "browser.search.suggest.enabled": true,
    },
  },
  hardened: {
    name: "Hardened",
    blurb: "Encrypted DNS (Quad9), fingerprinting protection, no search suggestions or connectivity pings.",
    prefs: {
      "browser.contentblocking.category": "strict",
      "dom.security.https_only_mode": true,
      "privacy.globalprivacycontrol.enabled": true,
      "privacy.resistFingerprinting": false,
      "privacy.resistFingerprinting.letterboxing": false,
      "privacy.fingerprintingProtection": true,
      "network.trr.mode": 2,
      "network.trr.uri": "https://dns.quad9.net/dns-query",
      "privacy.sanitize.sanitizeOnShutdown": false,
      "media.peerconnection.enabled": true,
      "media.peerconnection.ice.default_address_only": true,
      "webgl.disabled": false,
      "geo.enabled": true,
      "network.captive-portal-service.enabled": false,
      "network.connectivity-service.enabled": false,
      "network.http.referer.XOriginTrimmingPolicy": 2,
      "browser.search.suggest.enabled": false,
    },
  },
  fortress: {
    name: "Fortress",
    blurb: "Tor-style fingerprint resistance, DoH-only DNS, wipe cookies & history on exit, WebRTC/WebGL/geolocation off. Some sites will break.",
    prefs: {
      "browser.contentblocking.category": "strict",
      "dom.security.https_only_mode": true,
      "privacy.globalprivacycontrol.enabled": true,
      "privacy.resistFingerprinting": true,
      "privacy.resistFingerprinting.letterboxing": true,
      "privacy.fingerprintingProtection": true,
      "network.trr.mode": 3,
      "network.trr.uri": "https://dns.mullvad.net/dns-query",
      "privacy.sanitize.sanitizeOnShutdown": true,
      "privacy.clearOnShutdown_v2.cookiesAndStorage": true,
      "privacy.clearOnShutdown_v2.historyFormDataAndDownloads": true,
      "privacy.clearOnShutdown_v2.cache": true,
      "media.peerconnection.enabled": false,
      "media.peerconnection.ice.default_address_only": true,
      "webgl.disabled": true,
      "geo.enabled": false,
      "network.captive-portal-service.enabled": false,
      "network.connectivity-service.enabled": false,
      "network.http.referer.XOriginTrimmingPolicy": 2,
      "browser.search.suggest.enabled": false,
    },
  },
};

// The prefs ignifox.cfg locks. Studio shows these as a live "proof" panel.
export const TELEMETRY_LOCKS = [
  ["toolkit.telemetry.enabled", false],
  ["toolkit.telemetry.unified", false],
  ["toolkit.telemetry.archive.enabled", false],
  ["datareporting.healthreport.uploadEnabled", false],
  ["datareporting.policy.dataSubmissionEnabled", false],
  ["datareporting.usage.uploadEnabled", false],
  ["app.shield.optoutstudies.enabled", false],
  ["app.normandy.enabled", false],
  ["nimbus.rollouts.enabled", false],
  ["browser.newtabpage.activity-stream.telemetry", false],
  ["dom.private-attribution.submission.enabled", false],
  ["browser.tabs.crashReporting.sendReport", false],
];

// ---------------------------------------------------------------- helpers
export function readPref(prefs, key, type) {
  try {
    switch (type) {
      case "bool": return prefs.getBoolPref(key);
      case "int": return prefs.getIntPref(key);
      default: return prefs.getStringPref(key);
    }
  } catch (e) {
    return undefined;
  }
}

export function writePref(prefs, key, type, value) {
  if (prefs.prefIsLocked(key)) {
    return false;
  }
  switch (type) {
    case "bool": prefs.setBoolPref(key, !!value); break;
    case "int": prefs.setIntPref(key, Math.round(Number(value)) || 0); break;
    default: prefs.setStringPref(key, String(value));
  }
  return true;
}

export function typeOf(key) {
  return IGNI_PREFS[key]?.type ?? NATIVE_PREFS[key];
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function isHex(c) {
  return typeof c == "string" && HEX.test(c);
}

export function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length == 3) {
    h = [...h].map(c => c + c).join("");
  }
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(a, b, t) {
  const p = x => {
    let h = x.replace("#", "");
    if (h.length == 3) {
      h = [...h].map(c => c + c).join("");
    }
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  };
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export const PALETTE_KEYS = ["bg", "bg2", "bg3", "fg", "fgDim", "accent", "accent2"];
export const PALETTE_LABELS = {
  bg: "Tab strip & frame",
  bg2: "Toolbar & selected tab",
  bg3: "URL bar & fields",
  fg: "Text & icons",
  fgDim: "Inactive text",
  accent: "Accent",
  accent2: "Accent glow",
};

function parseJSON(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v && typeof v == "object" ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

/** Fill in any missing/invalid colors of a partial palette from bg/fg/accent. */
export function completePalette(p = {}, name = "Custom") {
  const bg = isHex(p.bg) ? p.bg : "#101014";
  const fg = isHex(p.fg) ? p.fg : (luminance(bg) < 0.4 ? "#ececf1" : "#18202b");
  const accent = isHex(p.accent) ? p.accent : "#ff3b1f";
  return {
    name,
    bg,
    bg2: isHex(p.bg2) ? p.bg2 : mix(bg, fg, 0.05),
    bg3: isHex(p.bg3) ? p.bg3 : mix(bg, fg, 0.11),
    fg,
    fgDim: isHex(p.fgDim) ? p.fgDim : mix(fg, bg, 0.4),
    accent,
    accent2: isHex(p.accent2) ? p.accent2 : mix(accent, "#ffffff", 0.35),
    dark: luminance(bg) < 0.4,
  };
}

export function savedThemes(values) {
  return parseJSON(values["ignifox.theme.saved"] || "{}", {});
}

/** Compact share code for a palette: "igni:bg,bg2,bg3,fg,fgDim,accent,accent2" */
export function paletteToCode(p) {
  return "igni:" + PALETTE_KEYS.map(k => (p[k] || "").replace("#", "")).join(",");
}
export function codeToPalette(code) {
  const m = /^igni:([0-9a-f,]+)$/i.exec(String(code).trim());
  if (!m) {
    return null;
  }
  const parts = m[1].split(",");
  if (parts.length != PALETTE_KEYS.length) {
    return null;
  }
  const p = {};
  PALETTE_KEYS.forEach((k, i) => (p[k] = "#" + parts[i]));
  return PALETTE_KEYS.every(k => isHex(p[k])) ? completePalette(p) : null;
}

/** Resolve the palette that should be painted, from ignifox.* pref values. */
export function resolvePalette(values) {
  const preset = values["ignifox.theme.preset"] || "ignis";
  let pal;
  if (preset == "custom") {
    pal = completePalette(parseJSON(values["ignifox.theme.custom"] || "{}", {}), "Custom");
  } else if (preset.startsWith("user:")) {
    const name = preset.slice(5);
    const saved = savedThemes(values)[name];
    pal = saved ? completePalette(saved, name) : { ...THEMES.ignis };
  } else {
    pal = { ...(THEMES[preset] || THEMES.ignis) };
  }
  const acc = values["ignifox.theme.accent"];
  if (isHex(acc) && preset != "custom" && !preset.startsWith("user:")) {
    pal.accent = acc;
    pal.accent2 = mix(acc, "#ffffff", 0.35);
  }
  return pal;
}

// --------------------------------------------------------- placement
// Toolbar areas Studio can move buttons between (CustomizableUI area ids).
export const AREAS = {
  "nav-bar": "Navigation bar",
  "TabsToolbar": "Tab strip",
  "PersonalToolbar": "Bookmarks bar",
  "widget-overflow-fixed-list": "Overflow menu »",
  "": "Hidden",
};

// Common buttons, with friendly names. Anything else already placed is listed too.
export const WIDGETS = {
  "back-button": "Back",
  "forward-button": "Forward",
  "stop-reload-button": "Reload / Stop",
  "home-button": "Home",
  "urlbar-container": "Address bar",
  "vertical-spacer": "Spacer",
  "downloads-button": "Downloads",
  "unified-extensions-button": "Extensions",
  "fxa-toolbar-menu-button": "Account & Sync",
  "sidebar-button": "Sidebar",
  "igni-studio-button": "Ignifox Studio",
  "alltabs-button": "List all tabs",
  "firefox-view-button": "Tab overview",
  "bookmarks-menu-button": "Bookmarks menu",
  "history-panelmenu": "History",
  "library-button": "Library",
  "new-window-button": "New window",
  "privatebrowsing-button": "Private window",
  "print-button": "Print",
  "fullscreen-button": "Full screen",
  "screenshot-button": "Screenshot",
  "developer-button": "Developer tools",
  "panic-button": "Forget (clear recent)",
  "save-page-button": "Save page",
  "find-button": "Find in page",
  "zoom-controls": "Zoom",
  "characterencoding-button": "Text encoding",
  "email-link-button": "Email link",
  "search-container": "Separate search bar",
};

// One-click toolbar arrangements. Each lists nav-bar order; listed-but-unknown ids are skipped.
export const TOOLBAR_PRESETS = {
  classic: {
    name: "Classic",
    blurb: "Back, forward, reload, address bar, downloads, extensions, account.",
    navbar: ["back-button", "forward-button", "stop-reload-button", "home-button", "urlbar-container",
             "downloads-button", "igni-studio-button", "unified-extensions-button", "fxa-toolbar-menu-button"],
  },
  minimal: {
    name: "Minimal",
    blurb: "Just the address bar and extensions. Everything else lives in menus and shortcuts.",
    navbar: ["urlbar-container", "unified-extensions-button"],
  },
  power: {
    name: "Power",
    blurb: "Sidebar, navigation, address bar, downloads, screenshot, dev tools, Studio.",
    navbar: ["sidebar-button", "back-button", "forward-button", "stop-reload-button", "urlbar-container",
             "downloads-button", "screenshot-button", "developer-button", "igni-studio-button",
             "unified-extensions-button"],
  },
};

// ---------------------------------------------------------- versions
export const RELEASES_API = "https://api.github.com/repos/rxvy-dev/ignifox/releases/latest";
export const RELEASES_PAGE = "https://github.com/rxvy-dev/ignifox/releases/latest";

/** Parse "160.0.1-2" / "v160.0.1-2" -> { ff: [160,0,1], rel: 2 } */
export function parseVersion(v) {
  const m = /^v?(\d+(?:\.\d+)*)(?:-(\d+))?/.exec(String(v || "").trim());
  if (!m) {
    return null;
  }
  return { ff: m[1].split(".").map(Number), rel: Number(m[2] || 0) };
}

/** <0 if a older than b, 0 equal, >0 newer. Unparseable versions sort oldest. */
export function compareVersions(a, b) {
  const A = parseVersion(a), B = parseVersion(b);
  if (!A || !B) {
    return (A ? 1 : 0) - (B ? 1 : 0);
  }
  const n = Math.max(A.ff.length, B.ff.length);
  for (let i = 0; i < n; i++) {
    const d = (A.ff[i] || 0) - (B.ff[i] || 0);
    if (d) {
      return d;
    }
  }
  return A.rel - B.rel;
}

// ------------------------------------------------------------- new tab
export const DEFAULT_LINKS = [
  { title: "GitHub", url: "https://github.com" },
  { title: "YouTube", url: "https://www.youtube.com" },
  { title: "Reddit", url: "https://www.reddit.com" },
  { title: "Wikipedia", url: "https://en.wikipedia.org" },
  { title: "Arch Wiki", url: "https://wiki.archlinux.org" },
  { title: "Hacker News", url: "https://news.ycombinator.com" },
];

export const WALLPAPERS = {
  embers: "Rising embers (animated)",
  aurora: "Aurora glow (animated)",
  gradient: "Theme gradient",
  solid: "Solid theme color",
  image: "My own picture",
  none: "Plain",
};

export function newtabLinks(values) {
  const raw = values["ignifox.newtab.links"];
  if (!raw) {
    return DEFAULT_LINKS.map(l => ({ ...l }));
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter(l => l && typeof l.url == "string" && /^https?:\/\//i.test(l.url))
          .map(l => ({ title: String(l.title || "").slice(0, 40), url: l.url.slice(0, 2000) }))
      : [];
  } catch (e) {
    return DEFAULT_LINKS.map(l => ({ ...l }));
  }
}

// ------------------------------------------------------------- search
// One-click engines. url uses {searchTerms}; suggestUrl optional.
export const POPULAR_ENGINES = [
  { group: "Private search", name: "DuckDuckGo", url: "https://duckduckgo.com/?q={searchTerms}", alias: "@ddg", suggestUrl: "https://duckduckgo.com/ac/?q={searchTerms}&type=list" },
  { group: "Private search", name: "Startpage", url: "https://www.startpage.com/sp/search?query={searchTerms}", alias: "@sp" },
  { group: "Private search", name: "Brave Search", url: "https://search.brave.com/search?q={searchTerms}", alias: "@brave", suggestUrl: "https://search.brave.com/api/suggest?q={searchTerms}" },
  { group: "Private search", name: "Mojeek", url: "https://www.mojeek.com/search?q={searchTerms}", alias: "@mj" },
  { group: "Private search", name: "Qwant", url: "https://www.qwant.com/?q={searchTerms}", alias: "@qw" },
  { group: "Private search", name: "Kagi", url: "https://kagi.com/search?q={searchTerms}", alias: "@kagi" },
  { group: "Private search", name: "Ecosia", url: "https://www.ecosia.org/search?q={searchTerms}", alias: "@eco" },
  { group: "Big search", name: "Google", url: "https://www.google.com/search?q={searchTerms}", alias: "@g", suggestUrl: "https://www.google.com/complete/search?client=firefox&q={searchTerms}" },
  { group: "Big search", name: "Bing", url: "https://www.bing.com/search?q={searchTerms}", alias: "@b" },
  { group: "Linux", name: "Arch Wiki", url: "https://wiki.archlinux.org/index.php?search={searchTerms}", alias: "@aw" },
  { group: "Linux", name: "AUR", url: "https://aur.archlinux.org/packages?K={searchTerms}", alias: "@aur" },
  { group: "Linux", name: "Arch packages", url: "https://archlinux.org/packages/?q={searchTerms}", alias: "@pac" },
  { group: "Linux", name: "Void packages", url: "https://voidlinux.org/packages/?arch=x86_64&q={searchTerms}", alias: "@void" },
  { group: "Linux", name: "Flathub", url: "https://flathub.org/apps/search?q={searchTerms}", alias: "@fh" },
  { group: "Linux", name: "ProtonDB", url: "https://www.protondb.com/search?q={searchTerms}", alias: "@pdb" },
  { group: "Code", name: "GitHub", url: "https://github.com/search?q={searchTerms}", alias: "@gh" },
  { group: "Code", name: "MDN", url: "https://developer.mozilla.org/search?q={searchTerms}", alias: "@mdn" },
  { group: "Code", name: "Stack Overflow", url: "https://stackoverflow.com/search?q={searchTerms}", alias: "@so" },
  { group: "Code", name: "docs.rs", url: "https://docs.rs/releases/search?query={searchTerms}", alias: "@rs" },
  { group: "Code", name: "npm", url: "https://www.npmjs.com/search?q={searchTerms}", alias: "@npm" },
  { group: "Code", name: "PyPI", url: "https://pypi.org/search/?q={searchTerms}", alias: "@pypi" },
  { group: "Everything else", name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}", alias: "@wiki" },
  { group: "Everything else", name: "YouTube", url: "https://www.youtube.com/results?search_query={searchTerms}", alias: "@yt" },
  { group: "Everything else", name: "Reddit", url: "https://www.reddit.com/search/?q={searchTerms}", alias: "@r" },
  { group: "Everything else", name: "OpenStreetMap", url: "https://www.openstreetmap.org/search?query={searchTerms}", alias: "@map" },
];

/** "https://x.com/?q=%s" -> "https://x.com/?q={searchTerms}"; null if unusable */
export function normalizeEngineURL(url) {
  let u = String(url || "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(u)) {
    return null;
  }
  u = u.replace(/%s/g, "{searchTerms}");
  return u.includes("{searchTerms}") ? u : null;
}

export function normalizeAlias(a) {
  const s = String(a || "").trim().replace(/\s+/g, "");
  if (!s) {
    return "";
  }
  return s.startsWith("@") ? s : "@" + s;
}
