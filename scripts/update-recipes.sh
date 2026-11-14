#!/usr/bin/env bash
# Point every distro recipe at a release: version + sha256 of each tarball.
#   update-recipes.sh <version e.g. 160.0.1-1> [dist-dir]
# Used by the release workflow; safe to run by hand.
source "$(dirname "$0")/lib.sh"
V="${1:?usage: update-recipes.sh <version> [dist-dir]}"
D="${2:-$DIST_DIR}"
FF="${V%-*}"; REL="${V##*-}"
sum() { local f="$D/ignifox-$V-linux-$1.tar.xz"; [[ -f "$f" ]] && sha256sum "$f" | cut -d' ' -f1 || echo SKIP; }
X86=$(sum x86_64); ARM=$(sum aarch64)
P="$IGNI_ROOT/packaging"

# Arch
sed -i -e "s/^pkgver=.*/pkgver=$FF/" -e "s/^_emrel=.*/_emrel=$REL/" -e "s/^pkgrel=.*/pkgrel=1/" \
       -e "s/^sha256sums_x86_64=.*/sha256sums_x86_64=('$X86')/" \
       -e "s/^sha256sums_aarch64=.*/sha256sums_aarch64=('$ARM')/" "$P/arch/PKGBUILD"

# Void
sed -i -e "s/^version=.*/version=$FF/" -e "s/^_emrel=.*/_emrel=$REL/" -e "s/^revision=.*/revision=1/" \
       -e "s/x86_64) checksum=[^ ]* ;;/x86_64) checksum=$X86 ;;/" \
       -e "s/aarch64) checksum=[^ ]* ;;/aarch64) checksum=$ARM ;;/" "$P/void/template"

# Gentoo: ebuild file name carries the version
OLD=$(ls "$P"/gentoo/ignifox-bin-*.ebuild | head -1)
NEW="$P/gentoo/ignifox-bin-$FF.ebuild"
[[ "$OLD" == "$NEW" ]] || git -C "$IGNI_ROOT" mv -f "$OLD" "$NEW" 2>/dev/null || mv "$OLD" "$NEW"
sed -i "s/^MY_PV=.*/MY_PV=\"\${PV}-$REL\"/" "$NEW"

# Flatpak / AppStream release history
MI="$P/flatpak/dev.rxvy.Ignifox.metainfo.xml"
if ! grep -q "version=\"$V\"" "$MI"; then
  sed -i "s|<releases>|<releases><release version=\"$V\" date=\"$(date -u +%F)\"/>|" "$MI"
fi
msg "Recipes now point at Ignifox $V (x86_64 $X86, aarch64 $ARM)"
