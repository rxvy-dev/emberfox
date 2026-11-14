/* Ignifox Studio: importing from Firefox-family browsers and older Emberfox installs.
 *
 * Live (no restart): bookmarks, history, settings, custom CSS / userChrome,
 *   new tab wallpaper, extensions (reinstalled from addons.mozilla.org).
 * Staged (applied by the ignifox launcher before the next start, because the
 *   browser keeps these files open): passwords, cookies, open tabs, form history.
 * Source profiles are only ever read, never changed. */

import {
  BROWSER_ROOTS,
  EXTRA_IMPORT_PREFS,
  STAGED_ITEMS,
  amoDownloadURL,
  mapLegacyPref,
  parsePrefsJs,
  parseProfilesIni,
} from "chrome://ignifox/content/data.sys.mjs";
import { IGNI_PREFS, NATIVE_PREFS, writePref } from "chrome://ignifox/content/prefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
});

const HISTORY_DAYS = 365;
const HISTORY_MAX_VISITS = 150000;

function home() {
  return Services.dirsvc.get("Home", Ci.nsIFile).path;
}
function xdgConfig() {
  return Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(home(), ".config");
}
function expand(dir) {
  return dir.startsWith("$XDG_CONFIG_HOME/") ? PathUtils.join(xdgConfig(), ...dir.slice(17).split("/")) : PathUtils.join(home(), ...dir.split("/"));
}
async function exists(p) {
  try {
    return await IOUtils.exists(p);
  } catch (e) {
    return false;
  }
}

/** Every Firefox-family profile on this machine except the one we're running in. */
export async function findProfiles() {
  const mine = PathUtils.profileDir;
  const found = [];
  const seen = new Set([mine]);
  for (const root of BROWSER_ROOTS) {
    for (const d of root.dirs) {
      const dir = expand(d);
      const ini = PathUtils.join(dir, "profiles.ini");
      if (!(await exists(ini))) continue;
      let list = [];
      try {
        list = parseProfilesIni(await IOUtils.readUTF8(ini), dir);
      } catch (e) {
        continue;
      }
      for (const p of list) {
        if (seen.has(p.path) || !(await exists(PathUtils.join(p.path, "prefs.js")))) continue;
        seen.add(p.path);
        let modified = 0;
        try {
          modified = (await IOUtils.stat(PathUtils.join(p.path, "prefs.js"))).lastModified;
        } catch (e) {}
        found.push({
          browser: root.browser,
          legacy: !!root.legacy,
          name: p.name,
          path: p.path,
          isDefault: p.isDefault,
          modified,
          hasPlaces: await exists(PathUtils.join(p.path, "places.sqlite")),
          hasLogins: await exists(PathUtils.join(p.path, "logins.json")),
          running: await isLocked(p.path),
        });
      }
    }
  }
  found.sort((a, b) => b.modified - a.modified);
  return found;
}

/** Is another browser using this profile right now? (Firefox's lock symlink points at a live PID.) */
async function isLocked(dir) {
  try {
    const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    f.initWithPath(PathUtils.join(dir, "lock"));
    if (!f.isSymlink()) return false;
    const pid = parseInt(/\+(\d+)$/.exec(f.target)?.[1] || "0", 10);
    return pid > 0 && (await exists(`/proc/${pid}`));
  } catch (e) {
    return false;
  }
}

