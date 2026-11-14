#!/usr/bin/env bash
# Smoke test on a running emulator/device: install the APK, start Ignifox, open a few
# screens, save screenshots and fail if the app crashed.
#   android/smoke.sh <apk> <output dir>
set -uo pipefail
apk="${1:?usage: smoke.sh <apk> <output dir>}"
out="${2:?usage: smoke.sh <apk> <output dir>}"
pkg=dev.rxvy.ignifox
ns=org.mozilla.reference.browser
mkdir -p "$out"

shot() {
  if timeout 40 adb exec-out screencap -p > "$out/$1.png"; then echo "  saved $1.png"; else echo "  screenshot $1 timed out"; hung=1; fi
}
hung=0
alive() { adb shell pidof "$pkg" >/dev/null 2>&1; }

adb root >/dev/null 2>&1 || true
sleep 3
adb wait-for-device
adb logcat -c || true
adb install -r "$apk" || { echo "install failed"; exit 1; }

echo "Starting Ignifox"
adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 45
shot 1-newtab

echo "Opening a website"
adb shell am start -a android.intent.action.VIEW -d "https://example.com" "$pkg" >/dev/null 2>&1
sleep 25
shot 2-website

echo "Opening the menu"
size=$(adb shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
w=${size% *}; h=${size#* }
adb shell input tap $((w - 60)) $((h - 150)) >/dev/null 2>&1
sleep 4
shot 3-menu
adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1

echo "Opening Ignifox Studio"
adb shell am start -n "$pkg/$ns.settings.SettingsActivity" --ez open_studio true >/dev/null 2>&1
sleep 8
shot 4-studio
adb shell input swipe $((w / 2)) $((h * 3 / 4)) $((w / 2)) $((h / 4)) 300 >/dev/null 2>&1
sleep 3
shot 5-studio-newtab

echo "Switching theme and toolbar position, then restarting"
adb shell am force-stop "$pkg"
adb shell "run-as $pkg sh -c 'ls shared_prefs'" > "$out/prefs-files.txt" 2>&1 || true
prefs="/data/data/$pkg/shared_prefs/${pkg}_preferences.xml"
adb shell "cat $prefs" > "$out/prefs-before.xml" 2>&1 || true
adb shell "sed -i 's#</map>#<boolean name=\"igni_debug_console\" value=\"true\" /><string name=\"igni_theme\">synthwave</string><string name=\"igni_bar_position\">top</string><string name=\"igni_bar_shape\">pill</string><string name=\"igni_nt_wallpaper\">flames</string><boolean name=\"igni_nt_todo\" value=\"true\" /><string name=\"igni_nt_cd_title\">Release</string><string name=\"igni_nt_cd_date\">2027-01-01 00:00</string><boolean name=\"igni_site_tint\" value=\"true\" /></map>#' $prefs" || true
adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 30
shot 6-synthwave-top
echo "Opening a new tab from the menu"
adb shell input tap $((w - 60)) 150 >/dev/null 2>&1
sleep 4
shot 7-menu-top
adb shell input tap $((w - 350)) 185 >/dev/null 2>&1
sleep 12
shot 8-newtab-synthwave

echo "Tabs as a grid"
adb shell input tap $((w - 150)) 150 >/dev/null 2>&1
sleep 5
shot 10-tab-grid
adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1
sleep 2

echo "Swiping the address bar to the previous tab"
adb shell input swipe $((w / 4)) 150 $((w * 3 / 4)) 150 250 >/dev/null 2>&1
sleep 4
shot 11-after-swipe

echo "Searching from the new tab page"
adb shell input tap $((w / 2)) $((h * 52 / 100)) >/dev/null 2>&1
sleep 3
adb shell input text "ignifox" >/dev/null 2>&1
adb shell input keyevent KEYCODE_ENTER >/dev/null 2>&1
sleep 15
shot 9-search

timeout 60 adb logcat -d > "$out/logcat.txt" 2>/dev/null || true
grep -E "FATAL EXCEPTION|AndroidRuntime: |IgnifoxPrefs|could not set" "$out/logcat.txt" | head -80 > "$out/problems.txt" || true

if grep -q "FATAL EXCEPTION" "$out/logcat.txt" && grep -A3 "FATAL EXCEPTION" "$out/logcat.txt" | grep -q "$pkg"; then
  echo "Ignifox crashed:"; grep -A25 "FATAL EXCEPTION" "$out/logcat.txt" | head -60
  exit 1
fi
if [[ $hung == 1 ]]; then echo "The screen stopped responding during the test"; exit 1; fi
if ! alive; then echo "Ignifox is not running at the end of the test"; exit 1; fi
echo "SMOKE TEST PASSED"
