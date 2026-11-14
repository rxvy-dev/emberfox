/* Emberfox — Ember Studio engine.
 *
 * Loaded once, very early, by emberfox.cfg (privileged autoconfig).
 *  - registers default ember.* prefs
 *  - registers about:ember (the Studio page)
 *  - paints every browser window from ember.* prefs, live, no restart
 *  - adds the Studio toolbar button, Tools-menu item and shortcuts
 *  - loads <profile>/chrome/ember-custom.css written by Studio's CSS editor
 */

import {
  EMBER_PREFS,
  PAINTABLE_THEME_IDS,
  RELEASES_API,
  RELEASES_PAGE,
  compareVersions,
  newtabLinks,
  readPref,
  resolvePalette,
} from "chrome://ember/content/prefs.sys.mjs";

const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const BROWSER_URL = "chrome://browser/content/browser.xhtml";
const UI_SHEET = "chrome://ember/content/ui.css";
const STUDIO_URL = "chrome://ember/content/studio.html";
const ABOUT_CID = Components.ID("{6f1b8c7e-3d2a-4e9b-9b8e-1e3b0e000001}");
const WIDGET_ID = "ember-studio-button";
const UPDATE_INTERVAL = 24 * 60 * 60; // seconds between automatic checks
const UPDATE_DELAY_MS = 90 * 1000; // wait after startup so it never slows launch
const NEWTAB_FILES = ["index.html", "newtab.css", "newtab.js", "logo.svg", "MetalMania-Regular.ttf"];
const TOPSITES_REFRESH_MS = 15 * 60 * 1000;

let gChromeHandle = null; // keeps chrome://ember/ registered for the app's lifetime
const gCustomSheets = new WeakMap(); // window -> loaded custom css url

function log(...args) {
  console.log("[Emberfox]", ...args);
}

// ------------------------------------------------------------ about:ember
class AboutEmber {
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
  const contract = "@mozilla.org/network/protocol/about;1?what=ember";
  if (registrar.isContractIDRegistered(contract)) {
    return;
  }
  const instance = new AboutEmber();
  const factory = {
    createInstance(iid) {
      return instance.QueryInterface(iid);
    },
    QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
  };
  registrar.registerFactory(ABOUT_CID, "about:ember (Ember Studio)", contract, factory);
}

// ----------------------------------------------------------------- prefs
function setDefaults() {
  const d = Services.prefs.getDefaultBranch("");
  for (const [key, spec] of Object.entries(EMBER_PREFS)) {
    try {
      if (spec.type == "bool") d.setBoolPref(key, spec.def);
      else if (spec.type == "int") d.setIntPref(key, spec.def);
      else d.setStringPref(key, spec.def);
    } catch (e) {
      log("default failed", key, e);
    }
  }
}

