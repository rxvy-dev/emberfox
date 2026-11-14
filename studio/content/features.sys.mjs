/* Ignifox — browser-window features.
 *
 *  - Command palette (Ctrl+K): tabs, bookmarks, actions, themes, wallpapers, Studio, panels
 *  - Workspaces: groups of tabs, each with its own theme, one visible at a time per window
 *  - Web panels: pinned sites in a side strip, each kept alive in its own browser
 *  - Site tint: the toolbars pick up the colour of the current site's icon
 *  - Cookie auto-delete: a site's cookies and storage go when its last tab closes
 *  - Tab unloading: tabs left alone for a while are unloaded to free memory
 *
 * Started by boot.sys.mjs; everything here reads ignifox.* prefs live.
 */

import { THEMES, WALLPAPERS, readPref } from "chrome://ignifox/content/prefs.sys.mjs";
import {
  PANEL_SUGGESTIONS,
  WORKSPACE_ICONS,
  dominantColor,
  fuzzyScore,
  parsePanels,
  parseWorkspaces,
  siteKept,
} from "chrome://ignifox/content/data.sys.mjs";

const { setTimeout, clearTimeout, setInterval } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const XHTML = "http://www.w3.org/1999/xhtml";
const AUTODELETE_GRACE_MS = 15 * 1000;
const UNLOAD_CHECK_MS = 60 * 1000;
const STUDIO_SECTIONS = [
  ["look", "Look & Color"], ["fonts", "Fonts"], ["newtab", "New Tab"], ["search", "Search"],
  ["placement", "Placement"], ["workspaces", "Workspaces & Panels"], ["browsing", "Tabs & Browsing"],
  ["privacy", "Privacy"], ["ai", "AI Features"], ["addons", "Add-ons"], ["css", "Custom CSS"],
  ["import", "Import"], ["backup", "Backup & Reset"], ["about", "About"],
];

const pref = (key, type) => readPref(Services.prefs, key, type);
const browserWindows = () => [...Services.wm.getEnumerator("navigator:browser")].filter(w => w.gBrowser && !w.closed);

function log(...args) {
  console.log("[Ignifox features]", ...args);
}

function hostOf(uri) {
  try {
    if (!uri || !/^https?$/.test(uri.scheme)) {
      return "";
    }
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch (e) {
      return uri.host;
    }
  } catch (e) {
    return "";
  }
}

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElementNS(XHTML, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k == "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...kids.filter(k => k != null));
  return e;
}

