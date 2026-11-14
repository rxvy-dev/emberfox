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
  const code = readFileSync(join(root, "android/app/src/main/java/org/mozilla/reference/browser/ignifox/Ignifox.kt"), "utf8");
  const consts = new Set([...code.matchAll(/const val \w+ = "(igni_\w+)"/g)].map(m => m[1]));
  const actions = new Set(["igni_surprise", "igni_nt_wallpaper_pick", "igni_search_engine", "igni_search_add", "igni_clear_now", "igni_addons", "igni_addons_more", "igni_addon_file", "igni_about_config", "igni_source", "igni_theme_code", "igni_theme_code_copy"]);
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
