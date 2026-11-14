/* Ignifox Studio: pure data + parsing helpers (no browser APIs, unit-tested in Node). */

// ---------------------------------------------------------------- import
// Where Firefox-family browsers keep their profiles on Linux. Paths are relative
// to $HOME unless they start with "$XDG_CONFIG_HOME".
export const BROWSER_ROOTS = [
  { browser: "Firefox", dirs: [".mozilla/firefox", "$XDG_CONFIG_HOME/mozilla/firefox"] },
  { browser: "Firefox (Snap)", dirs: ["snap/firefox/common/.mozilla/firefox"] },
  { browser: "Firefox (Flatpak)", dirs: [".var/app/org.mozilla.firefox/.mozilla/firefox", ".var/app/org.mozilla.firefox/config/mozilla/firefox"] },
  { browser: "LibreWolf", dirs: [".librewolf", ".var/app/io.gitlab.librewolf-community/.librewolf"] },
  { browser: "Waterfox", dirs: [".waterfox", ".var/app/net.waterfox.waterfox/.waterfox"] },
  { browser: "Floorp", dirs: [".floorp", ".var/app/one.ablaze.floorp/.floorp"] },
  { browser: "Zen", dirs: [".zen", ".var/app/app.zen_browser.zen/.zen"] },
  { browser: "Mullvad Browser", dirs: [".mullvad-browser"] },
  { browser: "Emberfox", legacy: true, dirs: [".emberfox/emberfox", "$XDG_CONFIG_HOME/emberfox/emberfox", ".var/app/dev.rxvy.Emberfox/.emberfox/emberfox"] },
  { browser: "Ignifox (another profile)", self: true, dirs: [".ignifox/ignifox", "$XDG_CONFIG_HOME/ignifox/ignifox", ".var/app/dev.rxvy.Ignifox/.ignifox/ignifox"] },
];

/** Parse a profiles.ini. Returns [{ name, path, isDefault }] with absolute paths. */
export function parseProfilesIni(text, rootDir) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.Path) {
      const rel = cur.IsRelative !== "0";
      const path = rel ? `${rootDir.replace(/\/+$/, "")}/${cur.Path}` : cur.Path;
      out.push({ name: cur.Name || cur.Path, path, isDefault: cur.Default === "1" });
    }
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      flush();
      cur = /^Profile\d+$/i.test(sec[1]) ? {} : null;
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && cur) cur[kv[1].trim()] = kv[2].trim();
  }
  flush();
  return out;
}

/** Parse prefs.js user_pref lines into a Map(key -> value). Ignores anything it can't read safely. */
export function parsePrefsJs(text) {
  const prefs = new Map();
  const re = /^\s*user_pref\(\s*"((?:[^"\\]|\\.)+)"\s*,\s*(.+?)\s*\)\s*;\s*$/gm;
  let m;
  while ((m = re.exec(String(text)))) {
    const raw = m[2];
    let v;
    if (raw === "true" || raw === "false") v = raw === "true";
    else if (/^-?\d+$/.test(raw)) v = parseInt(raw, 10);
    else if (/^"(?:[^"\\]|\\.)*"$/.test(raw)) {
      try { v = JSON.parse(raw); } catch (e) { continue; }
    } else continue;
    prefs.set(m[1].replace(/\\(.)/g, "$1"), v);
  }
  return prefs;
}

/** Emberfox -> Ignifox setting names. Returns [key, value] or null to drop. */
export function mapLegacyPref(key, value) {
  if (key.startsWith("ember.")) key = "ignifox." + key.slice(6);
  if (key == "ignifox.fx.emberStrip") key = "ignifox.fx.accentStrip";
  if (key == "ignifox.theme.preset" && value == "ember") value = "ignis";
  if (key == "ignifox.firstrun.done" || key.startsWith("ignifox.update.") || key == "ignifox.customcss.rev") return null;
  return [key, value];
}

// Firefox settings worth bringing along besides the ones Studio already manages.
export const EXTRA_IMPORT_PREFS = {
  "browser.startup.homepage": "string",
  "browser.download.dir": "string",
  "browser.download.folderList": "int",
  "browser.download.useDownloadDir": "bool",
  "intl.accept_languages": "string",
  "font.name.sans-serif.x-western": "string",
  "font.name.serif.x-western": "string",
  "font.name.monospace.x-western": "string",
  "font.size.variable.x-western": "int",
  "font.minimum-size.x-western": "int",
  "browser.display.use_document_fonts": "int",
  "browser.toolbars.bookmarks.visibility": "string",
  "browser.urlbar.trimURLs": "bool",
};

