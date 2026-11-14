# Contributing to Emberfox

Thanks for helping. Emberfox stays maintainable by following one rule:
**no engine patches**. Everything goes through Firefox's supported layers:

| You want to… | Edit |
|---|---|
| change a default (user can still change it) | `branding/emberfox-branding.js` |
| force something off for privacy (locked) | `settings/emberfox.cfg` and `scripts/audit.sh` |
| add an enterprise policy | `settings/distribution/policies.json` (CI validates it against Firefox's schema) |
| add a built-in theme | `THEMES` in `ember/content/prefs.sys.mjs` |
| add a Studio setting | `EMBER_PREFS` → `boot.sys.mjs` `paint()` → `ui.css` → a row in `studio.js` |
| expose a Firefox pref in Studio | `NATIVE_PREFS` + a row in `studio.js` |
| fix packaging for a distro | `packaging/` |

## Before you open a PR

```bash
node --test tests/*.test.mjs          # palette, versions, and cross-file consistency
python3 tests/check_policies.py       # policies.json vs Firefox's schema (pip install jsonschema)
shellcheck -x -S warning install.sh build.sh scripts/*.sh packaging/*.sh
./build.sh repack && ./build.sh audit # full build + telemetry audit
```

The consistency tests fail if a Studio control points at an undeclared pref, or if
the engine sets a root attribute that `ui.css` never styles (and vice versa).

## Working on Studio's look

`tools/preview/run.sh` serves Studio with Firefox APIs mocked, so you can iterate on
`studio.css`/`studio.js` in any browser. For the real thing, open `about:ember` and use the
Browser Toolbox (Ctrl+Alt+Shift+I) to inspect the browser UI.

## Releases

Maintainers push a tag `v<firefox>-<revision>` (or run **Actions → Release**). The
**Firefox watch** workflow does this automatically when Mozilla ships a new Firefox.