function emberValues() {
  const out = {};
  for (const [key, spec] of Object.entries(EMBER_PREFS)) {
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
export const EmberBoot = {
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
      log("about:ember registration failed", e);
    }

    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "browser-search-engine-modified");
    Services.prefs.addObserver("ember.", this);
    Services.prefs.addObserver("extensions.activeThemeID", this);
    this.syncNativeLayout();
  },

  observe(subject, topic, data) {
    if (topic == "browser-delayed-startup-finished") {
      this.setupWindow(subject);
    } else if (topic == "browser-search-engine-modified") {
      this.queueNewtabConfig();
    } else if (topic == "nsPref:changed") {
      if (data.startsWith("ember.newtab.") || data.startsWith("ember.theme.") || data == "ember.shape.radius") {
        this.queueNewtabConfig();
      }
      if (data == "ember.newtab.enabled" || data == "ember.newtab.home") {
        this.applyNewtab();
      }
      if (data == "ember.layout.tabs") {
        this.syncNativeLayout();
      }
      if (data == "ember.customcss.rev" || data == "ember.customcss.enabled") {
        browserWindows().forEach(w => this.loadCustomCSS(w));
      }
      browserWindows().forEach(w => this.paint(w));
    }
  },

  /** Vertical tabs are Firefox-native; keep them in sync with ember.layout.tabs. */
  syncNativeLayout() {
    const mode = readPref(Services.prefs, "ember.layout.tabs", "string") || "top";
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
    if (win.location.href != BROWSER_URL || win._emberReady) {
      return;
    }
    win._emberReady = true;
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
    this.loadCustomCSS(win);
    this.ensureWidget();
    this.addMenuAndKeys(win);

    // Re-evaluate theme painting when the window's theme changes.
    const mo = new win.MutationObserver(() => this.paint(win));
    mo.observe(win.document.documentElement, { attributes: true, attributeFilter: ["lwtheme"] });
    win.addEventListener("unload", () => mo.disconnect(), { once: true });
  },

  /** Push ember.* prefs onto a window as root attributes + CSS variables. */
  paint(win) {
    const doc = win.document;
    const root = doc.documentElement;
    const v = emberValues();
    const toggle = (attr, on) => (on ? root.setAttribute(attr, "true") : root.removeAttribute(attr));

    // ---- theme
    const themeID = readPref(Services.prefs, "extensions.activeThemeID", "string") || "";
    const addonTheme = themeID && !PAINTABLE_THEME_IDS.has(themeID);
    const themed = v["ember.theme.enabled"] && !(addonTheme && v["ember.theme.respectAddonThemes"]);
    const pal = resolvePalette(v);
    toggle("ember-themed", themed);
    toggle("ember-dark", themed && pal.dark);
    toggle("ember-light", themed && !pal.dark);
    toggle("ember-contentbg", themed && v["ember.theme.contentBg"]);
    const css = root.style;
    const vars = {
      "--ember-bg": pal.bg,
      "--ember-bg-2": pal.bg2,
      "--ember-bg-3": pal.bg3,
      "--ember-fg": pal.fg,
      "--ember-fg-dim": pal.fgDim,
      "--ember-accent": pal.accent,
      "--ember-accent-2": pal.accent2,
      "--ember-radius": `${v["ember.shape.radius"]}px`,
      "--ember-tab-max": `${v["ember.shape.tabMaxWidth"]}px`,
    };
    for (const [k, val] of Object.entries(vars)) {
      css.setProperty(k, val);
    }

    // ---- effects
    toggle("ember-glow", v["ember.fx.glow"]);
    toggle("ember-strip", v["ember.fx.emberStrip"]);
    toggle("ember-progress", v["ember.fx.progressBar"]);

    // ---- layout
    const tabs = v["ember.layout.tabs"];
    root.setAttribute("ember-tabs", ["top", "bottom", "vertical", "hidden"].includes(tabs) ? tabs : "top");
    toggle("ember-autohide", v["ember.layout.autohide"]);
    toggle("ember-urlbar-centered", v["ember.layout.urlbarCentered"]);
    toggle("ember-tabclose-hover", v["ember.layout.tabCloseHover"]);
    toggle("ember-compact-nav", v["ember.layout.compactNavbar"]);

    // ---- tabs & window
    const tstyle = v["ember.tabs.style"];
    if (["pill", "underline", "boxy"].includes(tstyle)) root.setAttribute("ember-tabstyle", tstyle);
    else root.removeAttribute("ember-tabstyle");
    const th = v["ember.tabs.height"];
    toggle("ember-tabheight", th >= 20);
    css.setProperty("--ember-tab-height", `${th}px`);
    toggle("ember-floating", v["ember.layout.floatingContent"]);
    css.setProperty("--ember-gap", `${v["ember.layout.contentGap"]}px`);
    const uw = v["ember.layout.urlbarMaxWidth"];
    toggle("ember-urlbar-max", uw >= 300);
    css.setProperty("--ember-urlbar-max", `${uw}px`);
    toggle("ember-bm-icons", v["ember.layout.bookmarksIconsOnly"]);
    toggle("ember-compact-menus", v["ember.layout.compactMenus"]);

    // ---- hide elements
    toggle("ember-hide-newtab", v["ember.hide.newTabButton"]);
    toggle("ember-hide-alltabs", v["ember.hide.allTabsButton"]);
    toggle("ember-hide-urlbar-icons", v["ember.hide.urlbarIcons"]);
    toggle("ember-hide-extensions", v["ember.hide.extensionsButton"]);
    toggle("ember-hide-navdisabled", v["ember.hide.disabledNavButtons"]);
    toggle("ember-hide-tabicons", v["ember.hide.tabIcons"]);

    // ---- typography
    const fam = (v["ember.font.family"] || "").trim();
    if (fam) {
      css.setProperty("--ember-font", fam.replace(/[;{}]/g, ""));
      root.setAttribute("ember-font", "true");
    } else {
      root.removeAttribute("ember-font");
    }
    const size = v["ember.font.size"];
    if (size >= 9) {
      css.setProperty("--ember-font-size", `${size}px`);
      root.setAttribute("ember-font-size", "true");
    } else {
      root.removeAttribute("ember-font-size");
    }
  },

  customCSSPath() {
    return PathUtils.join(PathUtils.profileDir, "chrome", "ember-custom.css");
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
    if (!readPref(Services.prefs, "ember.customcss.enabled", "bool")) {
      return;
    }
    const path = this.customCSSPath();
    if (!(await IOUtils.exists(path))) {
      return;
    }
    const rev = readPref(Services.prefs, "ember.customcss.rev", "int") || 0;
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
      label: "Ember Studio",
      tooltiptext: "Ember Studio — customize Emberfox (Ctrl+Alt+E)",
      defaultArea: CUI.AREA_NAVBAR,
      onCreated(node) {
        node.setAttribute("image", "chrome://ember/content/icons/studio.svg");
      },
      onCommand(event) {
        EmberBoot.openStudio(event.target.ownerGlobal);
      },
    });
  },

  openStudio(win, hash = "") {
    win = win || Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return;
    }
    const url = "about:ember" + (hash ? "#" + hash : "");
    // Reuse an open Studio tab.
    for (const tab of win.gBrowser.tabs) {
      if (tab.linkedBrowser.currentURI?.spec.startsWith("about:ember")) {
        win.gBrowser.selectedTab = tab;
        return;
      }
    }
    win.openTrustedLinkIn(url, "tab");
  },

  addMenuAndKeys(win) {
    const doc = win.document;

    // Tools > Ember Studio
    const tools = doc.getElementById("menu_ToolsPopup");
    if (tools && !doc.getElementById("ember-menu-studio")) {
      const mi = doc.createXULElement("menuitem");
      mi.id = "ember-menu-studio";
      mi.setAttribute("label", "Ember Studio");
      mi.setAttribute("accesskey", "E");
      mi.setAttribute("key", "ember-key-studio");
      mi.addEventListener("command", () => this.openStudio(win));
      const anchor = doc.getElementById("menu_openAddons");
      tools.insertBefore(mi, anchor ? anchor.nextSibling : tools.firstChild);
    }

    // Shortcuts: Ctrl+Alt+E = Studio, Ctrl+Alt+Z = focus mode
    if (!doc.getElementById("ember-keyset")) {
      const keyset = doc.createXULElement("keyset");
      keyset.id = "ember-keyset";
      const mk = (id, key, fn) => {
        const k = doc.createXULElement("key");
        k.id = id;
        k.setAttribute("key", key);
        k.setAttribute("modifiers", "accel,alt");
        k.addEventListener("command", fn);
        keyset.appendChild(k);
      };
      mk("ember-key-studio", "E", () => this.openStudio(win));
      mk("ember-key-focus", "Z", () => {
        const cur = readPref(Services.prefs, "ember.layout.autohide", "bool");
        Services.prefs.setBoolPref("ember.layout.autohide", !cur);
      });
      doc.documentElement.appendChild(keyset);
    }
  },

  // ------------------------------------------------------------ new tab
  // The Ember New Tab is an ordinary unprivileged file:// page living in the
  // profile (<profile>/ember-newtab/). It can't touch the browser; the engine
  // writes its settings into config.js beside it whenever they change.

  newtabDir() {
    return PathUtils.join(PathUtils.profileDir, "ember-newtab");
  },

  newtabURL() {
    return PathUtils.toFileURI(PathUtils.join(this.newtabDir(), "index.html"));
  },

  async setupNewtab() {
    const dir = this.newtabDir();
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    const gre = Services.dirsvc.get("GreD", Ci.nsIFile).path;
    const src = PathUtils.join(gre, "ember", "content", "newtab");
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
      if (readPref(Services.prefs, "ember.newtab.topSites", "bool")) {
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
    const on = readPref(Services.prefs, "ember.newtab.enabled", "bool");
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
    const home = on && readPref(Services.prefs, "ember.newtab.home", "bool");
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
      const SENT = "EMBERQUERYTERMS";
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
    const v = emberValues();
    const pal = resolvePalette(v);
    const { engine, engines } = await this.searchEnginesForNewtab();
    let links = newtabLinks(v);
    if (v["ember.newtab.topSites"]) {
      const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
      const have = new Set(links.map(l => host(l.url)));
      for (const s of await this.topSites(16)) {
        if (!have.has(host(s.url))) {
          have.add(host(s.url));
          links.push({ title: s.title || host(s.url), url: s.url });
        }
      }
    }
    links = links.slice(0, Math.max(3, v["ember.newtab.columns"]) * 3);
    const dir = this.newtabDir();
    let wallpaperFile = v["ember.newtab.wallpaperFile"];
    if (wallpaperFile && !(await IOUtils.exists(PathUtils.join(dir, wallpaperFile)))) {
      wallpaperFile = "";
    }
    const cfg = {
      palette: { bg: pal.bg, bg2: pal.bg2, bg3: pal.bg3, fg: pal.fg, fgDim: pal.fgDim, accent: pal.accent, accent2: pal.accent2, dark: pal.dark },
      radius: v["ember.shape.radius"],
      layout: v["ember.newtab.layout"],
      wallpaper: v["ember.newtab.wallpaper"],
      wallpaperFile,
      dim: v["ember.newtab.dim"],
      blur: v["ember.newtab.blur"],
      clock: v["ember.newtab.clock"],
      clock24: v["ember.newtab.clock24"],
      seconds: v["ember.newtab.seconds"],
      date: v["ember.newtab.date"],
      greeting: v["ember.newtab.greeting"],
      name: String(v["ember.newtab.name"] || "").slice(0, 40),
      search: v["ember.newtab.search"],
      engineSwitcher: v["ember.newtab.engineSwitcher"],
      engine,
      engines,
      links,
      columns: v["ember.newtab.columns"],
      tileStyle: v["ember.newtab.tileStyle"],
      favicons: v["ember.newtab.favicons"],
      notes: v["ember.newtab.notes"],
    };
    const js = `window.EMBER_NEWTAB = ${JSON.stringify(cfg).replace(/</g, "\\u003c")};\n`;
    await IOUtils.writeUTF8(PathUtils.join(dir, "config.js"), js, { tmpPath: PathUtils.join(dir, "config.js.tmp") });
    Services.obs.notifyObservers(null, "ember-newtab-updated");
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
    Services.prefs.setStringPref("ember.newtab.wallpaperFile", name);
    Services.prefs.setStringPref("ember.newtab.wallpaper", "image");
    return name;
  },

  // ------------------------------------------------------------ updates
  _version: null,

  /** Emberfox release, e.g. "160.0.1-1" (written into the install at build time). */
  async version() {
    if (this._version === null) {
      try {
        const gre = Services.dirsvc.get("GreD", Ci.nsIFile).path;
        this._version = (await IOUtils.readUTF8(PathUtils.join(gre, "EMBERFOX_VERSION"))).trim();
      } catch (e) {
        this._version = `${Services.appinfo.version}-0`;
      }
    }
    return this._version;
  },

  /**
   * Ask GitHub's public releases API for the newest Emberfox. No cookies,
   * no identifiers, no custom headers beyond Accept: GitHub sees an IP and
   * a generic Firefox user agent, nothing else. Disabled by ember.update.check.
   * Returns { status: "disabled"|"current"|"available"|"error", latest, current }.
   */
  async checkForUpdate({ manual = false } = {}) {
    const current = await this.version();
    if (!manual) {
      if (!readPref(Services.prefs, "ember.update.check", "bool")) {
        return { status: "disabled", current };
      }
      const last = readPref(Services.prefs, "ember.update.lastCheck", "int") || 0;
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
    Services.prefs.setIntPref("ember.update.lastCheck", Math.floor(Date.now() / 1000));
    if (!latest || compareVersions(latest, current) <= 0) {
      return { status: "current", latest, current };
    }
    const skipped = readPref(Services.prefs, "ember.update.skipVersion", "string");
    if (!manual && skipped == latest) {
      return { status: "available", latest, current };
    }
    this.showUpdateBar(win, latest, current);
    return { status: "available", latest, current };
  },

  showUpdateBar(win, latest, current) {
    const box = win.gNotificationBox;
    if (!box || box.getNotificationWithValue("ember-update")) {
      return;
    }
    box.appendNotification(
      "ember-update",
      {
        label: `Emberfox ${latest} is out (you have ${current}). It includes the latest Firefox security fixes.`,
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
            Services.prefs.setStringPref("ember.update.skipVersion", latest);
          },
        },
      ]
    );
  },

  /** Used by Studio after the CSS editor saves. */
  bumpCustomCSS() {
    const rev = readPref(Services.prefs, "ember.customcss.rev", "int") || 0;
    Services.prefs.setIntPref("ember.customcss.rev", rev + 1);
  },
};