// Things that can only be swapped while the browser is closed (applied by the launcher).
export const STAGED_ITEMS = {
  passwords: { label: "Saved passwords", files: ["logins.json", "key4.db"] },
  cookies: { label: "Logins & cookies (stay signed in)", files: ["cookies.sqlite", "cookies.sqlite-wal"] },
  tabs: { label: "Open tabs from last session", files: ["sessionstore.jsonlz4"] },
  forms: { label: "Form & search history", files: ["formhistory.sqlite"] },
};

// ----------------------------------------------------------------- fonts
export const FONT_EXTS = ["ttf", "otf", "ttc", "woff", "woff2"];

function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
function u32(b, o) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
function tag(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

function readNameTable(b, off) {
  const count = u16(b, off + 2), strOff = off + u16(b, off + 4);
  let best = null, bestScore = -1;
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    const platform = u16(b, r), enc = u16(b, r + 2), lang = u16(b, r + 4), id = u16(b, r + 6);
    const len = u16(b, r + 8), so = strOff + u16(b, r + 10);
    if (id != 1 && id != 16) continue;
    let s = "";
    if (platform == 3 || platform == 0) {
      for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(u16(b, so + j));
    } else if (platform == 1 && enc == 0) {
      for (let j = 0; j < len; j++) s += String.fromCharCode(b[so + j]);
    } else continue;
    // prefer typographic family (16), Windows English, then anything
    const score = (id == 16 ? 4 : 0) + (platform == 3 ? 2 : 0) + (lang == 0x409 || lang == 0 ? 1 : 0);
    if (s.trim() && score > bestScore) { best = s.trim(); bestScore = score; }
  }
  return best;
}

function sfntFamily(b, base = 0) {
  const n = u16(b, base + 4);
  for (let i = 0; i < n; i++) {
    const r = base + 12 + i * 16;
    if (tag(b, r) == "name") return readNameTable(b, u32(b, r + 8));
  }
  return null;
}

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** Family name from font bytes (TTF/OTF/TTC/WOFF). WOFF2 needs Brotli, so it returns null. */
export async function fontFamilyFromBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12) return null;
  try {
    const t = tag(b, 0);
    if (t == "ttcf") return sfntFamily(b, u32(b, 12));
    if (t == "OTTO" || t == "true" || u32(b, 0) == 0x00010000) return sfntFamily(b);
    if (t == "wOFF" && typeof DecompressionStream != "undefined") {
      const n = u16(b, 12);
      for (let i = 0; i < n; i++) {
        const r = 44 + i * 20;
        if (tag(b, r) != "name") continue;
        const off = u32(b, r + 4), comp = u32(b, r + 8), orig = u32(b, r + 12);
        let tbl = b.subarray(off, off + comp);
        if (comp < orig) tbl = await inflate(tbl);
        return readNameTable(tbl, 0);
      }
    }
  } catch (e) {}
  return null;
}

export function fontFileStem(name) {
  return String(name).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Imported font";
}

export function safeFontFileName(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  if (!FONT_EXTS.includes(ext)) return null;
  const stem = String(name).slice(0, -(ext.length + 1)).replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(0, 80) || "font";
  return `${stem}.${ext}`;
}

