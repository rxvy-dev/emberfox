#!/usr/bin/env bash
# Ignifox build entry point.
#
#   ./build.sh repack [--version X] [--arch A] [--from F]   fast: rebrand Mozilla's official build (minutes)
#   ./build.sh source [--version X] [--lto] [--pgo]         full: compile from Mozilla source (hours)
#   ./build.sh deb|rpm|appimage|flatpak [tarball]           package a built tarball (default: newest in dist/)
#   ./build.sh packages [tarball]                           every package your machine has tools for
#   ./build.sh audit [tarball|dir]                          verify no telemetry paths are left
#   ./build.sh icons                                        regenerate PNG icons from branding/*.svg
source "$(dirname "$0")/scripts/lib.sh"

newest() { ls -t "$DIST_DIR"/ignifox-*-linux-*.tar.xz 2>/dev/null | head -1; }
tarball() { local t="${1:-$(newest)}"; [[ -f "$t" ]] || die "no tarball; run ./build.sh repack first"; echo "$t"; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  repack) exec "$IGNI_ROOT/scripts/repack.sh" "$@" ;;
  source) exec "$IGNI_ROOT/scripts/source-build.sh" "$@" ;;
  deb) exec "$IGNI_ROOT/packaging/build-deb.sh" "$(tarball "${1:-}")" ;;
  rpm)
    need rpmbuild
    t=$(tarball "${1:-}"); v=$(basename "$t" | sed -E 's/^ignifox-(.*)-linux-.*/\1/')
    a=$(basename "$t" | sed -E 's/.*-linux-([a-z0-9_]+)\.tar.*/\1/')
    rpmbuild -bb --target "$a" "$IGNI_ROOT/packaging/rpm/ignifox.spec" \
      --define "_sourcedir $(dirname "$t")" --define "_rpmdir $DIST_DIR" --define "igni_version $v" ;;
  appimage) exec "$IGNI_ROOT/packaging/appimage/build-appimage.sh" "$(tarball "${1:-}")" ;;
  flatpak)
    need flatpak-builder
    t=$(tarball "${1:-}"); m="$BUILD_DIR/flatpak/dev.rxvy.Ignifox.yml"
    mkdir -p "$(dirname "$m")"
    sed "s|IGNIFOX_TARBALL|$t|" "$IGNI_ROOT/packaging/flatpak/dev.rxvy.Ignifox.yml" > "$m"
    cp "$IGNI_ROOT/packaging/flatpak/dev.rxvy.Ignifox.metainfo.xml" "$(dirname "$m")/"
    flatpak-builder --force-clean --repo="$BUILD_DIR/flatpak-repo" "$BUILD_DIR/flatpak-build" "$m"
    flatpak build-bundle "$BUILD_DIR/flatpak-repo" "$DIST_DIR/Ignifox.flatpak" dev.rxvy.Ignifox
    msg "Built $DIST_DIR/Ignifox.flatpak" ;;
  packages)
    t=$(tarball "${1:-}")
    command -v dpkg-deb >/dev/null && "$0" deb "$t"
    command -v rpmbuild >/dev/null && "$0" rpm "$t"
    command -v flatpak-builder >/dev/null && "$0" flatpak "$t"
    "$0" appimage "$t" || warn "AppImage step failed (needs network for appimagetool + FUSE-less extract)" ;;
  audit) exec "$IGNI_ROOT/scripts/audit.sh" "$(tarball "${1:-}")" ;;
  icons)
    need rsvg-convert
    for s in 16 22 24 32; do rsvg-convert -w $s -h $s branding/logo-small.svg -o branding/icons/default$s.png; done
    for s in 48 64 128 256 512 1024; do rsvg-convert -w $s -h $s branding/logo.svg -o branding/icons/default$s.png; done
    msg "icons regenerated" ;;
  help|-h|--help|*) sed -n '2,11p' "$0" ;;
esac
