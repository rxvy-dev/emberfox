// Fake Firefox privileged APIs so studio.html renders in any browser (design preview only).
(() => {
  const store = new Map(), defaults = new Map(), locked = new Set(), obs = [];
  const D = {
    "browser.uidensity": 0, "browser.toolbars.bookmarks.visibility": "newtab", "browser.tabs.tabMinWidth": 76,
    "layout.css.prefers-color-scheme.content-override": 2, "sidebar.verticalTabs": false, "sidebar.position_start": true,
    "sidebar.visibility": "always-show", "browser.startup.page": 3, "general.smoothScroll": true,
    "mousewheel.default.delta_multiplier_y": 100, "media.autoplay.default": 1, "dom.ipc.processCount": 8,
    "browser.contentblocking.category": "strict", "dom.security.https_only_mode": true, "network.trr.mode": 0,
    "network.trr.uri": "https://dns.quad9.net/dns-query", "browser.ai.control.default": "blocked",
    "privacy.globalprivacycontrol.enabled": true, "media.peerconnection.enabled": true,
    "media.peerconnection.ice.default_address_only": true, "geo.enabled": true,
    "network.captive-portal-service.enabled": true, "network.connectivity-service.enabled": true,
    "network.http.referer.XOriginTrimmingPolicy": 2, "browser.search.suggest.enabled": true,
    "browser.safebrowsing.malware.enabled": true, "browser.safebrowsing.phishing.enabled": true,
    "browser.tabs.closeTabByDblclick": true, "browser.tabs.groups.enabled": true, "browser.tabs.splitView.enabled": true,
    "privacy.resistFingerprinting": false, "privacy.resistFingerprinting.letterboxing": false,
    "privacy.fingerprintingProtection": false, "privacy.sanitize.sanitizeOnShutdown": false, "webgl.disabled": false,
  };
  for (const [k, v] of Object.entries(D)) defaults.set(k, v);
  for (const k of ["toolkit.telemetry.enabled","toolkit.telemetry.unified","toolkit.telemetry.archive.enabled",
    "datareporting.healthreport.uploadEnabled","datareporting.policy.dataSubmissionEnabled","datareporting.usage.uploadEnabled",
    "app.shield.optoutstudies.enabled","app.normandy.enabled","nimbus.rollouts.enabled",
    "browser.newtabpage.activity-stream.telemetry","dom.private-attribution.submission.enabled","browser.tabs.crashReporting.sendReport"]) {
    defaults.set(k, false); locked.add(k);
  }
  const getv = k => { if (store.has(k)) return store.get(k); if (defaults.has(k)) return defaults.get(k); throw new Error("no pref"); };
  const setv = (k, v) => { store.set(k, v); obs.forEach(o => o.observe(null, "nsPref:changed", k)); };
  const prefs = {
    getBoolPref: getv, getIntPref: getv, getStringPref: getv,
    setBoolPref: setv, setIntPref: setv, setStringPref: setv,
    prefIsLocked: k => locked.has(k), prefHasUserValue: k => store.has(k),
    clearUserPref: k => { store.delete(k); obs.forEach(o => o.observe(null, "nsPref:changed", k)); },
    addObserver: (_k, o) => { if (!obs.includes(o)) obs.push(o); }, removeObserver() {},
    getDefaultBranch: () => prefs,
  };
  const file = { append() {}, exists: () => false, create() {}, reveal() {} };
  const placements = { "nav-bar": ["back-button","forward-button","stop-reload-button","urlbar-container","downloads-button","igni-studio-button","unified-extensions-button","fxa-toolbar-menu-button"],
    "TabsToolbar": ["tabbrowser-tabs","alltabs-button"], "PersonalToolbar": ["personal-bookmarks"], "widget-overflow-fixed-list": [] };
  window.Services = {
    prefs, dirsvc: { get: () => ({ ...file }) },
    get search() { return window.__searchMock; },
    get obs() { return window.__obs; },
    appinfo: { version: "160.0", platformVersion: "160.0", appBuildID: "20261104181552", OS: "Linux" },
    sysinfo: { getProperty: () => "x86_64" },
    wm: { getMostRecentWindow: () => ({ gNavToolbox: { palette: {} }, gCustomizeMode: { enter() {} } }) },
  };
  window.Ci = { nsIFile: { DIRECTORY_TYPE: 1 } };
  // search service mock
  const mkEngine = (name, alias, url) => ({ name, alias, url, getIconURL: async () => null,
    getSubmission: q => ({ uri: { spec: url.replace("{searchTerms}", q) }, postData: null }) });
  const engines = [mkEngine("DuckDuckGo", "@ddg", "https://duckduckgo.com/?q={searchTerms}"),
    mkEngine("Startpage", "@sp", "https://www.startpage.com/sp/search?query={searchTerms}"),
    mkEngine("Brave Search", "@brave", "https://search.brave.com/search?q={searchTerms}"),
    mkEngine("Wikipedia (en)", "@wiki", "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}"),
    mkEngine("Arch Wiki", "@aw", "https://wiki.archlinux.org/index.php?search={searchTerms}")];
  let def = engines[0], priv = engines[0];
  const sobs = [];
  const fire = () => sobs.forEach(o => o.observe(null, "browser-search-engine-modified"));
  window.__searchMock = {
    CHANGE_REASON: { USER: "user" },
    init: async () => {}, getVisibleEngines: async () => engines.slice(),
    getDefault: async () => def, getDefaultPrivate: async () => priv,
    setDefault: async e => { def = e; fire(); }, setDefaultPrivate: async e => { priv = e; fire(); },
    addUserEngine: async f => { const e = mkEngine(f.name, f.alias || "", f.url); engines.push(e); fire(); return e; },
    removeEngine: async e => { engines.splice(engines.indexOf(e), 1); fire(); },
  };
  window.__obs = { addObserver: (o, t) => { if (t == "browser-search-engine-modified") sobs.push(o); }, removeObserver() {}, notifyObservers() {} };
  window.PathUtils = { profileDir: "/home/rxvy/.ignifox/ignifox/abcd.default", parent: p => p.replace(/\/[^/]*$/, "") };
  window.IOUtils = { readUTF8: () => Promise.reject(new Error("none")), writeUTF8: async () => {}, makeDirectory: async () => {} };
  const CUI = {
    getWidgetIdsInArea: a => placements[a] || [],
    getUnusedWidgets: () => ["home-button","screenshot-button","developer-button","print-button","sidebar-button"].map(id => ({ id })),
    getPlacementOfWidget: id => { for (const [a, l] of Object.entries(placements)) { const i = l.indexOf(id); if (i >= 0) return { area: a, position: i }; } return null; },
    isWidgetRemovable: id => id != "tabbrowser-tabs", getWidget: id => ({ id, label: id }),
    addListener() {}, removeListener() {}, addWidgetToArea() {}, removeWidgetFromArea() {}, moveWidgetWithinArea() {}, reset() {},
  };
  const importerMock = {
    findProfiles: async () => [
      { browser: "Firefox", name: "default-release", path: "/home/rxvy/.mozilla/firefox/ab12cd34.default-release", isDefault: true, modified: Date.now() - 86400000, hasPlaces: true, hasLogins: true, running: false },
      { browser: "Emberfox", legacy: true, name: "default-release", path: "/home/rxvy/.emberfox/emberfox/x9y8.default-release", isDefault: true, modified: Date.now() - 3 * 86400000, hasPlaces: true, hasLogins: false, running: false },
      { browser: "LibreWolf", name: "default", path: "/home/rxvy/.librewolf/k1l2.default", isDefault: true, modified: Date.now() - 40 * 86400000, hasPlaces: true, hasLogins: true, running: true },
    ],
    launcherAvailable: () => true, currentLoginCount: () => 0, pendingImport: async () => null,
    importBookmarks: async () => 412, importHistory: async () => 8231, importSettings: async () => 37, importChromeFolder: async () => 2,
    listExtensions: async () => [{ id: "a", name: "Dark Reader", enabled: true, installed: false }, { id: "b", name: "Bitwarden", enabled: true, installed: false }],
    stageImport: async () => ["logins.json", "key4.db"], installAddon: async () => "ok",
  };
  const fontsMock = {
    listImported: async () => [{ file: "MetalMania-Regular.ttf", path: "/x/MetalMania-Regular.ttf", family: "Metal Mania", ext: "ttf", size: 251000 }],
    fontFaceCSS: () => '@font-face { font-family: "Metal Mania"; src: url("./fonts/MetalMania-Regular.ttf"); }',
    systemFamilies: async () => ["Cantarell", "DejaVu Sans", "JetBrains Mono", "Noto Sans"],
    importFont: async () => ({ family: "X" }), removeFont: async () => {},
  };
  window.ChromeUtils = {
    importESModule: url => url.includes("importer") ? importerMock : url.includes("fonts.sys") ? fontsMock
      : url.includes("AddonManager") ? { AddonManager: { getAddonsByTypes: async () => [{ name: "uBlock Origin" }, { name: "Dark Reader" }] } }
      : url.includes("boot") ? { IgniBoot: { customCSSPath: () => "/profile/chrome/igni-custom.css", bumpCustomCSS() {},
        version: async () => "160.0.1-1",
        newtabURL: () => "./newtab/index.html",
        setNewtabWallpaper: async () => "wallpaper.jpg",
        checkForUpdate: async () => ({ status: "current", current: "160.0.1-1", latest: "160.0.1-1" }),
        fetchGallery: async () => (await (await fetch("./themes-index.json")).json()).themes } }
      : { CustomizableUI: CUI },
  };
  window.__igniPrefs = prefs;
})();