async function copyDb(src, name) {
  const tmp = PathUtils.join(PathUtils.tempDir, `ignifox-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await IOUtils.makeDirectory(tmp);
  for (const suffix of ["", "-wal"]) {
    const from = PathUtils.join(src, name + suffix);
    if (await exists(from)) await IOUtils.copy(from, PathUtils.join(tmp, name + suffix));
  }
  return { dir: tmp, path: PathUtils.join(tmp, name) };
}

const OK_URL = /^(https?|ftp|file|about|moz-extension|javascript|data):/i;

// ------------------------------------------------------------ bookmarks
export async function importBookmarks(profile) {
  const { dir, path } = await copyDb(profile.path, "places.sqlite");
  const db = await lazy.Sqlite.openConnection({ path });
  let rows;
  try {
    rows = await db.execute(`SELECT b.id, b.parent, b.type, b.title, b.position, b.guid, p.url
                             FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id
                             ORDER BY b.parent, b.position`);
  } finally {
    await db.close();
    await IOUtils.remove(dir, { recursive: true }).catch(() => {});
  }
  const PU = lazy.PlacesUtils;
  const byParent = new Map();
  const byGuid = new Map();
  for (const r of rows) {
    const n = { id: r.getResultByName("id"), parent: r.getResultByName("parent"), type: r.getResultByName("type"),
      title: r.getResultByName("title") || "", guid: r.getResultByName("guid"), url: r.getResultByName("url") };
    byGuid.set(n.guid, n);
    if (!byParent.has(n.parent)) byParent.set(n.parent, []);
    byParent.get(n.parent).push(n);
  }
  let count = 0;
  const build = node => {
    const kids = [];
    for (const c of byParent.get(node.id) || []) {
      if (c.type == 1 && c.url && OK_URL.test(c.url)) {
        kids.push({ type: PU.bookmarks.TYPE_BOOKMARK, title: c.title, url: c.url });
        count++;
      } else if (c.type == 2) {
        const children = build(c);
        if (children.length) kids.push({ type: PU.bookmarks.TYPE_FOLDER, title: c.title || "Folder", children });
      } else if (c.type == 3) {
        kids.push({ type: PU.bookmarks.TYPE_SEPARATOR });
      }
    }
    return kids;
  };
  const label = `${profile.browser} (${profile.name})`;
  const tb = byGuid.get("toolbar_____"), menu = byGuid.get("menu________"), other = byGuid.get("unfiled_____");
  const tbKids = tb ? build(tb) : [];
  const menuKids = menu ? build(menu) : [];
  const otherKids = other ? build(other) : [];

  // If our toolbar is empty, put their toolbar straight onto it so the bar looks like home.
  const myToolbar = await PU.promiseBookmarksTree(PU.bookmarks.toolbarGuid).catch(() => null);
  const toolbarEmpty = !myToolbar?.children?.length;
  if (tbKids.length && toolbarEmpty) {
    await PU.bookmarks.insertTree({ guid: PU.bookmarks.toolbarGuid, children: tbKids });
  }
  const folder = [];
  if (tbKids.length && !toolbarEmpty) folder.push({ type: PU.bookmarks.TYPE_FOLDER, title: "Bookmarks Toolbar", children: tbKids });
  folder.push(...menuKids);
  if (otherKids.length) folder.push({ type: PU.bookmarks.TYPE_FOLDER, title: "Other Bookmarks", children: otherKids });
  if (folder.length) {
    await PU.bookmarks.insertTree({
      guid: PU.bookmarks.menuGuid,
      children: [{ type: PU.bookmarks.TYPE_FOLDER, title: `From ${label}`, children: folder }],
    });
  }
  return count;
}

// -------------------------------------------------------------- history
export async function importHistory(profile) {
  const { dir, path } = await copyDb(profile.path, "places.sqlite");
  const db = await lazy.Sqlite.openConnection({ path });
  const since = (Date.now() - HISTORY_DAYS * 86400000) * 1000;
  const pages = new Map();
  try {
    const rows = await db.execute(
      `SELECT p.url, p.title, v.visit_date, v.visit_type FROM moz_historyvisits v
       JOIN moz_places p ON p.id = v.place_id
       WHERE v.visit_date > :since AND (p.url LIKE 'http://%' OR p.url LIKE 'https://%')
       ORDER BY v.visit_date DESC LIMIT ${HISTORY_MAX_VISITS}`, { since });
    for (const r of rows) {
      const url = r.getResultByName("url");
      let pg = pages.get(url);
      if (!pg) {
        pg = { url, title: r.getResultByName("title") || undefined, visits: [] };
        pages.set(url, pg);
      }
      const t = r.getResultByName("visit_type");
      pg.visits.push({ date: new Date(r.getResultByName("visit_date") / 1000), transition: t >= 1 && t <= 9 ? t : 1 });
    }
  } finally {
    await db.close();
    await IOUtils.remove(dir, { recursive: true }).catch(() => {});
  }
  const all = [...pages.values()];
  for (let i = 0; i < all.length; i += 500) {
    try {
      await lazy.PlacesUtils.history.insertMany(all.slice(i, i + 500));
    } catch (e) {
      console.warn("[Ignifox] history chunk skipped", e);
    }
  }
  return all.length;
}

// ------------------------------------------------------------- settings
export async function importSettings(profile) {
  const text = await IOUtils.readUTF8(PathUtils.join(profile.path, "prefs.js"));
  const src = parsePrefsJs(text);
  let n = 0;
  for (let [key, value] of src) {
    if (profile.legacy) {
      const mapped = mapLegacyPref(key, value);
      if (!mapped) continue;
      [key, value] = mapped;
    }
    const type = IGNI_PREFS[key]?.type || NATIVE_PREFS[key] || EXTRA_IMPORT_PREFS[key];
    if (!type) continue;
    if (key.startsWith("ignifox.") && !profile.legacy) continue;
    const ok = (type == "bool" && typeof value == "boolean") || (type == "int" && typeof value == "number") || (type == "string" && typeof value == "string");
    if (!ok) continue;
    try {
      if (writePref(Services.prefs, key, type, value)) n++;
    } catch (e) {}
  }
  return n;
}

// ------------------------------------------------- CSS, chrome folder, wallpaper
export async function importChromeFolder(profile, { setWallpaper } = {}) {
  const mineChrome = PathUtils.join(PathUtils.profileDir, "chrome");
  await IOUtils.makeDirectory(mineChrome, { ignoreExisting: true });
  let n = 0;
  const srcChrome = PathUtils.join(profile.path, "chrome");
  if (await exists(srcChrome)) {
    const walk = async (from, to) => {
      await IOUtils.makeDirectory(to, { ignoreExisting: true });
      for (const child of await IOUtils.getChildren(from)) {
        const name = PathUtils.filename(child);
        let dest = PathUtils.join(to, name == "ember-custom.css" ? "ignifox-custom.css" : name);
        const info = await IOUtils.stat(child);
        if (info.type == "directory") {
          await walk(child, dest);
        } else if (!(await exists(dest))) {
          await IOUtils.copy(child, dest);
          n++;
        } else if (/\.css$/.test(name)) {
          // both have this file: keep ours, append theirs below a marker
          const theirs = await IOUtils.readUTF8(child);
          const ours = await IOUtils.readUTF8(dest);
          if (!ours.includes(theirs.trim())) {
            await IOUtils.writeUTF8(dest, `${ours}\n\n/* ---- imported from ${profile.browser} (${profile.name}) ---- */\n${theirs}\n`);
            n++;
          }
        }
      }
    };
    await walk(srcChrome, mineChrome);
  }
  // Emberfox new tab wallpaper
  if (profile.legacy && setWallpaper) {
    const nt = PathUtils.join(profile.path, "ember-newtab");
    if (await exists(nt)) {
      for (const child of await IOUtils.getChildren(nt)) {
        const m = /wallpaper-\d+\.(\w+)$/.exec(child);
        if (m) {
          await setWallpaper(await IOUtils.read(child), m[1]);
          n++;
          break;
        }
      }
    }
  }
  return n;
}

// ------------------------------------------------------------ extensions
export async function listExtensions(profile) {
  const p = PathUtils.join(profile.path, "extensions.json");
  if (!(await exists(p))) return [];
  let data;
  try {
    data = JSON.parse(await IOUtils.readUTF8(p));
  } catch (e) {
    return [];
  }
  const out = [];
  for (const a of data.addons || []) {
    if (a.location != "app-profile" || !["extension", "theme"].includes(a.type)) continue;
    if (a.id.endsWith("@mozilla.org") || a.id.endsWith("@search.mozilla.org")) continue;
    const name = a.defaultLocale?.name || a.id;
    let installed = false;
    try {
      installed = !!(await lazy.AddonManager.getAddonByID(a.id));
    } catch (e) {}
    out.push({ id: a.id, name, type: a.type, enabled: a.active !== false && !a.userDisabled, installed });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/** Install from addons.mozilla.org by id or slug. Resolves to "ok" | "missing" | error text. */
export async function installAddon(idOrSlug) {
  try {
    const install = await lazy.AddonManager.getInstallForURL(amoDownloadURL(idOrSlug), {
      telemetryInfo: { source: "ignifox-studio" },
    });
    await install.install();
    return "ok";
  } catch (e) {
    const msg = String(e?.message || e);
    return /404|DOWNLOAD|network/i.test(msg) ? "missing" : msg;
  }
}

// ------------------------------------------------------------ staged items
export function launcherAvailable() {
  return Services.env.get("IGNIFOX_LAUNCHER") == "1";
}

function stateDir() {
  const base = Services.env.get("XDG_STATE_HOME") || PathUtils.join(home(), ".local", "state");
  return PathUtils.join(base, "ignifox");
}

/** Copy chosen files into <profile>/ignifox-import/files and point the launcher at them. */
export async function stageImport(profile, keys) {
  const base = PathUtils.join(PathUtils.profileDir, "ignifox-import");
  const files = PathUtils.join(base, "files");
  await IOUtils.remove(files, { recursive: true, ignoreAbsent: true });
  await IOUtils.makeDirectory(files, { createAncestors: true });
  const staged = [];
  for (const key of keys) {
    const item = STAGED_ITEMS[key];
    if (!item) continue;
    for (const f of item.files) {
      let from = PathUtils.join(profile.path, f);
      if (f == "sessionstore.jsonlz4") {
        // a running browser keeps its live session in sessionstore-backups/recovery.jsonlz4
        const rec = PathUtils.join(profile.path, "sessionstore-backups", "recovery.jsonlz4");
        if (await exists(rec)) {
          const a = await IOUtils.stat(rec).catch(() => null);
          const b = await IOUtils.stat(from).catch(() => null);
          if (!b || (a && a.lastModified > b.lastModified)) from = rec;
        }
      }
      if (await exists(from)) {
        await IOUtils.copy(from, PathUtils.join(files, f));
        staged.push(f);
      }
    }
  }
  if (!staged.length) return [];
  if (keys.includes("tabs")) {
    Services.prefs.setBoolPref("browser.sessionstore.resume_session_once", true);
  }
  await IOUtils.writeJSON(PathUtils.join(base, "pending.json"), {
    created: new Date().toISOString(), source: `${profile.browser} (${profile.name})`, files: staged,
  });
  const sd = stateDir();
  await IOUtils.makeDirectory(sd, { createAncestors: true, ignoreExisting: true });
  await IOUtils.writeUTF8(PathUtils.join(sd, "pending-import"), PathUtils.profileDir + "\n");
  return staged;
}

/** Ask the launcher to apply staged files and reopen, then close the browser. */
export async function restartToFinishImport() {
  const sd = stateDir();
  await IOUtils.writeUTF8(PathUtils.join(sd, "relaunch"), "1\n");
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
}

export async function pendingImport() {
  try {
    return await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "ignifox-import", "pending.json"));
  } catch (e) {
    return null;
  }
}

export async function cancelPendingImport() {
  await IOUtils.remove(PathUtils.join(PathUtils.profileDir, "ignifox-import", "pending.json"), { ignoreAbsent: true });
  await IOUtils.remove(PathUtils.join(stateDir(), "pending-import"), { ignoreAbsent: true });
}

export function currentLoginCount() {
  try {
    return Services.logins.countLogins("", "", "");
  } catch (e) {
    return 0;
  }
}
