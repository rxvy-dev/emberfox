/* Ignifox Studio: importing font files.
 *
 * Fonts go to ~/.local/share/fonts/ignifox/ (the standard per-user font folder),
 * so websites, the new tab page and every other app on the system can use them.
 * They're also registered right away for the browser's own interface through
 * an @font-face sheet, so there's no wait for the system font cache. */

import { FONT_EXTS, fontFamilyFromBytes, fontFileStem, safeFontFileName } from "chrome://ignifox/content/data.sys.mjs";

export function fontsDir() {
  const base = Services.env.get("XDG_DATA_HOME") || PathUtils.join(Services.dirsvc.get("Home", Ci.nsIFile).path, ".local", "share");
  return PathUtils.join(base, "fonts", "ignifox");
}

export function fontFaceSheetPath() {
  return PathUtils.join(PathUtils.profileDir, "chrome", "ignifox-fonts.css");
}

const familyCache = new Map(); // path+mtime -> family

async function familyOf(path) {
  const st = await IOUtils.stat(path);
  const key = `${path}:${st.lastModified}`;
  if (familyCache.has(key)) return familyCache.get(key);
  let fam = null;
  try {
    fam = await fontFamilyFromBytes(await IOUtils.read(path));
  } catch (e) {}
  fam ||= fontFileStem(PathUtils.filename(path));
  familyCache.set(key, fam);
  return fam;
}

/** [{ file, path, family, ext, size }] */
export async function listImported() {
  const dir = fontsDir();
  if (!(await IOUtils.exists(dir))) return [];
  const out = [];
  for (const path of await IOUtils.getChildren(dir)) {
    const file = PathUtils.filename(path);
    const ext = file.split(".").pop().toLowerCase();
    if (!FONT_EXTS.includes(ext)) continue;
    const st = await IOUtils.stat(path);
    out.push({ file, path, ext, size: st.size, family: await familyOf(path) });
  }
  return out.sort((a, b) => a.family.localeCompare(b.family));
}

/** Save a picked font file. Returns { file, family } or throws. */
export async function importFont(name, bytes) {
  const file = safeFontFileName(name);
  if (!file) throw new Error("Not a font file (use .ttf, .otf, .ttc, .woff or .woff2)");
  if (bytes.length > 60 * 1024 * 1024) throw new Error("That font is over 60 MB");
  const dir = fontsDir();
  await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
  const path = PathUtils.join(dir, file);
  await IOUtils.write(path, bytes);
  const family = await familyOf(path);
  await writeFontFaceSheet();
  return { file, family };
}

export async function removeFont(file) {
  await IOUtils.remove(PathUtils.join(fontsDir(), PathUtils.filename(file)), { ignoreAbsent: true });
  await writeFontFaceSheet();
}

export function fontFaceCSS(fonts) {
  const fmt = { ttf: "truetype", otf: "opentype", ttc: "collection", woff: "woff", woff2: "woff2" };
  return fonts.map(f =>
    `@font-face {\n  font-family: "${f.family.replace(/["\\]/g, "")}";\n  src: url("${PathUtils.toFileURI(f.path)}") format("${fmt[f.ext] || "truetype"}");\n  font-display: swap;\n}\n`).join("");
}

/** Rewrite the interface @font-face sheet and tell open windows to reload it. */
export async function writeFontFaceSheet() {
  const fonts = await listImported();
  const path = fontFaceSheetPath();
  await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
  await IOUtils.writeUTF8(path, `/* Written by Ignifox Studio: fonts you imported. */\n${fontFaceCSS(fonts)}`);
  const rev = Services.prefs.getIntPref("ignifox.fonts.rev", 0);
  Services.prefs.setIntPref("ignifox.fonts.rev", rev + 1);
  return fonts;
}

/** Families installed on the system (plus imported ones), for pickers. */
export async function systemFamilies() {
  try {
    const en = Cc["@mozilla.org/gfx/fontenumerator;1"].createInstance(Ci.nsIFontEnumerator);
    const list = await en.EnumerateFontsAsync("x-western", "");
    return [...new Set(list)].sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return [];
  }
}
