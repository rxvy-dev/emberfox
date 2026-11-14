#!/bin/sh
# Emberfox universal installer — any glibc Linux distro (Arch, Debian/Ubuntu,
# Fedora, openSUSE, Void, Gentoo, Mint, Pop!_OS, NixOS-with-FHS…).
#
#   ./install.sh              install system-wide to /opt/emberfox (needs root)
#   ./install.sh --user       install for you only, to ~/.local/opt/emberfox
#   ./install.sh --uninstall  [--user]  remove it again
#
# Run from inside the extracted emberfox/ folder.
set -eu

SRC=$(cd "$(dirname "$0")" && pwd)
MODE=system
ACTION=install
for a in "$@"; do
  case "$a" in
    --user) MODE=user ;;
    --uninstall) ACTION=uninstall ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = system ]; then
  PREFIX=/opt/emberfox; BIN=/usr/local/bin; SHARE=/usr/local/share
  if [ "$(id -u)" -ne 0 ]; then
    echo "System install needs root. Re-running with sudo… (or use --user)"
    exec sudo "$0" "$@"
  fi
else
  PREFIX="$HOME/.local/opt/emberfox"; BIN="$HOME/.local/bin"
  SHARE="${XDG_DATA_HOME:-$HOME/.local/share}"
fi

refresh() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$SHARE/applications" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f "$SHARE/icons/hicolor" 2>/dev/null || true
}

if [ "$ACTION" = uninstall ]; then
  rm -rf "$PREFIX" "$BIN/emberfox" "$SHARE/applications/emberfox.desktop"
  find "$SHARE/icons/hicolor" -name 'emberfox.*' -delete 2>/dev/null || true
  refresh
  echo "Emberfox removed. Your profile is kept (delete ~/.emberfox to wipe it)."
  exit 0
fi

# glibc check: Mozilla's engine binaries don't run on musl (Alpine, Void-musl).
if ldd --version 2>&1 | grep -qi musl; then
  echo "This system uses musl libc. Use the Flatpak, or build from source:" >&2
  echo "  ./build.sh source" >&2
  exit 1
fi

echo "Installing Emberfox to $PREFIX"
rm -rf "$PREFIX"
mkdir -p "$PREFIX" "$BIN" "$SHARE/applications"
cp -a "$SRC/." "$PREFIX/"
ln -sf "$PREFIX/emberfox" "$BIN/emberfox"

sed "s|^Exec=emberfox|Exec=$PREFIX/emberfox|" "$PREFIX/emberfox.desktop" > "$SHARE/applications/emberfox.desktop"
for d in "$PREFIX"/icons/hicolor/*/apps; do
  size=$(basename "$(dirname "$d")")
  mkdir -p "$SHARE/icons/hicolor/$size/apps"
  cp "$d"/emberfox.* "$SHARE/icons/hicolor/$size/apps/"
done
refresh

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "Note: $BIN is not in your PATH; launch from your app menu or add it." ;;
esac
echo "Done. Launch Emberfox from your app menu or run: emberfox"
