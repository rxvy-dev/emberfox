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

// ---------------------------------------------------------------- day/night themes
import { activePreset, isDayHour, resolvePalette as resolvePal, THEMES as ALL_THEMES, WALLPAPERS as WALLS } from "../studio/content/prefs.sys.mjs";

test("day/night: hours fall on the right side, including a day that wraps midnight", () => {
  assert.equal(isDayHour(7, 7, 19), true);
  assert.equal(isDayHour(18, 7, 19), true);
  assert.equal(isDayHour(19, 7, 19), false);
  assert.equal(isDayHour(3, 7, 19), false);
  assert.equal(isDayHour(23, 22, 6), true);
  assert.equal(isDayHour(2, 22, 6), true);
  assert.equal(isDayHour(12, 22, 6), false);
  assert.equal(isDayHour(12, 99, "x"), true, "bad hours fall back to 7-19");
});

test("day/night: off uses the preset, time uses the day or night theme", () => {
  const v = { "ignifox.theme.preset": "toxic", "ignifox.theme.auto": "off", "ignifox.theme.day": "frost", "ignifox.theme.night": "void", "ignifox.theme.dayStart": 7, "ignifox.theme.nightStart": 19 };
  assert.equal(activePreset(v, 12), "toxic");
  v["ignifox.theme.auto"] = "time";
  assert.equal(activePreset(v, 12), "frost");
  assert.equal(activePreset(v, 23), "void");
  assert.equal(resolvePal(v, 12).bg, ALL_THEMES.frost.bg);
  assert.equal(resolvePal(v, 23).bg, ALL_THEMES.void.bg);
});

// ---------------------------------------------------------------- news feeds
import { feedURLs, mergeFeeds, parseFeed } from "../studio/content/data.sys.mjs";

test("feeds: RSS 2.0 items with CDATA and entities", () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Arch Linux: Recent news</title>
    <item><title><![CDATA[Valkey &amp; <b>Redis</b>]]></title><link>https://archlinux.org/news/valkey/</link><pubDate>Tue, 11 Nov 2026 10:00:00 +0000</pubDate></item>
    <item><title>Tom &amp; Jerry &#8212; ok</title><link>https://archlinux.org/news/two/</link></item>
    <item><title>bad link</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Valkey & Redis");
  assert.equal(items[0].source, "Arch Linux: Recent news");
  assert.equal(items[1].title, "Tom & Jerry — ok");
});

test("feeds: Atom entries use the alternate link", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
    <entry><title type="html">Post one</title><link rel="self" href="https://x.example/self"/><link rel="alternate" href="https://x.example/one"/><updated>2026-11-10T00:00:00Z</updated></entry>
    <entry><title>Post two</title><link href="https://x.example/two"/></entry></feed>`;
  const items = parseFeed(xml);
  assert.deepEqual(items.map(i => i.link), ["https://x.example/one", "https://x.example/two"]);
});

test("feeds: URL list and merging keeps every feed represented", () => {
  assert.deepEqual(feedURLs("https://a.example/rss\nnot a url\nfile:///etc/passwd  http://b.example/feed"), ["https://a.example/rss", "http://b.example/feed"]);
  const a = Array.from({ length: 10 }, (_, i) => ({ title: "a" + i, link: "https://a/" + i, date: `2026-11-${10 + i}` }));
  const b = [{ title: "b0", link: "https://b/0", date: "2026-01-01" }];
  const merged = mergeFeeds([a, b], 6);
  assert.equal(merged.length, 6);
  assert.ok(merged.some(i => i.title == "b0"), "the quiet feed still shows up");
  assert.equal(merged[0].title, "a9", "newest first");
  assert.equal(mergeFeeds([], 6).length, 0);
});

// ---------------------------------------------------------------- palette, workspaces, panels, keep-list, tint
import { dominantColor, fuzzyScore, parsePanels, parseWorkspaces, siteKept } from "../studio/content/data.sys.mjs";

test("palette: fuzzy matching ranks sensible results first", () => {
  assert.equal(fuzzyScore("xyz", "GitHub"), -1);
  assert.ok(fuzzyScore("gh", "GitHub") > 0);
  assert.ok(fuzzyScore("git", "GitHub") > fuzzyScore("git", "Digital garden"), "prefix beats middle");
  assert.ok(fuzzyScore("wp", "Wallpaper: Flames") > fuzzyScore("wp", "Swap tabs"), "word starts count");
  assert.equal(fuzzyScore("", "anything"), 0);
});

test("workspaces: always one, ids cleaned, duplicates dropped, at most 9", () => {
  assert.deepEqual(parseWorkspaces("nope").map(w => w.id), ["main"]);
  const ws = parseWorkspaces(JSON.stringify([{ id: "a b!", name: "Work" }, { id: "ab" }, { id: "x", icon: "🎮", theme: "toxic" }]));
  assert.deepEqual(ws.map(w => w.id), ["ab", "x"]);
  assert.equal(ws[1].theme, "toxic");
  assert.equal(parseWorkspaces(JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: "w" + i })))).length, 9);
});

test("panels: only http(s) pages", () => {
  const p = parsePanels(JSON.stringify([{ url: "https://discord.com/app" }, { url: "javascript:alert(1)" }, { url: "file:///x" }, { url: "nope" }]));
  assert.deepEqual(p.map(x => x.url), ["https://discord.com/app"]);
  assert.equal(p[0].title, "discord.com");
});

test("auto-delete keep-list covers subdomains and nothing else", () => {
  const keep = "github.com\n*.google.com https://claude.ai/";
  assert.equal(siteKept("github.com", keep), true);
  assert.equal(siteKept("gist.github.com", keep), true);
  assert.equal(siteKept("notgithub.com", keep), false);
  assert.equal(siteKept("mail.google.com", keep), true);
  assert.equal(siteKept("claude.ai", keep), true);
  assert.equal(siteKept("example.com", ""), false);
});

test("site tint: vivid colour from icon pixels, null for grey icons", () => {
  const px = (rgb, n, a = 255) => Array.from({ length: n }, () => [...rgb, a]).flat();
  assert.equal(dominantColor(new Uint8ClampedArray([...px([255, 0, 0], 30), ...px([255, 255, 255], 70)])), "#ff0000");
  assert.equal(dominantColor(new Uint8ClampedArray(px([128, 128, 128], 100))), null);
  assert.equal(dominantColor(new Uint8ClampedArray(px([0, 0, 255], 100, 0))), null, "transparent pixels ignored");
});
