/* Ignifox — Ignifox Studio engine.
 *
 * Loaded once, very early, by ignifox.cfg (privileged autoconfig).
 *  - registers default ignifox.* prefs
 *  - registers about:ignifox (the Studio page)
 *  - paints every browser window from ignifox.* prefs, live, no restart
 *  - adds the Studio toolbar button, Tools-menu item and shortcuts
 *  - loads <profile>/chrome/igni-custom.css written by Studio's CSS editor
 */

import {
  IGNI_PREFS,
  PAINTABLE_THEME_IDS,
  RELEASES_API,
  RELEASES_PAGE,
  compareVersions,
  newtabLinks,
  readPref,
  resolvePalette,
} from "chrome://ignifox/content/prefs.sys.mjs";
import { menuHideCSS } from "chrome://ignifox/content/data.sys.mjs";

const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const BROWSER_URL = "chrome://browser/content/browser.xhtml";
const UI_SHEET = "chrome://ignifox/content/ui.css";
const STUDIO_URL = "chrome://ignifox/content/studio.html";
const ABOUT_CID = Components.ID("{6f1b8c7e-3d2a-4e9b-9b8e-1e3b0e000001}");
const WIDGET_ID = "igni-studio-button";
const UPDATE_INTERVAL = 24 * 60 * 60; // seconds between automatic checks
const UPDATE_DELAY_MS = 90 * 1000; // wait after startup so it never slows launch
const NEWTAB_FILES = ["index.html", "newtab.css", "newtab.js", "logo.svg", "MetalMania-Regular.ttf"];
const TOPSITES_REFRESH_MS = 15 * 60 * 1000;

let gChromeHandle = null; // keeps chrome://ignifox/ registered for the app's lifetime
const gCustomSheets = new WeakMap(); // window -> loaded custom css url
const gFontSheets = new WeakMap(); // window -> loaded @font-face sheet url
const gDynSheets = new WeakMap(); // window -> generated data: sheet (menu clean-up)

function log(...args) {
  console.log("[Ignifox]", ...args);
}

// ------------------------------------------------------------ about:ignifox
class AboutIgnifox {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  newChannel(uri, loadInfo) {
    const chan = Services.io.newChannelFromURIWithLoadInfo(
      Services.io.newURI(STUDIO_URL),
      loadInfo
    );
    chan.originalURI = uri;
    return chan;
  }

  getURIFlags() {
    return Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI;
  }

  getChromeURI() {
    return Services.io.newURI(STUDIO_URL);
  }
}

function registerAbout() {
  const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  const contract = "@mozilla.org/network/protocol/about;1?what=ignifox";
  if (registrar.isContractIDRegistered(contract)) {
    return;
  }
  const instance = new AboutIgnifox();
  const factory = {
    createInstance(iid) {
      return instance.QueryInterface(iid);
    },
    QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
  };
  registrar.registerFactory(ABOUT_CID, "about:ignifox (Ignifox Studio)", contract, factory);
}

// ----------------------------------------------------------------- prefs
function setDefaults() {
  const d = Services.prefs.getDefaultBranch("");
  for (const [key, spec] of Object.entries(IGNI_PREFS)) {
    try {
      if (spec.type == "bool") d.setBoolPref(key, spec.def);
      else if (spec.type == "int") d.setIntPref(key, spec.def);
      else d.setStringPref(key, spec.def);
    } catch (e) {
      log("default failed", key, e);
    }
  }
}

function igniValues() {
  const out = {};
  for (const [key, spec] of Object.entries(IGNI_PREFS)) {
    out[key] = readPref(Services.prefs, key, spec.type) ?? spec.def;
  }
  return out;
}

function browserWindows() {
  return [...Services.wm.getEnumerator("navigator:browser")].filter(
    w => !w.closed && w.location.href == BROWSER_URL
  );
}

