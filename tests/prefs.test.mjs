// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../studio/content/prefs.sys.mjs";

const defaults = () => Object.fromEntries(Object.entries(M.IGNI_PREFS).map(([k, s]) => [k, s.def]));

test("every built-in theme has a complete, valid palette", () => {
  for (const [id, t] of Object.entries(M.THEMES)) {
    for (const k of M.PALETTE_KEYS) assert.ok(M.isHex(t[k]), `${id}.${k} = ${t[k]}`);
    assert.equal(typeof t.dark, "boolean", `${id}.dark`);
    assert.equal(t.dark, M.luminance(t.bg) < 0.4, `${id}.dark matches its background`);
  }
});

test("text is readable on every theme (WCAG contrast >= 4.5)", () => {
  const contrast = (a, b) => {
    const [x, y] = [M.luminance(a), M.luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const [id, t] of Object.entries(M.THEMES)) {
    for (const bg of ["bg", "bg2", "bg3"]) {
      assert.ok(contrast(t.fg, t[bg]) >= 4.5, `${id}: fg on ${bg} = ${contrast(t.fg, t[bg]).toFixed(2)}`);
    }
  }
});

test("defaults resolve to the Ignis theme", () => {
  assert.equal(M.resolvePalette(defaults()).name, "Ignis");
});

test("unknown preset falls back to Ignis", () => {
  assert.equal(M.resolvePalette({ ...defaults(), "ignifox.theme.preset": "nope" }).name, "Ignis");
});

test("custom palette fills in missing colors", () => {
  const p = M.resolvePalette({ ...defaults(), "ignifox.theme.preset": "custom",
    "ignifox.theme.custom": JSON.stringify({ bg: "#202020", accent: "#00ff88" }) });
  for (const k of M.PALETTE_KEYS) assert.ok(M.isHex(p[k]), k);
  assert.equal(p.accent, "#00ff88");
  assert.equal(p.dark, true);
});

test("broken custom JSON never throws", () => {
  const p = M.resolvePalette({ ...defaults(), "ignifox.theme.preset": "custom", "ignifox.theme.custom": "{oops" });
  assert.ok(M.isHex(p.bg));
});

test("saved user themes resolve; missing ones fall back", () => {
  const v = { ...defaults(), "ignifox.theme.saved": JSON.stringify({ Mine: { bg: "#111111", fg: "#eeeeee", accent: "#ff00ff" } }) };
  assert.equal(M.resolvePalette({ ...v, "ignifox.theme.preset": "user:Mine" }).accent, "#ff00ff");
  assert.equal(M.resolvePalette({ ...v, "ignifox.theme.preset": "user:Gone" }).name, "Ignis");
});

test("accent override applies to presets only", () => {
  assert.equal(M.resolvePalette({ ...defaults(), "ignifox.theme.accent": "#00aaff" }).accent, "#00aaff");
  const custom = { ...defaults(), "ignifox.theme.preset": "custom", "ignifox.theme.accent": "#00aaff",
    "ignifox.theme.custom": JSON.stringify({ accent: "#123456" }) };
  assert.equal(M.resolvePalette(custom).accent, "#123456");
});

test("theme share codes round-trip", () => {
  for (const t of Object.values(M.THEMES)) {
    const back = M.codeToPalette(M.paletteToCode(t));
    for (const k of M.PALETTE_KEYS) assert.equal(back[k], t[k]);
  }
  assert.equal(M.codeToPalette("igni:zzz"), null);
  assert.equal(M.codeToPalette("not a code"), null);
  assert.equal(M.codeToPalette("igni:000000,111111"), null);
});

test("privacy levels only touch prefs Studio knows the type of", () => {
  for (const [id, lvl] of Object.entries(M.PRIVACY_LEVELS)) {
    for (const [k, v] of Object.entries(lvl.prefs)) {
      const t = M.typeOf(k);
      assert.ok(t, `${id}: ${k} missing from NATIVE_PREFS`);
      assert.equal(t == "bool" ? "boolean" : t == "int" ? "number" : "string", typeof v, `${id}: ${k} type`);
    }
  }
});

test("version comparison", () => {
  assert.ok(M.compareVersions("160.0.1-1", "160.0-1") > 0);
  assert.ok(M.compareVersions("v161.0-1", "160.0.1-9") > 0);
  assert.ok(M.compareVersions("160.0-2", "160.0-1") > 0);
  assert.equal(M.compareVersions("v160.0-1", "160.0-1"), 0);
  assert.ok(M.compareVersions("160.0-1", "160.0.1-1") < 0);
  assert.ok(M.compareVersions("garbage", "160.0-1") < 0);
});

test("toolbar presets reference only known widgets", () => {
  for (const p of Object.values(M.TOOLBAR_PRESETS)) {
    for (const id of p.navbar) assert.ok(M.WIDGETS[id], `${p.name}: ${id}`);
  }
});
