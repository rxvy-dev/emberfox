#!/usr/bin/env bash
# Audit a built Ignifox for anything that could send data to Mozilla.
#   audit.sh <ignifox tarball | extracted ignifox dir>
source "$(dirname "$0")/lib.sh"
T="${1:?usage: audit.sh <tarball|dir>}"
if [[ -d "$T" ]]; then INST="$T"; else
  W=$(mktemp -d); trap 'rm -rf "$W"' EXIT; tar -C "$W" -xf "$T"; INST="$W/ignifox"
fi
fail=0
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=1; }

echo "Binaries"
for b in "${TELEMETRY_BINARIES[@]}"; do [[ -e "$INST/$b" ]] && bad "$b still present" || ok "$b removed"; done

echo "Locked prefs (ignifox.cfg)"
CFG="$INST/ignifox.cfg"
[[ -f "$CFG" ]] || bad "ignifox.cfg missing"
grep -q 'general.config.filename", "ignifox.cfg"' "$INST/defaults/pref/autoconfig.js" 2>/dev/null && ok "autoconfig loads ignifox.cfg" || bad "autoconfig.js not wired"
for p in toolkit.telemetry.enabled toolkit.telemetry.unified datareporting.healthreport.uploadEnabled \
         datareporting.policy.dataSubmissionEnabled datareporting.usage.uploadEnabled app.shield.optoutstudies.enabled \
         app.normandy.enabled nimbus.rollouts.enabled browser.tabs.crashReporting.sendReport \
         dom.private-attribution.submission.enabled browser.newtabpage.activity-stream.telemetry; do
  grep -q "lockPref(\"$p\", false)" "$CFG" && ok "$p locked false" || bad "$p not locked"
done
grep -q 'lockPref("toolkit.telemetry.server", "data:,")' "$CFG" && ok "telemetry server blanked" || bad "telemetry server not blanked"

echo "Policies"
POL="$INST/distribution/policies.json"
python3 - "$POL" <<'PY' && ok "DisableTelemetry, DisableFirefoxStudies, DisableAppUpdate set" || bad "policies.json incomplete"
import json,sys; p=json.load(open(sys.argv[1]))["policies"]
assert p.get("DisableTelemetry") and p.get("DisableFirefoxStudies") and p.get("DisableAppUpdate")
PY
[[ -e "$INST/distribution/distribution.ini" ]] && bad "Mozilla distribution.ini present" || ok "no Mozilla distribution.ini"

echo "Ignifox layer"
for f in studio/content/boot.sys.mjs studio/content/studio.html studio/content/newtab/index.html studio/content/newtab/newtab.js; do
  [[ -f "$INST/$f" ]] && ok "$f" || bad "$f missing"
done

if [[ -x "$INST/firefox" ]]; then
  [[ -x "$INST/ignifox" && -f "$INST/ignifox" ]] && ok "ignifox launcher" || bad "ignifox launcher missing"
fi

echo "Identity"
if [[ -f "$INST/browser/application.ini" ]]; then
  grep -q '^Name=Ignifox' "$INST/browser/application.ini" && ok "app name Ignifox" || bad "app name not Ignifox"
  grep -A3 '^\[Crash Reporter\]' "$INST/browser/application.ini" | grep -q 'Enabled=0' && ok "crash reporter disabled in app data" || bad "crash reporter enabled"
fi
(cd "$INST" && unzip -p browser/omni.ja localization/en-US/branding/brand.ftl 2>/dev/null) | grep -q 'brand-short-name = Ignifox' \
  && ok "brand strings say Ignifox" || bad "brand strings not rebranded"

echo
((fail)) && { echo "AUDIT FAILED"; exit 1; } || echo "AUDIT PASSED: no telemetry paths found"
