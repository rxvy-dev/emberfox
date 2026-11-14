#!/usr/bin/env bash
# AppImage: one file, runs on any glibc distro without installing.
#   build-appimage.sh dist/emberfox-<ver>-linux-<arch>.tar.xz
source "$(dirname "$0")/../../scripts/lib.sh"
need tar curl
TB="${1:?usage: build-appimage.sh <emberfox tarball>}"
VER=$(basename "$TB" | sed -E 's/^emberfox-(.*)-linux-.*/\1/')
ARCH=$(basename "$TB" | sed -E 's/.*-linux-([a-z0-9_]+)\.tar.*/\1/')
APPDIR="$BUILD_DIR/appimage/Emberfox.AppDir"
rm -rf "$APPDIR"; mkdir -p "$APPDIR/usr/lib"
tar -C "$APPDIR/usr/lib" -xf "$TB"
rm -f "$APPDIR/usr/lib/emberfox/install.sh"
cp "$APPDIR/usr/lib/emberfox/emberfox.desktop" "$APPDIR/emberfox.desktop"
cp "$EMBER_ROOT/branding/icons/default256.png" "$APPDIR/emberfox.png"
ln -s emberfox.png "$APPDIR/.DirIcon"
cat > "$APPDIR/AppRun" <<'RUN'
#!/bin/sh
HERE=$(dirname "$(readlink -f "$0")")
exec "$HERE/usr/lib/emberfox/emberfox" "$@"
RUN
chmod 755 "$APPDIR/AppRun"

# appimagetool runs on the build machine's arch; ARCH picks the target runtime,
# so an x86_64 machine (or CI runner) can produce the aarch64 AppImage too.
HOST="$(host_arch)"
TOOL="$BUILD_DIR/appimagetool-$HOST.AppImage"
if [[ ! -x "$TOOL" ]]; then
  curl -fL -o "$TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-$HOST.AppImage"
  chmod +x "$TOOL"
fi
mkdir -p "$DIST_DIR"
OUT="$DIST_DIR/Emberfox-$VER-$ARCH.AppImage"
export ARCH
"$TOOL" --appimage-extract-and-run --no-appstream "$APPDIR" "$OUT"
msg "Built $OUT"
