#!/usr/bin/env bash
# Debian / Ubuntu / Mint / Pop!_OS / elementary / Zorin / Kali package.
#   build-deb.sh dist/ignifox-<ver>-linux-<arch>.tar.xz
source "$(dirname "$0")/../scripts/lib.sh"
need dpkg-deb tar
TB="${1:?usage: build-deb.sh <ignifox tarball>}"
VER=$(basename "$TB" | sed -E 's/^ignifox-(.*)-linux-.*/\1/')
ARCH=$(basename "$TB" | sed -E 's/.*-linux-([a-z0-9_]+)\.tar.*/\1/')
DARCH=$([[ $ARCH == x86_64 ]] && echo amd64 || echo arm64)
ROOT="$BUILD_DIR/deb/ignifox_${VER}_$DARCH"
rm -rf "$ROOT"; mkdir -p "$ROOT/opt" "$ROOT/usr/bin" "$ROOT/usr/share/applications" "$ROOT/DEBIAN"
tar -C "$ROOT/opt" -xf "$TB"
ln -s /opt/ignifox/ignifox "$ROOT/usr/bin/ignifox"
sed 's|^Exec=ignifox|Exec=/usr/bin/ignifox|' "$ROOT/opt/ignifox/ignifox.desktop" > "$ROOT/usr/share/applications/ignifox.desktop"
cp -r "$ROOT/opt/ignifox/icons" "$ROOT/usr/share/icons"
rm -f "$ROOT/opt/ignifox/install.sh"
SIZE=$(du -sk "$ROOT" | cut -f1)
cat > "$ROOT/DEBIAN/control" <<CTRL
Package: ignifox
Version: $VER
Architecture: $DARCH
Maintainer: rxvy <rxvy@users.noreply.github.com>
Installed-Size: $SIZE
Depends: libgtk-3-0 | libgtk-3-0t64, libasound2 | libasound2t64, libdbus-glib-1-2, libx11-xcb1, libxtst6
Recommends: libavcodec-extra | libavcodec61 | libavcodec60 | libavcodec59, libpulse0
Provides: www-browser, gnome-www-browser
Section: web
Priority: optional
Homepage: https://github.com/rxvy-dev/ignifox
Description: Telemetry-free, deeply customizable browser built on Firefox
 Ignifox is Firefox with every telemetry, study and crash-report channel
 locked off, sponsored content removed, and Ignifox Studio built in: themes,
 a full color editor, tab and toolbar placement, privacy levels, custom CSS.
CTRL
cat > "$ROOT/DEBIAN/postinst" <<'POST'
#!/bin/sh
set -e
if [ "$1" = configure ]; then
  update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/bin/ignifox 70 || true
  update-alternatives --install /usr/bin/gnome-www-browser gnome-www-browser /usr/bin/ignifox 70 || true
fi
POST
cat > "$ROOT/DEBIAN/prerm" <<'PRE'
#!/bin/sh
set -e
if [ "$1" = remove ]; then
  update-alternatives --remove x-www-browser /usr/bin/ignifox || true
  update-alternatives --remove gnome-www-browser /usr/bin/ignifox || true
fi
PRE
chmod 755 "$ROOT/DEBIAN/postinst" "$ROOT/DEBIAN/prerm"
mkdir -p "$DIST_DIR"
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$DIST_DIR/ignifox_${VER}_$DARCH.deb" >/dev/null
msg "Built $DIST_DIR/ignifox_${VER}_$DARCH.deb"