// ----------------------------------------------------------------- looks
// One-click looks: a bundle of settings. Theme included so each look reads as a whole.
export const LOOKS = {
  classic: {
    name: "Classic", blurb: "Tabs on top, the Ignis fire theme, nothing surprising.",
    prefs: {
      "ignifox.theme.preset": "ignis", "ignifox.layout.tabs": "top", "ignifox.tabs.style": "default",
      "ignifox.shape.radius": 8, "ignifox.layout.floatingContent": false, "ignifox.layout.autohide": false,
      "ignifox.layout.compactNavbar": false, "ignifox.layout.urlbarCentered": false, "ignifox.font.family": "",
      "ignifox.frame.style": "solid", "ignifox.tabs.multirow": false, "browser.uidensity": 0,
    },
  },
  zen: {
    name: "Zen-style", blurb: "Vertical tabs that expand on hover, the page as a floating card, pill shapes.",
    prefs: {
      "ignifox.theme.preset": "obsidian", "ignifox.layout.tabs": "vertical", "sidebar.visibility": "expand-on-hover",
      "ignifox.tabs.style": "pill", "ignifox.shape.radius": 12, "ignifox.layout.floatingContent": true,
      "ignifox.layout.contentGap": 8, "ignifox.layout.compactNavbar": true, "ignifox.layout.urlbarCentered": true,
      "ignifox.layout.autohide": false, "ignifox.frame.style": "solid", "ignifox.tabs.multirow": false,
    },
  },
  arc: {
    name: "Arc-like", blurb: "Always-open vertical tab sidebar, big rounded card, neon Synthwave.",
    prefs: {
      "ignifox.theme.preset": "synthwave", "ignifox.layout.tabs": "vertical", "sidebar.visibility": "always-show",
      "ignifox.tabs.style": "pill", "ignifox.shape.radius": 14, "ignifox.layout.floatingContent": true,
      "ignifox.layout.contentGap": 10, "ignifox.layout.compactNavbar": true, "ignifox.frame.style": "gradient",
      "ignifox.tabs.multirow": false,
    },
  },
  chrome: {
    name: "Chrome-like", blurb: "Familiar rounded tabs on top and a roomy toolbar, in muted Ash.",
    prefs: {
      "ignifox.theme.preset": "ash", "ignifox.layout.tabs": "top", "ignifox.tabs.style": "default",
      "ignifox.shape.radius": 10, "ignifox.layout.floatingContent": false, "ignifox.layout.compactNavbar": false,
      "ignifox.layout.tabCloseHover": false, "ignifox.layout.autohide": false, "ignifox.frame.style": "solid",
      "browser.uidensity": 0,
    },
  },
  minimal: {
    name: "Minimal", blurb: "Pitch-black OLED, toolbars hide until you need them, no extra buttons.",
    prefs: {
      "ignifox.theme.preset": "void", "ignifox.layout.tabs": "top", "ignifox.layout.autohide": true,
      "ignifox.layout.compactNavbar": true, "ignifox.hide.newTabButton": true, "ignifox.hide.allTabsButton": true,
      "ignifox.hide.extensionsButton": true, "ignifox.layout.tabCloseHover": true, "ignifox.tabs.style": "underline",
      "ignifox.layout.urlbarMaxWidth": 900, "browser.uidensity": 1, "ignifox.frame.style": "solid",
    },
  },
  hacker: {
    name: "Hacker / TTY", blurb: "Monospace everything, square corners, toxic green on black.",
    prefs: {
      "ignifox.theme.preset": "toxic", "ignifox.font.family": "monospace", "ignifox.tabs.style": "boxy",
      "ignifox.shape.radius": 0, "ignifox.layout.compactMenus": true, "ignifox.layout.compactNavbar": true,
      "ignifox.layout.tabs": "top", "ignifox.newtab.wallpaper": "none", "ignifox.newtab.layout": "minimal",
      "ignifox.newtab.tileStyle": "square", "browser.uidensity": 1, "ignifox.frame.style": "solid",
    },
  },
};

// --------------------------------------------------------- context menu
export const MENU_ITEMS = {
  ai: { label: "AI: Ask chatbot, AI tab, smart window, visual search", ids: ["context-ask-chat", "context-create-aitab", "context-openlinksmartwindow", "context-visual-search"] },
  sendToDevice: { label: "Send page/link to device", ids: ["context-sendpagetodevice", "context-sendlinktodevice", "context-sep-sendpagetodevice", "context-sep-sendlinktodevice"] },
  translate: { label: "Translate selection", ids: ["context-translate-selection"] },
  screenshot: { label: "Take screenshot", ids: ["context-take-screenshot", "context-sep-screenshots"] },
  highlights: { label: "Copy link to highlight", ids: ["context-copy-link-to-highlight", "context-copy-clean-link-to-highlight", "context-remove-highlight", "context-sep-highlights"] },
  containers: { label: "Open link in container tab", ids: ["context-openlinkincontainertab", "context-openlinkinusercontext-menu"] },
  splitView: { label: "Open link in split view", ids: ["context-openlinkinsplitview"] },
  bookmarkLink: { label: "Bookmark link", ids: ["context-bookmarklink"] },
  saveLink: { label: "Save link as…", ids: ["context-savelink"] },
  printSelection: { label: "Print selection", ids: ["context-print-selection"] },
  background: { label: "Set image as desktop background", ids: ["context-setDesktopBackground", "context-sep-setbackground"] },
  imageText: { label: "Copy text from image", ids: ["context-imagetext"] },
  inspectA11y: { label: "Inspect accessibility properties", ids: ["context-inspect-a11y"] },
  viewSource: { label: "View page source", ids: ["context-viewsource", "context-viewpartialsource-selection"] },
};

export function menuHideCSS(keys) {
  const ids = [...new Set(String(keys || "").split(",").map(k => k.trim()).filter(k => MENU_ITEMS[k]).flatMap(k => MENU_ITEMS[k].ids))];
  return ids.length ? `${ids.map(id => "#" + id).join(",\n")} { display: none !important; }\n` : "";
}

