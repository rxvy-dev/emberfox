import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "../studio/content/data.sys.mjs";
import * as M from "../studio/content/prefs.sys.mjs";

const here = p => new URL(p, import.meta.url);

test("font family from a TTF", async () => {
  assert.equal(await D.fontFamilyFromBytes(readFileSync(here("../studio/content/fonts/MetalMania-Regular.ttf"))), "Metal Mania");
});

test("font family from a WOFF (compressed name table)", async () => {
  assert.equal(await D.fontFamilyFromBytes(readFileSync(here("fixtures/MetalMania.woff"))), "Metal Mania");
});

test("garbage bytes give no family instead of throwing", async () => {
  assert.equal(await D.fontFamilyFromBytes(new Uint8Array([1, 2, 3])), null);
  assert.equal(await D.fontFamilyFromBytes(new Uint8Array(64).fill(7)), null);
});

test("font file names are sanitized and limited to font types", () => {
  assert.equal(D.safeFontFileName("My Font-Bold.TTF"), "My_Font-Bold.ttf");
  assert.equal(D.safeFontFileName("../../etc/passwd.ttf"), "etc_passwd.ttf");
  assert.equal(D.safeFontFileName("evil.sh"), null);
  assert.equal(D.fontFileStem("JetBrainsMono-Regular.woff2"), "JetBrainsMono Regular");
});

test("profiles.ini: relative and absolute profiles, non-profile sections ignored", () => {
  const ini = "[General]\nStartWithLastProfile=1\n\n[Profile1]\nName=work\nIsRelative=0\nPath=/data/work\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=ab12.default-release\nDefault=1\n\n[Install4F96D1932A9F858E]\nDefault=ab12.default-release\nLocked=1\n";
  assert.deepEqual(D.parseProfilesIni(ini, "/home/u/.mozilla/firefox"), [
    { name: "work", path: "/data/work", isDefault: false },
    { name: "default-release", path: "/home/u/.mozilla/firefox/ab12.default-release", isDefault: true },
  ]);
});

test("prefs.js parsing keeps types and skips anything odd", () => {
  const js = `// Mozilla User Preferences
user_pref("browser.startup.page", 3);
user_pref("browser.startup.homepage", "https://example.org/a\\"b");
user_pref("sidebar.verticalTabs", true);
user_pref("x.weird", someIdentifier);
user_pref("x.float", 1.5);`;
  const p = D.parsePrefsJs(js);
  assert.equal(p.get("browser.startup.page"), 3);
  assert.equal(p.get("browser.startup.homepage"), 'https://example.org/a"b');
  assert.equal(p.get("sidebar.verticalTabs"), true);
  assert.ok(!p.has("x.weird") && !p.has("x.float"));
});

test("Emberfox settings map onto Ignifox ones", () => {
  assert.deepEqual(D.mapLegacyPref("ember.theme.preset", "ember"), ["ignifox.theme.preset", "ignis"]);
  assert.deepEqual(D.mapLegacyPref("ember.fx.emberStrip", true), ["ignifox.fx.accentStrip", true]);
  assert.deepEqual(D.mapLegacyPref("ember.newtab.name", "rxvy"), ["ignifox.newtab.name", "rxvy"]);
  assert.equal(D.mapLegacyPref("ember.update.lastCheck", 5), null);
  assert.deepEqual(D.mapLegacyPref("browser.startup.page", 3), ["browser.startup.page", 3]);
  for (const k of Object.keys(M.IGNI_PREFS)) {
    if (k.startsWith("ignifox.")) {
      const mapped = D.mapLegacyPref("ember." + k.slice(8), M.IGNI_PREFS[k].def);
      if (mapped) assert.ok(M.IGNI_PREFS[mapped[0]] || mapped[0] == "ignifox.fx.accentStrip", mapped[0]);
    }
  }
});

test("every look only sets known prefs with the right type and valid values", () => {
  const enums = {
    "ignifox.layout.tabs": ["top", "bottom", "vertical", "hidden"],
    "ignifox.tabs.style": ["default", "pill", "underline", "boxy"],
    "ignifox.frame.style": ["solid", "gradient", "image"],
    "sidebar.visibility": ["always-show", "expand-on-hover", "hide-sidebar"],
    "ignifox.newtab.layout": ["center", "top", "minimal"],
    "ignifox.newtab.tileStyle": ["rounded", "circle", "square", "minimal"],
    "ignifox.newtab.wallpaper": Object.keys(M.WALLPAPERS),
    "ignifox.theme.preset": Object.keys(M.THEMES),
  };
  for (const [id, look] of Object.entries(D.LOOKS)) {
    for (const [k, v] of Object.entries(look.prefs)) {
      const t = M.typeOf(k);
      assert.ok(t, `${id}: ${k} unknown`);
      assert.equal(typeof v, t == "bool" ? "boolean" : t == "int" ? "number" : "string", `${id}: ${k}`);
      if (enums[k]) assert.ok(enums[k].includes(v), `${id}: ${k}=${v}`);
    }
  }
});

test("menu clean-up builds CSS only from known items", () => {
  assert.equal(D.menuHideCSS(""), "");
  assert.equal(D.menuHideCSS("nope,} body{display:none"), "");
  const css = D.menuHideCSS("screenshot,ai");
  assert.match(css, /#context-take-screenshot/);
  assert.match(css, /#context-ask-chat/);
  assert.ok(css.trim().endsWith("{ display: none !important; }"));
});

test("Surprise me palettes are always readable", () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const contrast = (a, b) => {
    const [x, y] = [M.luminance(a), M.luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (let i = 0; i < 300; i++) {
    const p = D.randomPalette(rng);
    for (const k of M.PALETTE_KEYS) assert.ok(M.isHex(p[k]), `${k}=${p[k]}`);
    for (const bg of ["bg", "bg2", "bg3"]) assert.ok(contrast(p.fg, p[bg]) >= 7, `fg on ${bg}`);
    assert.ok(contrast(p.accent, p.bg) >= 3, `accent on bg: ${p.accent} ${p.bg}`);
  }
});

test("recommended add-ons are unique and download from AMO", () => {
  const slugs = D.RECOMMENDED_ADDONS.map(a => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(D.amoDownloadURL("uBlock0@raymondhill.net"),
    "https://addons.mozilla.org/firefox/downloads/latest/uBlock0%40raymondhill.net/latest.xpi");
});

test("every browser root has at least one directory and the staged items list files", () => {
  for (const r of D.BROWSER_ROOTS) assert.ok(r.dirs.length, r.browser);
  for (const it of Object.values(D.STAGED_ITEMS)) assert.ok(it.files.length);
});
