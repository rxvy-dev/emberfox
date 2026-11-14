#!/bin/sh
# Ignifox launcher (repack builds). Runs Mozilla's engine under the Ignifox
# identity: own profile folder, own window class / Wayland app-id, no crash
# reporter. Works from a symlink in PATH.
#
# It also finishes imports from Ignifox Studio: passwords, cookies, open tabs
# and form history can only be swapped in while the browser is closed, so
# Studio stages them and this script moves them into place before starting.
SELF=$(readlink -f "$0")
DIR=$(dirname "$SELF")

case "${1:-}" in
  -v|--version|-version)
    echo "Ignifox $(cat "$DIR/IGNIFOX_VERSION" 2>/dev/null || echo unknown)"
    exit 0 ;;
esac

STATE="${XDG_STATE_HOME:-$HOME/.local/state}/ignifox"

# Firefox's profile lock is a symlink "lock -> host:+PID".
profile_in_use() {
  target=$(readlink "$1/lock" 2>/dev/null) || return 1
  pid=${target##*+}
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

apply_staged_import() {
  [ -f "$STATE/pending-import" ] || return 1
  prof=$(head -n 1 "$STATE/pending-import")
  imp="$prof/ignifox-import"
  if [ ! -d "$prof" ] || [ ! -f "$imp/pending.json" ]; then
    rm -f "$STATE/pending-import"
    return 1
  fi
  profile_in_use "$prof" && return 1
  backup="$imp/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  for f in "$imp"/files/*; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    for old in "$prof/$name" "$prof/$name-wal" "$prof/$name-shm"; do
      [ -e "$old" ] && mv -f "$old" "$backup/"
    done
    mv -f "$f" "$prof/$name"
  done
  rm -rf "$imp/files" "$imp/pending.json"
  rm -f "$STATE/pending-import"
  return 0
}

export MOZ_CRASHREPORTER_DISABLE=1
export MOZ_CRASHREPORTER_NO_REPORT=1
export IGNIFOX_LAUNCHER=1   # tells Studio that staged imports will be applied

apply_staged_import

# Ignifox app identity (Name/Vendor/RemotingName), written at build time.
if [ -f "$DIR/browser/application.ini" ]; then
  set -- -app "$DIR/browser/application.ini" "$@"
fi

"$DIR/firefox" --name ignifox --class ignifox "$@"
rc=$?

# Studio asked to close-and-reopen to finish an import.
if [ -f "$STATE/relaunch" ]; then
  rm -f "$STATE/relaunch"
  sleep 1
  apply_staged_import
  exec "$SELF"
fi
exit $rc