// ---------------------------------------------------------------- engine
export const IgniBoot = {
  _inited: false,
  _widgetMade: false,

  init({ chromeHandle } = {}) {
    if (this._inited) {
      return;
    }
    this._inited = true;
    gChromeHandle = chromeHandle || null;

    setDefaults();
    try {
      registerAbout();
    } catch (e) {
      log("about:ignifox registration failed", e);
    }

    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "browser-search-engine-modified");
    Services.prefs.addObserver("ignifox.", this);
    Services.prefs.addObserver("extensions.activeThemeID", this);
    this.syncNativeLayout();
  },

  observe(subject, topic, data) {
    if (topic == "browser-delayed-startup-finished") {
      this.setupWindow(subject);
    } else if (topic == "browser-search-engine-modified") {
      this.queueNewtabConfig();
    } else if (topic == "nsPref:changed") {
      if (data.startsWith("ignifox.newtab.") || data.startsWith("ignifox.theme.") || data == "ignifox.shape.radius") {
        this.queueNewtabConfig();
      }
      if (data == "ignifox.newtab.enabled" || data == "ignifox.newtab.home") {
        this.applyNewtab();
      }
      if (data == "ignifox.layout.tabs") {
        this.syncNativeLayout();
      }
      if (data == "ignifox.customcss.rev" || data == "ignifox.customcss.enabled") {
        browserWindows().forEach(w => this.loadCustomCSS(w));
      }
      if (data == "ignifox.fonts.rev") {
        browserWindows().forEach(w => this.loadFontsCSS(w));
        this.queueNewtabConfig();
      }
      if (data == "ignifox.menu.hide") {
        browserWindows().forEach(w => this.loadDynamicSheet(w));
      }
      browserWindows().forEach(w => this.paint(w));
    }
  },

  /** Vertical tabs are Firefox-native; keep them in sync with ignifox.layout.tabs. */
  syncNativeLayout() {
    const mode = readPref(Services.prefs, "ignifox.layout.tabs", "string") || "top";
    const wantVertical = mode == "vertical";
    try {
      if (wantVertical && !Services.prefs.getBoolPref("sidebar.revamp", false)) {
        Services.prefs.setBoolPref("sidebar.revamp", true);
      }
      if (Services.prefs.getBoolPref("sidebar.verticalTabs", false) != wantVertical) {
        Services.prefs.setBoolPref("sidebar.verticalTabs", wantVertical);
      }
    } catch (e) {
      log("syncNativeLayout", e);
    }
  },

  setupWindow(win) {
    if (win.location.href != BROWSER_URL || win._igniReady) {
      return;
    }
    win._igniReady = true;
    if (!this._updateScheduled) {
      this._updateScheduled = true;
      setTimeout(() => this.checkForUpdate().catch(e => log("update check", e)), UPDATE_DELAY_MS);
      this.setupNewtab().catch(e => log("new tab setup failed", e));
    }
    try {
      win.windowUtils.loadSheetUsingURIString(UI_SHEET, win.windowUtils.AUTHOR_SHEET);
    } catch (e) {
      log("ui.css failed", e);
    }
    this.paint(win);
    this.loadFontsCSS(win);
    this.loadDynamicSheet(win);
    this.loadCustomCSS(win);
    this.ensureWidget();
    this.addMenuAndKeys(win);

    // Re-evaluate theme painting when the window's theme changes.
    const mo = new win.MutationObserver(() => this.paint(win));
    mo.observe(win.document.documentElement, { attributes: true, attributeFilter: ["lwtheme"] });
    win.addEventListener("unload", () => mo.disconnect(), { once: true });
  },

  /** Push ignifox.* prefs onto a window as root attributes + CSS variables. */
  paint(win) {
    const doc = win.document;
    const root = doc.documentElement;
    const v = igniValues();
    const toggle = (attr, on) => (on ? root.setAttribute(attr, "true") : root.removeAttribute(attr));

    // ---- theme
    const themeID = readPref(Services.prefs, "extensions.activeThemeID", "string") || "";
    const addonTheme = themeID && !PAINTABLE_THEME_IDS.has(themeID);
    const themed = v["ignifox.theme.enabled"] && !(addonTheme && v["ignifox.theme.respectAddonThemes"]);
    const pal = resolvePalette(v);
    toggle("igni-themed", themed);
    toggle("igni-dark", themed && pal.dark);
    toggle("igni-light", themed && !pal.dark);
    toggle("igni-contentbg", themed && v["ignifox.theme.contentBg"]);
    const css = root.style;
    const vars = {
      "--igni-bg": pal.bg,
      "--igni-bg-2": pal.bg2,
      "--igni-bg-3": pal.bg3,
      "--igni-fg": pal.fg,
      "--igni-fg-dim": pal.fgDim,
      "--igni-accent": pal.accent,
      "--igni-accent-2": pal.accent2,
      "--igni-radius": `${v["ignifox.shape.radius"]}px`,
      "--igni-tab-max": `${v["ignifox.shape.tabMaxWidth"]}px`,
    };
    for (const [k, val] of Object.entries(vars)) {
      css.setProperty(k, val);
    }

    // ---- effects
    toggle("igni-glow", v["ignifox.fx.glow"]);
    toggle("igni-strip", v["ignifox.fx.accentStrip"]);
    toggle("igni-progress", v["ignifox.fx.progressBar"]);

    // ---- layout
    const tabs = v["ignifox.layout.tabs"];
    root.setAttribute("igni-tabs", ["top", "bottom", "vertical", "hidden"].includes(tabs) ? tabs : "top");
    toggle("igni-autohide", v["ignifox.layout.autohide"]);
    toggle("igni-urlbar-centered", v["ignifox.layout.urlbarCentered"]);
    toggle("igni-tabclose-hover", v["ignifox.layout.tabCloseHover"]);
    toggle("igni-compact-nav", v["ignifox.layout.compactNavbar"]);

    // ---- tabs & window
    const tstyle = v["ignifox.tabs.style"];
    if (["pill", "underline", "boxy"].includes(tstyle)) root.setAttribute("igni-tabstyle", tstyle);
    else root.removeAttribute("igni-tabstyle");
    const th = v["ignifox.tabs.height"];
    toggle("igni-tabheight", th >= 20);
    css.setProperty("--igni-tab-height", `${th}px`);
    toggle("igni-floating", v["ignifox.layout.floatingContent"]);
    css.setProperty("--igni-gap", `${v["ignifox.layout.contentGap"]}px`);
    const uw = v["ignifox.layout.urlbarMaxWidth"];
    toggle("igni-urlbar-max", uw >= 300);
    css.setProperty("--igni-urlbar-max", `${uw}px`);
    toggle("igni-bm-icons", v["ignifox.layout.bookmarksIconsOnly"]);
    toggle("igni-multirow", v["ignifox.tabs.multirow"]);
    css.setProperty("--igni-max-rows", String(v["ignifox.tabs.maxRows"]));

    // ---- frame background
    const frame = v["ignifox.frame.style"];
    const img = v["ignifox.frame.image"];
    const frameMode = frame == "image" && img ? "image" : frame == "gradient" ? "gradient" : "";
    if (frameMode && themed) root.setAttribute("igni-frame", frameMode);
    else root.removeAttribute("igni-frame");
    if (frameMode == "image") {
      const path = PathUtils.join(PathUtils.profileDir, "chrome", PathUtils.filename(img));
      css.setProperty("--igni-frame-img", `url("${PathUtils.toFileURI(path)}")`);
    }
    css.setProperty("--igni-frame-dim", String(v["ignifox.frame.dim"] / 100));
    toggle("igni-compact-menus", v["ignifox.layout.compactMenus"]);

    // ---- hide elements
    toggle("igni-hide-newtab", v["ignifox.hide.newTabButton"]);
    toggle("igni-hide-alltabs", v["ignifox.hide.allTabsButton"]);
    toggle("igni-hide-urlbar-icons", v["ignifox.hide.urlbarIcons"]);
    toggle("igni-hide-extensions", v["ignifox.hide.extensionsButton"]);
    toggle("igni-hide-navdisabled", v["ignifox.hide.disabledNavButtons"]);
    toggle("igni-hide-tabicons", v["ignifox.hide.tabIcons"]);

    // ---- typography
    const fam = (v["ignifox.font.family"] || "").trim();
    if (fam) {
      css.setProperty("--igni-font", fam.replace(/[;{}]/g, ""));
      root.setAttribute("igni-font", "true");
    } else {
      root.removeAttribute("igni-font");
    }
    const size = v["ignifox.font.size"];
    if (size >= 9) {
      css.setProperty("--igni-font-size", `${size}px`);
      root.setAttribute("igni-font-size", "true");
    } else {
      root.removeAttribute("igni-font-size");
    }
  },

  async loadFontsCSS(win) {
    const wu = win.windowUtils;
    const prev = gFontSheets.get(win);
    if (prev) {
      try { wu.removeSheetUsingURIString(prev, wu.AUTHOR_SHEET); } catch (e) {}
      gFontSheets.delete(win);
    }
    const path = PathUtils.join(PathUtils.profileDir, "chrome", "ignifox-fonts.css");
    if (!(await IOUtils.exists(path))) return;
    const url = `${PathUtils.toFileURI(path)}?rev=${readPref(Services.prefs, "ignifox.fonts.rev", "int") || 0}`;
    try {
      wu.loadSheetUsingURIString(url, wu.AUTHOR_SHEET);
      gFontSheets.set(win, url);
    } catch (e) {
      log("font sheet failed", e);
    }
  },

  /** Generated rules that depend on lists in prefs (right-click menu clean-up). */
  loadDynamicSheet(win) {
    const wu = win.windowUtils;
    const prev = gDynSheets.get(win);
    if (prev) {
      try { wu.removeSheetUsingURIString(prev, wu.AUTHOR_SHEET); } catch (e) {}
      gDynSheets.delete(win);
    }
    const css = menuHideCSS(readPref(Services.prefs, "ignifox.menu.hide", "string"));
    if (!css) return;
    const url = "data:text/css;charset=utf-8," + encodeURIComponent(css);
    try {
      wu.loadSheetUsingURIString(url, wu.AUTHOR_SHEET);
      gDynSheets.set(win, url);
    } catch (e) {
      log("menu sheet failed", e);
    }
  },

  /** Studio hands over a picture for the tab strip background. */
  async setFrameImage(bytes, ext) {
    ext = String(ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const dir = PathUtils.join(PathUtils.profileDir, "chrome");
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    for (const child of await IOUtils.getChildren(dir)) {
      if (/\/ignifox-frame-\d+\.\w+$/.test(child)) await IOUtils.remove(child).catch(() => {});
    }
    const name = `ignifox-frame-${Date.now()}.${ext}`;
    await IOUtils.write(PathUtils.join(dir, name), bytes);
    Services.prefs.setStringPref("ignifox.frame.image", name);
    Services.prefs.setStringPref("ignifox.frame.style", "image");
    return name;
  },

  customCSSPath() {
    return PathUtils.join(PathUtils.profileDir, "chrome", "igni-custom.css");
  },

  async loadCustomCSS(win) {
    const wu = win.windowUtils;
    const prev = gCustomSheets.get(win);
    if (prev) {
      try {
        wu.removeSheetUsingURIString(prev, wu.AUTHOR_SHEET);
      } catch (e) {}
      gCustomSheets.delete(win);
    }
    if (!readPref(Services.prefs, "ignifox.customcss.enabled", "bool")) {
      return;
    }
    const path = this.customCSSPath();
    if (!(await IOUtils.exists(path))) {
      return;
    }
    const rev = readPref(Services.prefs, "ignifox.customcss.rev", "int") || 0;
    const url = `${PathUtils.toFileURI(path)}?rev=${rev}`;
    try {
      wu.loadSheetUsingURIString(url, wu.AUTHOR_SHEET);
      gCustomSheets.set(win, url);
    } catch (e) {
      log("custom css failed to load (syntax error?)", e);
    }
  },

  ensureWidget() {
    if (this._widgetMade) {
      return;
    }
    this._widgetMade = true;
    let CUI;
    try {
      ({ CustomizableUI: CUI } = ChromeUtils.importESModule(
        "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
      ));
    } catch (e) {
      ({ CustomizableUI: CUI } = ChromeUtils.importESModule(
        "resource:///modules/CustomizableUI.sys.mjs"
      ));
    }
    if (CUI.getWidget(WIDGET_ID)?.provider == CUI.PROVIDER_API) {
      return;
    }
    CUI.createWidget({
      id: WIDGET_ID,
      type: "button",
      label: "Ignifox Studio",
      tooltiptext: "Ignifox Studio — customize Ignifox (Ctrl+Alt+I)",
      defaultArea: CUI.AREA_NAVBAR,
      onCreated(node) {
        node.setAttribute("image", "chrome://ignifox/content/icons/studio.svg");
      },
      onCommand(event) {
        IgniBoot.openStudio(event.target.ownerGlobal);
      },
    });
  },

  openStudio(win, hash = "") {
    win = win || Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return;
    }
    const url = "about:ignifox" + (hash ? "#" + hash : "");
    // Reuse an open Studio tab.
    for (const tab of win.gBrowser.tabs) {
      if (tab.linkedBrowser.currentURI?.spec.startsWith("about:ignifox")) {
        win.gBrowser.selectedTab = tab;
        return;
      }
    }
    win.openTrustedLinkIn(url, "tab");
  },

  addMenuAndKeys(win) {
    const doc = win.document;

    // Tools > Ignifox Studio
    const tools = doc.getElementById("menu_ToolsPopup");
    if (tools && !doc.getElementById("igni-menu-studio")) {
      const mi = doc.createXULElement("menuitem");
      mi.id = "igni-menu-studio";
      mi.setAttribute("label", "Ignifox Studio");
      mi.setAttribute("accesskey", "I");
      mi.setAttribute("key", "igni-key-studio");
      mi.addEventListener("command", () => this.openStudio(win));
      const anchor = doc.getElementById("menu_openAddons");
      tools.insertBefore(mi, anchor ? anchor.nextSibling : tools.firstChild);
    }

    // Shortcuts: Ctrl+Alt+I = Studio, Ctrl+Alt+Z = focus mode
    if (!doc.getElementById("igni-keyset")) {
      const keyset = doc.createXULElement("keyset");
      keyset.id = "igni-keyset";
      const mk = (id, key, fn) => {
        const k = doc.createXULElement("key");
        k.id = id;
        k.setAttribute("key", key);
        k.setAttribute("modifiers", "accel,alt");
        k.addEventListener("command", fn);
        keyset.appendChild(k);
      };
      mk("igni-key-studio", "I", () => this.openStudio(win));
      mk("igni-key-focus", "Z", () => {
        const cur = readPref(Services.prefs, "ignifox.layout.autohide", "bool");
        Services.prefs.setBoolPref("ignifox.layout.autohide", !cur);
      });
      doc.documentElement.appendChild(keyset);
    }
  },

  // ------------------------------------------------------------ new tab
  // The Ignifox New Tab is an ordinary unprivileged file:// page living in the
  // profile (<profile>/igni-newtab/). It can't touch the browser; the engine
  // writes its settings into config.js beside it whenever they change.

  newtabDir() {
    return PathUtils.join(PathUtils.profileDir, "igni-newtab");
  },

  newtabURL() {
    return PathUtils.toFileURI(PathUtils.join(this.newtabDir(), "index.html"));
  },

  async setupNewtab() {
    const dir = this.newtabDir();
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    const gre = Services.dirsvc.get("GreD", Ci.nsIFile).path;
    const src = PathUtils.join(gre, "studio", "content", "newtab");
    for (const f of NEWTAB_FILES) {
      try {
        await IOUtils.copy(PathUtils.join(src, f), PathUtils.join(dir, f));
      } catch (e) {
        log("new tab: couldn't copy", f, e);
      }
    }
    await this.writeNewtabConfig();
    this.applyNewtab();
    const refresh = () => {
      if (readPref(Services.prefs, "ignifox.newtab.topSites", "bool")) {
        this.writeNewtabConfig().catch(() => {});
      }
      setTimeout(refresh, TOPSITES_REFRESH_MS);
    };
    setTimeout(refresh, TOPSITES_REFRESH_MS);
    this._newtabReady = true;
  },

  applyNewtab() {
    let AboutNewTab;
    try {
      ({ AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs"));
    } catch (e) {
      log("AboutNewTab unavailable", e);
      return;
    }
    const url = this.newtabURL();
    const on = readPref(Services.prefs, "ignifox.newtab.enabled", "bool");
    if (on) {
      if (AboutNewTab.newTabURL != url) {
        AboutNewTab.newTabURL = url;
      }
    } else if (AboutNewTab.newTabURLOverridden && AboutNewTab.newTabURL == url) {
      AboutNewTab.resetNewTabURL();
    }
    // Home page: change only the *default*, so a home page the user set themselves always wins.
    const d = Services.prefs.getDefaultBranch("");
    if (this._origHome === undefined) {
      this._origHome = readPref(d, "browser.startup.homepage", "string") || "about:home";
    }
    const home = on && readPref(Services.prefs, "ignifox.newtab.home", "bool");
    d.setStringPref("browser.startup.homepage", home ? url : this._origHome);
  },

  queueNewtabConfig() {
    if (!this._newtabReady) {
      return;
    }
    clearTimeout(this._newtabTimer);
    this._newtabTimer = setTimeout(() => this.writeNewtabConfig().catch(e => log("new tab config", e)), 250);
  },

  async searchEnginesForNewtab() {
    const out = { engine: null, engines: [] };
    try {
      await Services.search.init();
      const def = await Services.search.getDefault();
      const SENT = "IGNIFOXQUERYTERMS";
      for (const e of await Services.search.getVisibleEngines()) {
        const sub = e.getSubmission(SENT);
        if (!sub || sub.postData) {
          continue; // POST engines can't be driven from a plain link
        }
        const entry = { name: e.name, alias: e.alias || "", url: sub.uri.spec.replace(SENT, "{searchTerms}") };
        out.engines.push(entry);
        if (def && e.name == def.name) {
          out.engine = entry;
        }
      }
    } catch (e) {
      log("search engines for new tab", e);
    }
    out.engine ||= out.engines[0] || { name: "DuckDuckGo", alias: "@ddg", url: "https://duckduckgo.com/?q={searchTerms}" };
    return out;
  },

  async topSites(n) {
    try {
      const { NewTabUtils } = ChromeUtils.importESModule("resource://gre/modules/NewTabUtils.sys.mjs");
      const sites = await NewTabUtils.activityStreamLinks.getTopSites({ numItems: n, onePerDomain: true });
      return sites.filter(s => /^https?:/i.test(s.url)).map(s => ({ title: s.title || "", url: s.url }));
    } catch (e) {
      log("top sites", e);
      return [];
    }
  },

  async writeNewtabConfig() {
    const v = igniValues();
    const pal = resolvePalette(v);
    const { engine, engines } = await this.searchEnginesForNewtab();
    let links = newtabLinks(v);
    if (v["ignifox.newtab.topSites"]) {
      const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
      const have = new Set(links.map(l => host(l.url)));
      for (const s of await this.topSites(16)) {
        if (!have.has(host(s.url))) {
          have.add(host(s.url));
          links.push({ title: s.title || host(s.url), url: s.url });
        }
      }
    }
    links = links.slice(0, Math.max(3, v["ignifox.newtab.columns"]) * 3);
    const dir = this.newtabDir();
    let wallpaperFile = v["ignifox.newtab.wallpaperFile"];
    if (wallpaperFile && !(await IOUtils.exists(PathUtils.join(dir, wallpaperFile)))) {
      wallpaperFile = "";
    }
    const cfg = {
      palette: { bg: pal.bg, bg2: pal.bg2, bg3: pal.bg3, fg: pal.fg, fgDim: pal.fgDim, accent: pal.accent, accent2: pal.accent2, dark: pal.dark },
      radius: v["ignifox.shape.radius"],
      layout: v["ignifox.newtab.layout"],
      wallpaper: v["ignifox.newtab.wallpaper"],
      wallpaperFile,
      dim: v["ignifox.newtab.dim"],
      blur: v["ignifox.newtab.blur"],
      clock: v["ignifox.newtab.clock"],
      clock24: v["ignifox.newtab.clock24"],
      seconds: v["ignifox.newtab.seconds"],
      date: v["ignifox.newtab.date"],
      greeting: v["ignifox.newtab.greeting"],
      name: String(v["ignifox.newtab.name"] || "").slice(0, 40),
      search: v["ignifox.newtab.search"],
      engineSwitcher: v["ignifox.newtab.engineSwitcher"],
      engine,
      engines,
      links,
      columns: v["ignifox.newtab.columns"],
      tileStyle: v["ignifox.newtab.tileStyle"],
      favicons: v["ignifox.newtab.favicons"],
      notes: v["ignifox.newtab.notes"],
      font: "",
      fontFile: "",
    };
    const ntFont = String(v["ignifox.newtab.font"] || "").trim();
    if (ntFont) {
      cfg.font = ntFont.replace(/["\\;{}]/g, "").slice(0, 80);
      try {
        const { listImported } = ChromeUtils.importESModule("chrome://ignifox/content/fonts.sys.mjs");
        const hit = (await listImported()).find(f => f.family == ntFont);
        if (hit) {
          const name = `ntfont.${hit.ext}`;
          await IOUtils.copy(hit.path, PathUtils.join(dir, name));
          cfg.fontFile = name;
        }
      } catch (e) {
        log("new tab font", e);
      }
    }
    const js = `window.IGNI_NEWTAB = ${JSON.stringify(cfg).replace(/</g, "\\u003c")};\n`;
    await IOUtils.writeUTF8(PathUtils.join(dir, "config.js"), js, { tmpPath: PathUtils.join(dir, "config.js.tmp") });
    Services.obs.notifyObservers(null, "igni-newtab-updated");
  },

  /** Studio hands over a picked image; it's copied next to the page. */
  async setNewtabWallpaper(bytes, ext) {
    ext = String(ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const dir = this.newtabDir();
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    for (const child of await IOUtils.getChildren(dir)) {
      if (/\/wallpaper-\d+\.\w+$/.test(child)) {
        await IOUtils.remove(child).catch(() => {});
      }
    }
    const name = `wallpaper-${Date.now()}.${ext}`;
    await IOUtils.write(PathUtils.join(dir, name), bytes);
    Services.prefs.setStringPref("ignifox.newtab.wallpaperFile", name);
    Services.prefs.setStringPref("ignifox.newtab.wallpaper", "image");
    return name;
  },

  // ------------------------------------------------------------ updates
  _version: null,

  /** Ignifox release, e.g. "160.0.1-1" (written into the install at build time). */
  async version() {
    if (this._version === null) {
      try {
        const gre = Services.dirsvc.get("GreD", Ci.nsIFile).path;
        this._version = (await IOUtils.readUTF8(PathUtils.join(gre, "IGNIFOX_VERSION"))).trim();
      } catch (e) {
        this._version = `${Services.appinfo.version}-0`;
      }
    }
    return this._version;
  },

  /**
   * Ask GitHub's public releases API for the newest Ignifox. No cookies,
   * no identifiers, no custom headers beyond Accept: GitHub sees an IP and
   * a generic Firefox user agent, nothing else. Disabled by ignifox.update.check.
   * Returns { status: "disabled"|"current"|"available"|"error", latest, current }.
   */
  async checkForUpdate({ manual = false } = {}) {
    const current = await this.version();
    if (!manual) {
      if (!readPref(Services.prefs, "ignifox.update.check", "bool")) {
        return { status: "disabled", current };
      }
      const last = readPref(Services.prefs, "ignifox.update.lastCheck", "int") || 0;
      if (Date.now() / 1000 - last < UPDATE_INTERVAL) {
        return { status: "skipped", current };
      }
    }
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return { status: "error", current };
    }
    let latest;
    try {
      const res = await win.fetch(RELEASES_API, {
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      latest = String(data.tag_name || "").replace(/^v/, "");
    } catch (e) {
      log("update check failed", e);
      return { status: "error", current };
    }
    Services.prefs.setIntPref("ignifox.update.lastCheck", Math.floor(Date.now() / 1000));
    if (!latest || compareVersions(latest, current) <= 0) {
      return { status: "current", latest, current };
    }
    const skipped = readPref(Services.prefs, "ignifox.update.skipVersion", "string");
    if (!manual && skipped == latest) {
      return { status: "available", latest, current };
    }
    this.showUpdateBar(win, latest, current);
    return { status: "available", latest, current };
  },

  showUpdateBar(win, latest, current) {
    const box = win.gNotificationBox;
    if (!box || box.getNotificationWithValue("igni-update")) {
      return;
    }
    box.appendNotification(
      "igni-update",
      {
        label: `Ignifox ${latest} is out (you have ${current}). It includes the latest Firefox security fixes.`,
        priority: box.PRIORITY_INFO_HIGH,
      },
      [
        {
          label: "Get it",
          accessKey: "G",
          callback: () => {
            win.openTrustedLinkIn(RELEASES_PAGE, "tab");
          },
        },
        {
          label: "Skip this version",
          accessKey: "S",
          callback: () => {
            Services.prefs.setStringPref("ignifox.update.skipVersion", latest);
          },
        },
      ]
    );
  },

  /** Used by Studio after the CSS editor saves. */
  bumpCustomCSS() {
    const rev = readPref(Services.prefs, "ignifox.customcss.rev", "int") || 0;
    Services.prefs.setIntPref("ignifox.customcss.rev", rev + 1);
  },
};
