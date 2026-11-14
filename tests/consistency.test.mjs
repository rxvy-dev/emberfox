// Cross-file checks: every Studio control points at a pref with a known type,
// every root attribute the engine sets is styled, and vice versa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../ember/content/prefs.sys.mjs";

const src = f => readFileSync(new URL(`../ember/content/${f}`, import.meta.url), "utf8");
const studio = src("studio.js"), boot = src("boot.sys.mjs"), css = src("ui.css");

test("every Studio control uses a pref with a declared type", () => {
  const keys = [...studio.matchAll(/\b(?:toggle|select|range|text|colorPick)\(\s*"([a-z0-9_-]+\.[a-z0-9_.-]+)"/gi)].map(m => m[1]);
  assert.ok(keys.length > 60, `found ${keys.length} controls`);
  for (const k of keys) assert.ok(M.typeOf(k), `${k} is not in EMBER_PREFS or NATIVE_PREFS`);
});

test("every root attribute the engine sets has CSS, and every CSS attribute is set", () => {
  const set = new Set([...boot.matchAll(/(?:toggle|setAttribute)\("(ember-[a-z-]+)"/g)].map(m => m[1]));
  const styled = new Set([...css.matchAll(/\[(ember-[a-z-]+)/g)].map(m => m[1]));
  const internalOnly = new Set(["ember-font", "ember-font-size"]); // styled via [attr] too, listed for clarity
  for (const a of set) assert.ok(styled.has(a) || internalOnly.has(a), `${a} is set but never styled`);
  for (const a of styled) assert.ok(set.has(a), `${a} is styled but never set`);
});

test("every ember.* pref is used somewhere", () => {
  for (const k of Object.keys(M.EMBER_PREFS)) {
    assert.ok(studio.includes(`"${k}"`) || boot.includes(`"${k}"`),
      `${k} is declared but unused`);
  }
});

test("chrome:// files referenced by the engine and Studio exist", () => {
  const all = studio + boot + src("studio.html") + css + src("studio.css");
  for (const [, f] of all.matchAll(/chrome:\/\/ember\/content\/([\w./-]+)/g)) {
    assert.doesNotThrow(() => src(f), `missing ember/content/${f}`);
  }
});
