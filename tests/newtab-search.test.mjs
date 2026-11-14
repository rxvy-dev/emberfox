import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../studio/content/prefs.sys.mjs";

const read = f => readFileSync(new URL(`../studio/content/${f}`, import.meta.url), "utf8");

test("popular engines are well-formed and unique", () => {
  const names = new Set(), aliases = new Set();
  for (const e of M.POPULAR_ENGINES) {
    assert.ok(e.url.startsWith("https://"), `${e.name} uses https`);
    assert.ok(e.url.includes("{searchTerms}"), `${e.name} has {searchTerms}`);
    if (e.suggestUrl) assert.ok(e.suggestUrl.includes("{searchTerms}"), `${e.name} suggest url`);
    assert.ok(e.alias.startsWith("@"), `${e.name} alias`);
    assert.ok(!names.has(e.name.toLowerCase()), `duplicate ${e.name}`);
    assert.ok(!aliases.has(e.alias), `duplicate alias ${e.alias}`);
    names.add(e.name.toLowerCase()); aliases.add(e.alias);
  }
});

test("custom engine URLs: %s becomes {searchTerms}, junk is rejected", () => {
  assert.equal(M.normalizeEngineURL("https://x.org/?q=%s"), "https://x.org/?q={searchTerms}");
  assert.equal(M.normalizeEngineURL("  https://x.org/s/{searchTerms} "), "https://x.org/s/{searchTerms}");
  assert.equal(M.normalizeEngineURL("https://x.org/"), null);
  assert.equal(M.normalizeEngineURL("javascript:alert(1)//%s"), null);
  assert.equal(M.normalizeEngineURL("ftp://x.org/%s"), null);
  assert.equal(M.normalizeEngineURL("https://x .org/%s"), null);
});

test("keywords get an @ and lose spaces", () => {
  assert.equal(M.normalizeAlias("yt"), "@yt");
  assert.equal(M.normalizeAlias(" @g h "), "@gh");
  assert.equal(M.normalizeAlias(""), "");
});

test("new tab shortcuts: defaults, filtering of unsafe URLs, bad JSON", () => {
  assert.equal(M.newtabLinks({ "ignifox.newtab.links": "" }).length, M.DEFAULT_LINKS.length);
  const list = M.newtabLinks({ "ignifox.newtab.links": JSON.stringify([
    { title: "ok", url: "https://a.org" }, { title: "js", url: "javascript:alert(1)" },
    { title: "file", url: "file:///etc/passwd" }, { url: "http://b.org" }, null, "x",
  ]) });
  assert.deepEqual(list.map(l => l.url), ["https://a.org", "http://b.org"]);
  assert.equal(M.newtabLinks({ "ignifox.newtab.links": "{nope" }).length, M.DEFAULT_LINKS.length);
  assert.deepEqual(M.newtabLinks({ "ignifox.newtab.links": "[]" }), []);
});

test("engine writes every setting the new tab page reads", () => {
  const boot = read("boot.sys.mjs"), page = read("newtab/newtab.js");
  const cfgBlock = boot.slice(boot.indexOf("const cfg = {"), boot.indexOf("const js = `window.IGNI_NEWTAB"));
  const written = new Set([...cfgBlock.matchAll(/^\s{6}(\w+)[:,]/gm)].map(m => m[1]));
  const defaults = page.slice(page.indexOf("const C = Object.assign({"), page.indexOf("}, window.IGNI_NEWTAB"));
  const read_ = new Set([...defaults.matchAll(/\b(\w+): /g)].map(m => m[1]))
    .difference(new Set(["bg", "bg2", "bg3", "fg", "fgDim", "accent", "accent2", "dark", "name", "url", "alias"]));
  for (const k of read_) assert.ok(written.has(k), `new tab reads "${k}" but the engine never writes it`);
});

test("every new tab file the engine installs exists", () => {
  const boot = read("boot.sys.mjs");
  const files = JSON.parse(/const NEWTAB_FILES = (\[[^\]]+\])/.exec(boot)[1]);
  for (const f of files) assert.doesNotThrow(() => read(`newtab/${f}`), f);
});

test("new tab page never embeds config values as HTML", () => {
  const page = read("newtab/newtab.js");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(page), "use textContent only");
});