export const IgniFeatures = {
  hooks: { paint: () => {}, openStudio: () => {} },

  init(hooks) {
    Object.assign(this.hooks, hooks);
    Services.prefs.addObserver("ignifox.", this);
    setInterval(() => this.unloadIdleTabs(), UNLOAD_CHECK_MS);
  },

  observe(subject, topic, data) {
    if (topic != "nsPref:changed") {
      return;
    }
    if (data.startsWith("ignifox.workspaces.")) {
      browserWindows().forEach(w => this.applyWorkspace(w));
    }
    if (data.startsWith("ignifox.panels.")) {
      browserWindows().forEach(w => this.buildPanels(w));
    }
    if (data == "ignifox.palette.enabled") {
      browserWindows().forEach(w => this.syncPaletteKey(w));
    }
    if (data.startsWith("ignifox.theme.siteTint")) {
      browserWindows().forEach(w => this.updateTint(w));
    }
  },

  setupWindow(win) {
    if (win._igniFeatures) {
      return;
    }
    win._igniFeatures = true;
    const { gBrowser } = win;

    // ---- shortcuts: Ctrl+K palette, Ctrl+Alt+1…9 workspaces. XUL keys, so a page that uses
    // Ctrl+K itself (GitHub, Slack, Discord) still gets it first.
    this.addKeys(win);

    // ---- tabs: workspaces, auto-delete, tint
    win._igniHosts = new WeakMap();
    gBrowser.tabContainer.addEventListener("TabOpen", e => this.onTabOpen(win, e.target));
    gBrowser.tabContainer.addEventListener("TabSelect", e => this.onTabSelect(win, e.target));
    gBrowser.tabContainer.addEventListener("TabClose", e => this.onTabClose(win, e.target));
    gBrowser.tabContainer.addEventListener("TabAttrModified", e => {
      if (e.target.selected && e.detail?.changed?.includes("image")) {
        this.updateTint(win);
      }
    });
    gBrowser.tabContainer.addEventListener("SSTabRestoring", e => this.onTabRestoring(win, e.target));
    gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress, request, location) => {
        if (!webProgress?.isTopLevel) {
          return;
        }
        const now = hostOf(location), before = win._igniHosts.get(browser);
        win._igniHosts.set(browser, now);
        if (before && before != now) {
          this.scheduleAutoDelete(before);
        }
      },
    });
    for (const tab of gBrowser.tabs) {
      win._igniHosts.set(tab.linkedBrowser, hostOf(tab.linkedBrowser.currentURI));
    }

    this.ensureWorkspaceWidget();
    win.addEventListener("SSWindowRestored", () => this.applyWorkspace(win, this.savedWorkspace(win)));
    setTimeout(() => this.applyWorkspace(win, this.savedWorkspace(win)), 0);
    this.buildPanels(win);
    this.updateTint(win);
  },

  addKeys(win) {
    const doc = win.document;
    if (doc.getElementById("igni-feature-keys")) {
      return;
    }
    const keyset = doc.createXULElement("keyset");
    keyset.id = "igni-feature-keys";
    const mk = (id, key, modifiers, fn) => {
      const k = doc.createXULElement("key");
      k.id = id;
      k.setAttribute("key", key);
      k.setAttribute("modifiers", modifiers);
      k.addEventListener("command", fn);
      keyset.append(k);
    };
    mk("igni-key-palette", "K", "accel", () => this.togglePalette(win));
    for (let i = 1; i <= 9; i++) {
      mk(`igni-key-ws-${i}`, String(i), "accel,alt", () => {
        const ws = parseWorkspaces(pref("ignifox.workspaces.list", "string"))[i - 1];
        if (ws && pref("ignifox.workspaces.enabled", "bool")) this.applyWorkspace(win, ws.id);
      });
    }
    doc.documentElement.append(keyset);
    this.syncPaletteKey(win);
  },

  /** Ctrl+K opens the palette instead of Firefox's "focus the search bar" (still on Ctrl+E). */
  syncPaletteKey(win) {
    const doc = win.document;
    const on = !!pref("ignifox.palette.enabled", "bool");
    doc.getElementById("igni-key-palette")?.toggleAttribute("disabled", !on);
    const firefoxKey = doc.getElementById("key_search");
    if (firefoxKey) {
      if (on) firefoxKey.setAttribute("disabled", "true");
      else firefoxKey.removeAttribute("disabled");
    }
  },

  onTabOpen(win, tab) {
    if (pref("ignifox.workspaces.enabled", "bool") && win._igniWs) {
      this.setTabWorkspace(win, tab, win._igniWs);
    }
  },

  onTabSelect(win, tab) {
    // Picking a tab from another workspace (tab search, palette, a link) switches to it.
    const ws = tab.getAttribute("igni-ws");
    if (pref("ignifox.workspaces.enabled", "bool") && ws && ws != win._igniWs && !tab.pinned) {
      this.applyWorkspace(win, ws);
    }
    this.updateTint(win);
  },

  onTabClose(win, tab) {
    const host = win._igniHosts.get(tab.linkedBrowser) || hostOf(tab.linkedBrowser.currentURI);
    if (host) {
      this.scheduleAutoDelete(host);
    }
  },

  onTabRestoring(win, tab) {
    const ws = win.SessionStore.getCustomTabValue(tab, "igniWs");
    if (ws) {
      tab.setAttribute("igni-ws", ws);
    }
    clearTimeout(win._igniWsRestoreTimer);
    win._igniWsRestoreTimer = setTimeout(() => this.applyWorkspace(win), 50);
  },

  // ================================================================= command palette
  togglePalette(win) {
    const doc = win.document;
    const open = doc.getElementById("igni-palette");
    if (open) {
      this.closePalette(win);
      return;
    }
    const input = el(doc, "input", {
      id: "igni-palette-input", type: "text", spellcheck: "false", autocomplete: "off",
      placeholder: "Search tabs, bookmarks, actions, themes… or type an address",
      "aria-label": "Command palette",
    });
    const list = el(doc, "ul", { id: "igni-palette-list", role: "listbox" });
    const hint = el(doc, "div", { id: "igni-palette-hint", text: "↑↓ to move · Enter to run · Esc to close" });
    const box = el(doc, "div", { id: "igni-palette", role: "dialog", "aria-label": "Command palette" }, input, list, hint);
    const shade = el(doc, "div", { id: "igni-palette-shade", onclick: () => this.closePalette(win) });
    (doc.body || doc.documentElement).append(shade, box);

    let items = [], sel = 0, token = 0;
    const render = () => {
      list.replaceChildren(...items.map((it, i) => {
        const li = el(doc, "li", { role: "option", "aria-selected": String(i == sel), "data-group": it.group },
          el(doc, "span", { class: "ico", text: it.icon || "•" }),
          el(doc, "span", { class: "lbl", text: it.label }),
          it.detail ? el(doc, "span", { class: "det", text: it.detail }) : null,
          el(doc, "span", { class: "grp", text: it.group }));
        li.addEventListener("mousemove", () => { if (sel != i) { sel = i; render(); } });
        li.addEventListener("click", () => run(i));
        return li;
      }));
      list.children[sel]?.scrollIntoView({ block: "nearest" });
    };
    const run = i => {
      const it = items[i];
      this.closePalette(win);
      if (it) {
        try {
          it.run();
        } catch (e) {
          log("palette action failed", it.label, e);
        }
      }
    };
    const refresh = async () => {
      const mine = ++token;
      const q = input.value;
      items = this.paletteItems(win, q);
      sel = 0;
      render();
      if (q.trim().length > 1) {
        const marks = await this.bookmarkItems(win, q);
        if (mine == token && marks.length) {
          items = [...items, ...marks].sort((a, b) => b.score - a.score).slice(0, 40);
          render();
        }
      }
    };
    input.addEventListener("input", refresh);
    input.addEventListener("keydown", e => {
      if (e.key == "ArrowDown" || (e.key == "Tab" && !e.shiftKey)) { sel = Math.min(items.length - 1, sel + 1); render(); }
      else if (e.key == "ArrowUp" || (e.key == "Tab" && e.shiftKey)) { sel = Math.max(0, sel - 1); render(); }
      else if (e.key == "Enter") { run(sel); }
      else if (e.key == "Escape") { this.closePalette(win); }
      else { return; }
      e.preventDefault();
      e.stopPropagation();
    });
    refresh();
    input.focus();
  },

  closePalette(win) {
    const doc = win.document;
    doc.getElementById("igni-palette")?.remove();
    doc.getElementById("igni-palette-shade")?.remove();
    win.gBrowser.selectedBrowser.focus();
  },

  /** Everything the palette can do, scored against the query. */
  paletteItems(win, query) {
    const { gBrowser } = win;
    const q = query.trim();
    const items = [];
    const add = (group, icon, label, detail, run, extra = "") => {
      const score = q ? Math.max(fuzzyScore(q, label), fuzzyScore(q, `${group} ${label} ${extra}`) - 40, detail ? fuzzyScore(q, detail) - 60 : -1) : 0;
      if (!q || score > 0) {
        items.push({ group, icon, label, detail, run, score });
      }
    };
    const cmd = id => () => win.document.getElementById(id)?.doCommand();
    const set = (key, type, value) => () => {
      if (type == "bool") Services.prefs.setBoolPref(key, value);
      else if (type == "int") Services.prefs.setIntPref(key, value);
      else Services.prefs.setStringPref(key, value);
    };

    // Open tabs, most recent first (from every window)
    const tabs = browserWindows().flatMap(w => [...w.gBrowser.tabs].map(t => ({ w, t })))
      .filter(({ t }) => !t.closing)
      .sort((a, b) => (b.t.lastAccessed || 0) - (a.t.lastAccessed || 0));
    for (const { w, t } of tabs) {
      if (t == gBrowser.selectedTab) continue;
      const url = t.linkedBrowser.currentURI?.spec || "";
      add("Tab", t.pinned ? "📌" : "▭", t.label || url, url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60), () => {
        w.gBrowser.selectedTab = t;
        w.focus();
      });
    }

    // Actions
    const url = gBrowser.currentURI?.spec || "";
    const host = hostOf(gBrowser.currentURI);
    add("Action", "＋", "New tab", "Ctrl+T", () => (win.BrowserCommands?.openTab ? win.BrowserCommands.openTab() : win.BrowserOpenTab()));
    add("Action", "🕶", "New private window", "Ctrl+Shift+P", () => win.OpenBrowserWindow({ private: true }));
    add("Action", "↶", "Reopen closed tab", "Ctrl+Shift+T", () => win.SessionStore.undoCloseTab(win, 0));
    add("Action", "⧉", "Duplicate tab", null, () => { gBrowser.selectedTab = gBrowser.duplicateTab(gBrowser.selectedTab); });
    add("Action", "📌", gBrowser.selectedTab.pinned ? "Unpin tab" : "Pin tab", null,
      () => (gBrowser.selectedTab.pinned ? gBrowser.unpinTab(gBrowser.selectedTab) : gBrowser.pinTab(gBrowser.selectedTab)));
    add("Action", "💤", "Unload other tabs", "Frees memory; they reload when you click them", () => this.unloadOtherTabs(win));
    add("Action", "📋", "Copy page address", url.slice(0, 60), () => {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(url);
    });
    add("Action", "☆", "Bookmark this page", "Ctrl+D", cmd("Browser:AddBookmarkAs"));
    add("Action", "📖", "Reader view", "F9", cmd("View:ReaderView"));
    add("Action", "📷", "Take a screenshot", "Ctrl+Shift+S", cmd("Browser:Screenshot"));
    add("Action", "⬇", "Downloads", "Ctrl+Shift+Y", cmd("Tools:Downloads"));
    add("Action", "🧩", "Add-ons and themes", "Ctrl+Shift+A", () => win.BrowserAddonUI.openAddonsMgr());
    add("Action", "🕘", "History", "Ctrl+H", () => win.SidebarController?.toggle("viewHistorySidebar"));
    add("Action", "🧹", "Clear recent history", "Ctrl+Shift+Delete", cmd("Tools:Sanitize"));
    add("Action", "🎯", "Focus mode (hide toolbars)", "Ctrl+Alt+Z",
      set("ignifox.layout.autohide", "bool", !pref("ignifox.layout.autohide", "bool")));
    if (host && pref("ignifox.privacy.autoDelete", "bool")) {
      const kept = siteKept(host, pref("ignifox.privacy.keepSites", "string"));
      add("Privacy", "🍪", kept ? `Stop keeping cookies for ${host}` : `Keep cookies for ${host}`,
        kept ? "They'll be deleted when you close its last tab" : "Stays logged in when you close it", () => this.toggleKeep(host));
    }

    // Workspaces
    if (pref("ignifox.workspaces.enabled", "bool")) {
      const list = parseWorkspaces(pref("ignifox.workspaces.list", "string"));
      list.forEach((ws, i) => {
        if (ws.id != win._igniWs) {
          add("Workspace", ws.icon, `Switch to ${ws.name}`, `Ctrl+Alt+${i + 1}`, () => this.applyWorkspace(win, ws.id));
          add("Workspace", ws.icon, `Move tab to ${ws.name}`, null, () => this.moveTabToWorkspace(win, gBrowser.selectedTab, ws.id));
        }
      });
      add("Workspace", "＋", "New workspace", null, () => this.newWorkspace(win));
    } else {
      add("Workspace", "▦", "Turn on workspaces", "Groups of tabs, each with its own theme", () => {
        Services.prefs.setBoolPref("ignifox.workspaces.enabled", true);
      });
    }

    // Web panels
    for (const p of parsePanels(pref("ignifox.panels.list", "string"))) {
      add("Panel", "◧", `Open ${p.title} panel`, p.url.replace(/^https?:\/\//, "").slice(0, 50), () => {
        Services.prefs.setBoolPref("ignifox.panels.enabled", true);
        this.showPanel(win, p.url);
      });
    }
    if (/^https?:/.test(url)) {
      add("Panel", "◧", "Add this page as a web panel", host, () => this.addPanel(url, gBrowser.selectedTab.label));
    }

    // Themes and wallpapers
    for (const [key, t] of Object.entries(THEMES)) {
      add("Theme", "🎨", `Theme: ${t.name}`, null, () => {
        Services.prefs.setStringPref("ignifox.theme.preset", key);
        Services.prefs.setStringPref("ignifox.theme.accent", "");
        Services.prefs.setStringPref("ignifox.theme.auto", "off");
      }, "color colour look");
    }
    add("Theme", "🖌", pref("ignifox.theme.siteTint", "bool") ? "Stop tinting toolbars by site" : "Tint toolbars with each site's colour", null,
      set("ignifox.theme.siteTint", "bool", !pref("ignifox.theme.siteTint", "bool")));
    for (const [key, label] of Object.entries(WALLPAPERS)) {
      if (key == "image") continue;
      add("Wallpaper", "🖼", `Wallpaper: ${label}`, null, set("ignifox.newtab.wallpaper", "string", key), "new tab background");
    }

    // Studio
    for (const [id, label] of STUDIO_SECTIONS) {
      add("Studio", "⚙", `Studio: ${label}`, null, () => this.hooks.openStudio(win, id), "settings preferences customize");
    }

    // Go / search fallbacks
    if (q) {
      const looksURL = !/\s/.test(q) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(q));
      if (looksURL) {
        items.push({ group: "Go", icon: "→", label: `Go to ${q}`, score: 2000, run: () => {
          win.openTrustedLinkIn(/^[a-z][a-z0-9+.-]*:\/\//i.test(q) ? q : "https://" + q, "current");
        } });
      }
      items.push({ group: "Search", icon: "🔍", label: `Search the web for “${q}”`, score: looksURL ? -1 : 0.5, run: async () => {
        const engine = await Services.search.getDefault();
        win.openTrustedLinkIn(engine.getSubmission(q).uri.spec, "current");
      } });
    }

    const order = { Tab: 3, Action: 2, Workspace: 2, Panel: 1, Privacy: 1 };
    return items
      .sort((a, b) => (b.score - a.score) || ((order[b.group] || 0) - (order[a.group] || 0)))
      .slice(0, q ? 40 : 14);
  },

  async bookmarkItems(win, q) {
    try {
      const found = await win.PlacesUtils.bookmarks.search({ query: q }, { limit: 12 });
      return found.filter(b => b.url).map(b => {
        const url = b.url.href;
        return {
          group: "Bookmark", icon: "★", label: b.title || url, detail: url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60),
          score: Math.max(fuzzyScore(q, b.title || ""), fuzzyScore(q, url) - 30, 1),
          run: () => win.openTrustedLinkIn(url, "tab"),
        };
      });
    } catch (e) {
      log("bookmark search failed", e);
      return [];
    }
  },

  // ================================================================= workspaces
  ensureWorkspaceWidget() {
    if (this._wsWidget) {
      return;
    }
    this._wsWidget = true;
    let CUI;
    try {
      ({ CustomizableUI: CUI } = ChromeUtils.importESModule("moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"));
    } catch (e) {
      ({ CustomizableUI: CUI } = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs"));
    }
    if (CUI.getWidget("igni-workspaces")?.provider == CUI.PROVIDER_API) {
      return;
    }
    CUI.createWidget({
      id: "igni-workspaces",
      type: "custom",
      defaultArea: CUI.AREA_TABSTRIP,
      onBuild: doc => {
        const b = doc.createXULElement("toolbarbutton");
        b.id = "igni-workspaces";
        b.className = "toolbarbutton-1 chromeclass-toolbar-additional";
        b.setAttribute("label", "Workspaces");
        b.setAttribute("tooltiptext", "Workspaces (Ctrl+Alt+1…9)");
        b.addEventListener("command", () => this.workspaceMenu(doc.ownerGlobal, b));
        return b;
      },
    });
  },

  savedWorkspace(win) {
    try {
      return win.SessionStore.getCustomWindowValue(win, "igniWs") || "";
    } catch (e) {
      return "";
    }
  },

  setTabWorkspace(win, tab, id) {
    tab.setAttribute("igni-ws", id);
    try {
      win.SessionStore.setCustomTabValue(tab, "igniWs", id);
    } catch (e) {}
  },

  /** Show only the tabs of workspace `id` (pinned tabs are shared) and paint its theme. */
  applyWorkspace(win, id = win._igniWs) {
    const { gBrowser } = win;
    const btn = win.document.getElementById("igni-workspaces");
    const enabled = pref("ignifox.workspaces.enabled", "bool");
    if (btn) {
      btn.hidden = !enabled;
    }
    if (!enabled) {
      for (const tab of gBrowser.tabs) {
        if (tab.hasAttribute("igni-ws-hidden")) {
          tab.removeAttribute("igni-ws-hidden");
          gBrowser.showTab(tab);
        }
      }
      if (win._igniThemeOverride) {
        win._igniThemeOverride = null;
        this.hooks.paint(win);
      }
      win._igniWs = "";
      return;
    }
    const list = parseWorkspaces(pref("ignifox.workspaces.list", "string"));
    const ws = list.find(w => w.id == id) || list[0];
    win._igniWs = ws.id;
    try {
      win.SessionStore.setCustomWindowValue(win, "igniWs", ws.id);
    } catch (e) {}

    const known = new Set(list.map(w => w.id));
    for (const tab of gBrowser.tabs) {
      if (!known.has(tab.getAttribute("igni-ws"))) {
        this.setTabWorkspace(win, tab, list[0].id);       // tabs from before workspaces, or a deleted one
      }
    }
    const mine = t => t.pinned || t.getAttribute("igni-ws") == ws.id;
    if (!mine(gBrowser.selectedTab)) {
      const next = [...gBrowser.tabs].filter(t => mine(t) && !t.closing)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      if (next) {
        gBrowser.selectedTab = next;
      } else {
        const tab = gBrowser.addTrustedTab(win.BROWSER_NEW_TAB_URL || "about:newtab");
        this.setTabWorkspace(win, tab, ws.id);
        gBrowser.selectedTab = tab;
      }
    }
    for (const tab of gBrowser.tabs) {
      if (mine(tab)) {
        if (tab.hidden && tab.hasAttribute("igni-ws-hidden")) {
          gBrowser.showTab(tab);
        }
        tab.removeAttribute("igni-ws-hidden");
      } else if (!tab.hidden && !tab.selected) {
        gBrowser.hideTab(tab);
        tab.setAttribute("igni-ws-hidden", "true");
      }
    }
    if (btn) {
      btn.setAttribute("label", `${ws.icon} ${ws.name}`);
    }
    const theme = ws.theme && (THEMES[ws.theme] || ws.theme.startsWith("user:")) ? ws.theme : null;
    if (theme != win._igniThemeOverride) {
      win._igniThemeOverride = theme;
      this.hooks.paint(win);
    }
  },

  moveTabToWorkspace(win, tab, id) {
    this.setTabWorkspace(win, tab, id);
    this.applyWorkspace(win, win._igniWs);
  },

  newWorkspace(win, name) {
    const list = parseWorkspaces(pref("ignifox.workspaces.list", "string"));
    if (list.length >= 9) {
      return null;
    }
    name = name || win.prompt("Name for the new workspace:", `Workspace ${list.length + 1}`);
    if (!name) {
      return null;
    }
    const id = "w" + Date.now().toString(36);
    const icon = WORKSPACE_ICONS.find(i => !list.some(w => w.icon == i)) || "•";
    list.push({ id, name: name.slice(0, 30), icon, theme: "" });
    Services.prefs.setBoolPref("ignifox.workspaces.enabled", true);
    Services.prefs.setStringPref("ignifox.workspaces.list", JSON.stringify(list));
    this.applyWorkspace(win, id);
    return id;
  },

  workspaceMenu(win, anchor) {
    const doc = win.document;
    doc.getElementById("igni-ws-popup")?.remove();
    const popup = doc.createXULElement("menupopup");
    popup.id = "igni-ws-popup";
    const list = parseWorkspaces(pref("ignifox.workspaces.list", "string"));
    list.forEach((ws, i) => {
      const mi = doc.createXULElement("menuitem");
      mi.setAttribute("label", `${ws.icon}  ${ws.name}`);
      mi.setAttribute("type", "radio");
      mi.setAttribute("acceltext", `Ctrl+Alt+${i + 1}`);
      if (ws.id == win._igniWs) mi.setAttribute("checked", "true");
      mi.addEventListener("command", () => this.applyWorkspace(win, ws.id));
      popup.append(mi);
    });
    popup.append(doc.createXULElement("menuseparator"));
    const add = doc.createXULElement("menuitem");
    add.setAttribute("label", "New workspace…");
    add.addEventListener("command", () => this.newWorkspace(win));
    const edit = doc.createXULElement("menuitem");
    edit.setAttribute("label", "Edit workspaces in Studio");
    edit.addEventListener("command", () => this.hooks.openStudio(win, "workspaces"));
    popup.append(add, edit);
    (doc.getElementById("mainPopupSet") || doc.documentElement).append(popup);
    popup.addEventListener("popuphidden", () => popup.remove(), { once: true });
    popup.openPopup(anchor, "after_start");
  },

  // ================================================================= web panels
  buildPanels(win) {
    const doc = win.document;
    const enabled = pref("ignifox.panels.enabled", "bool");
    const panels = parsePanels(pref("ignifox.panels.list", "string"));
    let box = doc.getElementById("igni-panels");
    if (!enabled) {
      box?.remove();
      win._igniPanelBrowsers = null;
      return;
    }
    const browserBox = doc.getElementById("browser");
    if (!browserBox) {
      return;
    }
    const side = pref("ignifox.panels.side", "string") == "left" ? "left" : "right";
    if (!box) {
      box = doc.createXULElement("hbox");
      box.id = "igni-panels";
      const splitter = doc.createXULElement("splitter");
      splitter.id = "igni-panel-splitter";
      splitter.setAttribute("resizebefore", "sibling");
      splitter.setAttribute("resizeafter", "none");
      const view = doc.createXULElement("vbox");
      view.id = "igni-panel-view";
      view.hidden = true;
      const head = doc.createXULElement("hbox");
      head.id = "igni-panel-head";
      head.setAttribute("align", "center");
      const title = doc.createXULElement("label");
      title.id = "igni-panel-title";
      title.setAttribute("flex", "1");
      title.setAttribute("crop", "end");
      const mkBtn = (id, tip, fn) => {
        const b = doc.createXULElement("toolbarbutton");
        b.id = id;
        b.className = "igni-panel-btn";
        b.setAttribute("tooltiptext", tip);
        b.addEventListener("command", fn);
        return b;
      };
      head.append(title,
        mkBtn("igni-panel-reload", "Reload", () => this.currentPanelBrowser(win)?.reload()),
        mkBtn("igni-panel-tab", "Open in a tab", () => {
          const b = this.currentPanelBrowser(win);
          if (b) win.openTrustedLinkIn(b.currentURI.spec, "tab");
        }),
        mkBtn("igni-panel-close", "Close panel", () => this.showPanel(win, null)));
      const stack = doc.createXULElement("vbox");
      stack.id = "igni-panel-browsers";
      stack.setAttribute("flex", "1");
      view.append(head, stack);
      view.style.width = `${Math.max(260, Math.min(1000, pref("ignifox.panels.width", "int") || 400))}px`;
      const strip = doc.createXULElement("vbox");
      strip.id = "igni-panel-strip";
      box.append(splitter, view, strip);
      splitter.addEventListener("mouseup", () => {
        const w = Math.round(view.getBoundingClientRect().width);
        if (w > 100) Services.prefs.setIntPref("ignifox.panels.width", w);
      });
      win._igniPanelBrowsers = new Map();
    }
    // Keep the box on the chosen side of the page; the splitter always sits next to the page.
    const splitter = doc.getElementById("igni-panel-splitter");
    const view = doc.getElementById("igni-panel-view"), stripEl = doc.getElementById("igni-panel-strip");
    box.setAttribute("side", side);
    if (side == "left") {
      browserBox.insertBefore(box, browserBox.firstChild);
      box.append(stripEl, view, splitter);
      splitter.setAttribute("resizebefore", "sibling");
      splitter.setAttribute("resizeafter", "flex");
    } else {
      browserBox.append(box);
      box.append(splitter, view, stripEl);
      splitter.setAttribute("resizebefore", "flex");
      splitter.setAttribute("resizeafter", "sibling");
    }

    const strip = doc.getElementById("igni-panel-strip");
    strip.replaceChildren();
    for (const p of panels) {
      const b = doc.createXULElement("toolbarbutton");
      b.className = "igni-panel-icon";
      b.setAttribute("tooltiptext", `${p.title}\n${p.url}`);
      b.setAttribute("label", p.title.charAt(0).toUpperCase());
      b.setAttribute("igni-url", p.url);
      b.addEventListener("command", () => this.showPanel(win, win._igniPanelOpen == p.url ? null : p.url));
      b.addEventListener("click", e => {
        if (e.button == 1) this.removePanelBrowser(win, p.url);       // middle-click: unload
      });
      strip.append(b);
    }
    const plus = doc.createXULElement("toolbarbutton");
    plus.className = "igni-panel-icon igni-panel-add";
    plus.setAttribute("label", "+");
    plus.setAttribute("tooltiptext", "Add the current page as a panel (or pick one in Studio)");
    plus.addEventListener("command", () => {
      const url = win.gBrowser.currentURI?.spec || "";
      if (/^https?:/.test(url)) this.addPanel(url, win.gBrowser.selectedTab.label);
      else this.hooks.openStudio(win, "workspaces");
    });
    strip.append(plus);
    // Drop browsers whose panel was removed.
    for (const url of [...win._igniPanelBrowsers.keys()]) {
      if (!panels.some(p => p.url == url)) this.removePanelBrowser(win, url);
    }
    this.markActivePanel(win);
  },

  currentPanelBrowser(win) {
    return win._igniPanelOpen ? win._igniPanelBrowsers?.get(win._igniPanelOpen) : null;
  },

  /** Show the panel for `url` (creating its browser on first use), or hide the view with null. */
  showPanel(win, url) {
    const doc = win.document;
    if (!doc.getElementById("igni-panels")) {
      this.buildPanels(win);
    }
    const view = doc.getElementById("igni-panel-view");
    if (!view) {
      return null;
    }
    win._igniPanelOpen = url || null;
    view.hidden = !url;
    let shown = null;
    for (const [u, b] of win._igniPanelBrowsers) {
      b.hidden = u != url;
      if (u == url) shown = b;
    }
    if (url && !shown) {
      shown = doc.createXULElement("browser");
      for (const [k, v] of Object.entries({
        type: "content", remote: "true", maychangeremoteness: "true", messagemanagergroup: "browsers",
        disableglobalhistory: "true", flex: "1", nodefaultsrc: "true", autocompletepopup: "PopupAutoComplete",
        "igni-panel": "true",
      })) {
        shown.setAttribute(k, v);
      }
      doc.getElementById("igni-panel-browsers").append(shown);
      win._igniPanelBrowsers.set(url, shown);
      shown.fixupAndLoadURIString(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    }
    const p = parsePanels(pref("ignifox.panels.list", "string")).find(x => x.url == url);
    doc.getElementById("igni-panel-title")?.setAttribute("value", p?.title || "");
    this.markActivePanel(win);
    return shown;
  },

  removePanelBrowser(win, url) {
    const b = win._igniPanelBrowsers?.get(url);
    if (b) {
      b.remove();
      win._igniPanelBrowsers.delete(url);
    }
    if (win._igniPanelOpen == url) this.showPanel(win, null);
  },

  markActivePanel(win) {
    for (const b of win.document.querySelectorAll("#igni-panel-strip .igni-panel-icon")) {
      b.toggleAttribute("checked", !!win._igniPanelOpen && b.getAttribute("igni-url") == win._igniPanelOpen);
    }
  },

  addPanel(url, title) {
    const list = parsePanels(pref("ignifox.panels.list", "string"));
    if (!list.some(p => p.url == url)) {
      list.push({ url, title: String(title || "").slice(0, 40) });
    }
    Services.prefs.setStringPref("ignifox.panels.list", JSON.stringify(list));
    Services.prefs.setBoolPref("ignifox.panels.enabled", true);
  },

  suggestions: PANEL_SUGGESTIONS,

  // ================================================================= site tint
  updateTint(win) {
    const root = win.document.documentElement;
    if (!pref("ignifox.theme.siteTint", "bool")) {
      root.removeAttribute("igni-sitetint");
      return;
    }
    const amount = Math.max(5, Math.min(80, pref("ignifox.theme.siteTint.strength", "int") || 35));
    root.style.setProperty("--igni-site-amt", `${amount}%`);
    const tab = win.gBrowser.selectedTab;
    const src = tab.image || "";
    win._igniTintCache ??= new Map();
    const apply = color => {
      if (win.gBrowser.selectedTab != tab) return;
      if (color) {
        root.style.setProperty("--igni-site", color);
        root.setAttribute("igni-sitetint", "true");
      } else {
        root.removeAttribute("igni-sitetint");
      }
    };
    if (!src) {
      apply(null);
      return;
    }
    if (win._igniTintCache.has(src)) {
      apply(win._igniTintCache.get(src));
      return;
    }
    const img = new win.Image();
    img.onload = () => {
      let color = null;
      try {
        const c = win.document.createElementNS(XHTML, "canvas");
        c.width = c.height = 24;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 24, 24);
        color = dominantColor(ctx.getImageData(0, 0, 24, 24).data);
      } catch (e) {}
      win._igniTintCache.set(src, color);
      apply(color);
    };
    img.onerror = () => { win._igniTintCache.set(src, null); apply(null); };
    img.src = src;
  },

  // ================================================================= cookie auto-delete
  scheduleAutoDelete(host) {
    if (!host || !pref("ignifox.privacy.autoDelete", "bool")) {
      return;
    }
    this._pending ??= new Map();
    clearTimeout(this._pending.get(host));
    this._pending.set(host, setTimeout(() => {
      this._pending.delete(host);
      this.autoDelete(host).catch(e => log("auto-delete failed", host, e));
    }, AUTODELETE_GRACE_MS));
  },

  /** True if `host` is still open in any normal (non-private) tab. */
  hostOpen(host) {
    for (const w of browserWindows()) {
      if (w.PrivateBrowsingUtils?.isWindowPrivate(w)) continue;
      for (const tab of w.gBrowser.tabs) {
        if (hostOf(tab.linkedBrowser.currentURI) == host) return true;
      }
      for (const b of w._igniPanelBrowsers?.values() || []) {
        if (hostOf(b.currentURI) == host) return true;
      }
    }
    return false;
  },

  async autoDelete(host, { force = false } = {}) {
    if (!force && (!pref("ignifox.privacy.autoDelete", "bool") || this.hostOpen(host) ||
        siteKept(host, pref("ignifox.privacy.keepSites", "string")))) {
      return false;
    }
    const F = Ci.nsIClearDataService;
    const flags = F.CLEAR_COOKIES_AND_SITE_DATA ??
      (F.CLEAR_COOKIES | F.CLEAR_DOM_STORAGES | F.CLEAR_AUTH_TOKENS | F.CLEAR_AUTH_CACHE | F.CLEAR_DOM_QUOTA | F.CLEAR_EME | (F.CLEAR_MEDIA_DEVICES || 0));
    await new Promise(resolve => {
      const cb = { onDataDeleted: resolve };
      if (Services.clearData.deleteDataFromSite) {
        Services.clearData.deleteDataFromSite(host, {}, true, flags, cb);
      } else {
        Services.clearData.deleteDataFromBaseDomain(host, true, flags, cb);
      }
    });
    Services.prefs.setIntPref("ignifox.privacy.autoDelete.cleaned", (pref("ignifox.privacy.autoDelete.cleaned", "int") || 0) + 1);
    log("auto-deleted cookies and site data for", host);
    return true;
  },

  toggleKeep(host) {
    const text = pref("ignifox.privacy.keepSites", "string") || "";
    const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    const kept = siteKept(host, text);
    const next = kept ? lines.filter(l => !siteKept(host, l)) : [...lines, host];
    Services.prefs.setStringPref("ignifox.privacy.keepSites", next.join("\n"));
  },

  // ================================================================= tab unloading
  unloadIdleTabs() {
    const minutes = pref("ignifox.tabs.unloadAfter", "int") || 0;
    if (minutes <= 0) {
      return 0;
    }
    const cutoff = Date.now() - minutes * 60 * 1000;
    let n = 0;
    for (const w of browserWindows()) {
      for (const tab of w.gBrowser.tabs) {
        if (tab.selected || tab.pinned || tab.soundPlaying || tab.hasAttribute("pending") || !tab.linkedPanel) continue;
        if ((tab.lastAccessed || Date.now()) > cutoff) continue;
        try {
          if (w.gBrowser.discardBrowser(tab)) n++;
        } catch (e) {}
      }
    }
    return n;
  },

  unloadOtherTabs(win) {
    let n = 0;
    for (const tab of win.gBrowser.tabs) {
      if (tab.selected || tab.hasAttribute("pending") || !tab.linkedPanel) continue;
      try {
        if (win.gBrowser.discardBrowser(tab)) n++;
      } catch (e) {}
    }
    return n;
  },
};
