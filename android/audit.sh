#!/usr/bin/env bash
# Checks a built Ignifox APK: right app id, signed, and none of the tracking or
# proprietary libraries the upstream components can pull in.
set -euo pipefail
apk="${1:?usage: audit.sh <apk>}"
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
fail=0

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
bt=""
if [[ -n "$sdk" && -d "$sdk/build-tools" ]]; then
  bt=$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
fi

echo "Ignifox for Android: $(basename "$apk")"
if [[ -n "$bt" && -x "$bt/aapt2" ]]; then
  badging=$("$bt/aapt2" dump badging "$apk")
  if grep -q "package: name='dev.rxvy.ignifox'" <<<"$badging"; then ok "app id dev.rxvy.ignifox"; else bad "wrong app id"; fi
  if grep -q "application-label:'Ignifox'" <<<"$badging"; then ok "app name Ignifox"; else bad "wrong app name"; fi
  grep -o "versionName='[^']*'" <<<"$badging" | head -1 | sed 's/^/    /'
  if "$bt/apksigner" verify "$apk" >/dev/null 2>&1; then ok "signed"; else bad "not signed"; fi
else
  echo "  (no Android build-tools found: skipping manifest and signature checks)"
fi

# What matters is which classes the APK actually contains, not which names it mentions.
analyzer=""
if [[ -n "$sdk" ]]; then
  analyzer=$(find "$sdk/cmdline-tools" -name apkanalyzer -type f 2>/dev/null | sort -V | tail -1)
fi
if [[ -n "$analyzer" ]]; then
  packages=$("$analyzer" dex packages --defined-only "$apk" | awk '$1 == "P" { print $NF }')
  for pkg in com.google.firebase com.google.android.gms com.google.android.play io.sentry com.adjust.sdk com.leanplum; do
    if grep -q -x -F "$pkg" <<<"$packages" || grep -q -F "$pkg." <<<"$packages"; then bad "contains $pkg"; else ok "no $pkg"; fi
  done
else
  echo "  (no apkanalyzer found: skipping the bundled-library check)"
fi

if unzip -l "$apk" | grep -q 'assets/extensions/ignifox/newtab/index.html'; then ok "Ignifox New Tab bundled"; else bad "new tab page missing"; fi

if [[ $fail == 0 ]]; then echo "APK AUDIT PASSED"; else echo "APK AUDIT FAILED"; exit 1; fi
