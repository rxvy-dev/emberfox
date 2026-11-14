#!/bin/sh
# Emberfox launcher (repack builds). Runs Mozilla's engine under the Emberfox
# identity: own profile folder, own window class / Wayland app-id, no crash
# reporter. Works from a symlink in PATH.
SELF=$(readlink -f "$0")
DIR=$(dirname "$SELF")

case "${1:-}" in
  -v|--version|-version)
    echo "Emberfox $(cat "$DIR/EMBERFOX_VERSION" 2>/dev/null || echo unknown)"
    exit 0 ;;
esac

export MOZ_CRASHREPORTER_DISABLE=1
export MOZ_CRASHREPORTER_NO_REPORT=1

# Emberfox app identity (Name/Vendor/RemotingName), written at build time.
if [ -f "$DIR/browser/application.ini" ]; then
  set -- -app "$DIR/browser/application.ini" "$@"
fi

exec "$DIR/firefox" --name emberfox --class emberfox "$@"
