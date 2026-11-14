## What & why

## Checks
- [ ] `node --test tests/*.test.mjs` passes
- [ ] `./build.sh repack && ./build.sh audit` passes (if build, prefs or packaging changed)
- [ ] No engine patches; uses prefs, policies, or Ember Studio
- [ ] New Studio settings are declared in `prefs.sys.mjs`