// ------------------------------------------------------ recommended add-ons
// slug = addons.mozilla.org short name (used in the download URL)
export const RECOMMENDED_ADDONS = [
  { slug: "darkreader", name: "Dark Reader", match: "dark reader", blurb: "Dark mode for every website, tuned per site." },
  { slug: "sponsorblock", name: "SponsorBlock", match: "sponsorblock", blurb: "Skips sponsor segments in YouTube videos." },
  { slug: "sidebery", name: "Sidebery", match: "sidebery", blurb: "Tree-style vertical tabs with panels and groups." },
  { slug: "bitwarden-password-manager", name: "Bitwarden", match: "bitwarden", blurb: "Open-source password manager." },
  { slug: "return-youtube-dislikes", name: "Return YouTube Dislike", match: "return youtube dislike", blurb: "Shows dislike counts again." },
  { slug: "dearrow", name: "DeArrow", match: "dearrow", blurb: "Replaces clickbait YouTube titles and thumbnails." },
  { slug: "styl-us", name: "Stylus", match: "stylus", blurb: "Restyle any website with user styles." },
  { slug: "privacy-badger17", name: "Privacy Badger", match: "privacy badger", blurb: "Learns to block invisible trackers." },
  { slug: "multi-account-containers", name: "Multi-Account Containers", match: "multi-account containers", blurb: "Manage container tabs with colors and rules." },
];

export function amoDownloadURL(slugOrId) {
  return `https://addons.mozilla.org/firefox/downloads/latest/${encodeURIComponent(slugOrId)}/latest.xpi`;
}

// ------------------------------------------------------------ surprise me
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A random but always-readable dark palette. rng() returns [0,1). */
export function randomPalette(rng = Math.random) {
  const h = Math.floor(rng() * 360);
  const ha = (h + 20 + Math.floor(rng() * 160)) % 360;
  const sat = 15 + Math.floor(rng() * 25);
  const bg = hsl(h, sat, 5);
  const as = 85 + Math.floor(rng() * 15);
  // deep blues/violets are dark at the same lightness: brighten until they read on bg
  let l = 58, accent = hsl(ha, as, l);
  while (contrast(accent, bg) < 4.5 && l < 85) accent = hsl(ha, as, (l += 3));
  return {
    bg, bg2: hsl(h, sat, 9), bg3: hsl(h, sat, 14),
    fg: hsl(h, 15, 93), fgDim: hsl(h, 10, 64),
    accent, accent2: hsl((ha + 35) % 360, 95, Math.min(88, l + 12)),
  };
}

// --------------------------------------------------------------- news feeds
const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeXML(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")                                    // markup inside titles
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] == "#") {
        const n = e[1].toLowerCase() == "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return XML_ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeXML(m[1]) : "";
}

/**
 * Pulls { title, link, date } items out of an RSS 2.0, RSS 1.0 or Atom feed. Deliberately
 * simple text parsing: it never fetches anything the feed points at and ignores everything
 * except titles, links and dates. Only http(s) links survive.
 */
export function parseFeed(xml, limit = 20) {
  const text = String(xml || "");
  const source = firstTag(text.replace(/<(item|entry)[\s>][\s\S]*$/i, ""), "title");
  const items = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(text)) && items.length < limit) {
    const block = m[2];
    let link = "";
    if (m[1].toLowerCase() == "entry") {
      const alt = /<link\b[^>]*rel=["']alternate["'][^>]*>/i.exec(block) || /<link\b[^>]*>/i.exec(block);
      const href = alt && /href=["']([^"']+)["']/i.exec(alt[0]);
      link = href ? decodeXML(href[1]) : "";
    } else {
      link = firstTag(block, "link") || firstTag(block, "guid");
    }
    const title = firstTag(block, "title");
    const date = firstTag(block, "pubDate") || firstTag(block, "updated") || firstTag(block, "published") || firstTag(block, "dc:date");
    if (!/^https?:\/\//i.test(link) || !title) {
      continue;
    }
    items.push({ title: title.slice(0, 200), link, date, source: source.slice(0, 60) });
  }
  return items;
}

/** Feed URLs from the settings box: one per line, http(s) only, at most 8. */
export function feedURLs(text) {
  return String(text || "")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => /^https?:\/\/[^\s]+$/i.test(s))
    .slice(0, 8);
}

/** Newest first across all feeds, a few from each first so one busy feed can't crowd out the rest. */
export function mergeFeeds(lists, count = 6) {
  const t = it => { const n = Date.parse(it.date); return Number.isFinite(n) ? n : 0; };
  const newest = items => [...items].sort((a, b) => t(b) - t(a));
  const per = Math.max(1, Math.floor(count / Math.max(1, lists.length)));
  const picked = lists.flatMap(l => l.slice(0, per));
  const rest = newest(lists.flatMap(l => l.slice(per)));
  return newest([...picked, ...rest.slice(0, Math.max(0, count - picked.length))]).slice(0, count);
}
