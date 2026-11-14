// Ignifox for Android shares its themes and new tab page with the Linux browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { outputs } from "../tools/sync-android.mjs";
import { THEMES, WALLPAPERS } from "../studio/content/prefs.sys.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android/app/src/main/res");

test("android: generated themes and new tab assets are up to date", () => {
  for (const [path, data] of outputs()) {
    assert.ok(existsSync(path), `${path} is missing: run node tools/sync-android.mjs`);
    assert.ok(readFileSync(path).equals(data), `${path} is stale: run node tools/sync-android.mjs`);
  }
});

test("android: every Linux theme is offered, with a style for stock widgets", () => {
  const xml = readFileSync(join(res, "values/ignifox_themes.xml"), "utf8");
  for (const key of Object.keys(THEMES)) {
    assert.match(xml, new RegExp(`<item>${key}</item>`));
    assert.match(xml, new RegExp(`<style name="Igni\\.${key[0].toUpperCase()}${key.slice(1)}"`));
  }
});

test("android: wallpapers offered in Studio exist in the shared new tab page", () => {
  const xml = readFileSync(join(res, "values/ignifox_strings.xml"), "utf8");
  const keys = /<string-array name="igni_wallpaper_keys"[^>]*>([\s\S]*?)<\/string-array>/.exec(xml)[1].match(/<item>([^<]+)<\/item>/g).map(s => s.replace(/<\/?item>/g, ""));
  for (const k of keys) assert.ok(k in WALLPAPERS, `${k} is not a wallpaper the new tab page knows`);
  for (const k of ["starfield", "matrix", "snow"]) assert.ok(keys.includes(k));
});

test("android: Studio setting keys in the screen match the ones the code reads", () => {
  const screen = readFileSync(join(res, "xml/ignifox_preferences.xml"), "utf8");
  const dir = join(root, "android/app/src/main/java/org/mozilla/reference/browser/ignifox");
  const code = readFileSync(join(dir, "Ignifox.kt"), "utf8") + readFileSync(join(dir, "Extras.kt"), "utf8");
  const consts = new Set([...code.matchAll(/const val \w+ = "(igni_\w+)"/g)].map(m => m[1]));
  const actions = new Set(["igni_surprise", "igni_nt_wallpaper_pick", "igni_search_engine", "igni_search_add", "igni_clear_now", "igni_addons", "igni_addons_more", "igni_addon_file", "igni_about_config", "igni_source", "igni_theme_code", "igni_theme_code_copy",
    "igni_gallery", "igni_burn_now", "igni_ubo", "igni_update_now"]);
  for (const m of screen.matchAll(/android:key="(igni_\w+)"/g)) {
    assert.ok(consts.has(m[1]) || actions.has(m[1]), `${m[1]} is in the Studio screen but nothing reads it`);
  }
});

test("android: the build keeps Google and crash-upload libraries out", () => {
  const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
  assert.match(gradle, /exclude group: 'com\.google\.android\.gms'/);
  assert.doesNotMatch(gradle, /lib\.crash\.sentry|push\.firebase/);
  assert.match(gradle, /applicationId = "dev\.rxvy\.ignifox"/);
});

test("wallpapers: every canvas effect is a wallpaper, and fx.js ships on Linux and Android", async () => {
  globalThis.window = {};
  await import("../studio/content/newtab/fx.js");
  const FX = globalThis.window.IGNI_FX;
  for (const name of FX.names) assert.ok(name in WALLPAPERS, `${name} has no Studio entry`);
  for (const name of ["embers", "starfield", "matrix", "snow"]) {
    assert.equal(typeof FX.create(name, 120, 60, { bg: "#000", fg: "#fff", accent: "#f00", accent2: "#fa0" }), "function");
  }
  assert.equal(FX.create("embers", 0, 0, {}), null, "no effect is built for a page that has no size yet");
  const boot = readFileSync(join(root, "studio/content/boot.sys.mjs"), "utf8");
  assert.match(boot, /NEWTAB_FILES = \[[^\]]*"fx\.js"/);
  const html = readFileSync(join(root, "studio/content/newtab/index.html"), "utf8");
  assert.ok(html.indexOf('src="fx.js"') < html.indexOf('src="newtab.js"'), "fx.js must load before newtab.js");
  assert.match(readFileSync(join(root, "studio/content/studio.html"), "utf8"), /newtab\/fx\.js/);
});

test("android: wallpapers, widget and theme links are registered", () => {
  const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /\.ignifox\.IgniWidget/);
  assert.match(manifest, /android:scheme="ignifox" android:host="theme"/);
  assert.match(manifest, /android\.app\.shortcuts/);
  for (const w of ["flames", "storm", "fireflies"]) assert.ok(w in WALLPAPERS);
});
