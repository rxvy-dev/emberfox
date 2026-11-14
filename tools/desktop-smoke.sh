#!/usr/bin/env bash
# Desktop smoke test: start the real Ignifox build on a virtual X screen, open a new tab and
# check that the animated wallpaper is actually moving. Saves screenshots for a human to look at.
#   tools/desktop-smoke.sh <ignifox-*.tar.xz> <output dir>
# Needs: Xvfb (xvfb-run), xdotool, ImageMagick.
set -uo pipefail
tarball="${1:?usage: desktop-smoke.sh <tarball> <output dir>}"
out="$(mkdir -p "${2:?usage: desktop-smoke.sh <tarball> <output dir>}" && cd "$2" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xJf "$tarball" -C "$work"
app="$work/ignifox/ignifox"
[[ -x "$app" ]] || { echo "no launcher in $tarball"; exit 1; }
fail=0

# One scenario: fresh profile with the given prefs, new tab open, two screenshots a second apart.
#   scenario <name> <expect: moving|still> <user.js lines...>
scenario() {
  local name="$1" expect="$2"; shift 2
  local home="$work/home-$name" profile="$work/profile-$name"
  mkdir -p "$home" "$profile"
  {
    echo 'user_pref("ignifox.firstrun.done", true);'
    echo 'user_pref("browser.shell.checkDefaultBrowser", false);'
    echo 'user_pref("browser.startup.homepage_override.mstone", "ignore");'
    printf '%s\n' "$@"
  } > "$profile/user.js"

  echo "== $name (expect $expect)"
  HOME="$home" XDG_STATE_HOME="$home/.local/state" "$app" --no-remote --profile "$profile" about:blank \
    > "$out/$name-browser.log" 2>&1 &
  local pid=$!
  local win=""
  for _ in $(seq 1 60); do
    win=$(xdotool search --onlyvisible --class ignifox 2>/dev/null | tail -1)
    [[ -n "$win" ]] && break
    sleep 1
  done
  if [[ -z "$win" ]]; then
    echo "   ✗ no browser window appeared"; tail -20 "$out/$name-browser.log"; fail=1
    kill "$pid" 2>/dev/null; return
  fi
  xdotool windowsize "$win" 1280 800 windowmove "$win" 0 0 2>/dev/null
  sleep 12                                  # let the engine write the new tab page
  xdotool windowactivate --sync "$win" key --clearmodifiers ctrl+t 2>/dev/null
  sleep 6
  import -window "$win" "$out/$name-1.png"
  sleep 1
  import -window "$win" "$out/$name-2.png"
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null

  # Compare the lower-left part of the page: away from the clock and the blinking search cursor.
  local diff
  diff=$(compare -metric AE \
    <(convert "$out/$name-1.png" -gravity southwest -crop 30%x35%+0+0 +repage png:-) \
    <(convert "$out/$name-2.png" -gravity southwest -crop 30%x35%+0+0 +repage png:-) null: 2>&1 | cut -d' ' -f1)
  diff=${diff%%.*}
  local got=still
  [[ "${diff:-0}" -gt 50 ]] && got=moving
  if [[ "$got" == "$expect" ]]; then
    echo "   ✓ wallpaper is $got ($diff pixels changed)"
  else
    echo "   ✗ wallpaper is $got ($diff pixels changed), expected $expect"; fail=1
  fi
}

scenario embers-default moving
scenario matrix-reduce-motion moving \
  'user_pref("ignifox.newtab.wallpaper", "matrix");' 'user_pref("ui.prefersReducedMotion", 1);'
scenario snow-follow-system still \
  'user_pref("ignifox.newtab.wallpaper", "snow");' 'user_pref("ignifox.newtab.motion", "system");' \
  'user_pref("ui.prefersReducedMotion", 1);'
scenario starfield-default moving 'user_pref("ignifox.newtab.wallpaper", "starfield");'

if [[ $fail == 0 ]]; then echo "DESKTOP SMOKE TEST PASSED"; else echo "DESKTOP SMOKE TEST FAILED"; exit 1; fi
