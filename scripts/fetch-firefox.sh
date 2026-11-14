#!/usr/bin/env bash
# Download + verify the official Mozilla Linux build that a repack starts from.
#   fetch-firefox.sh [version|latest] [x86_64|aarch64]   -> prints path of the tarball
source "$(dirname "$0")/lib.sh"
need curl sha512sum

VER="${1:-latest}"
ARCH="${2:-$(host_arch)}"
if [[ "$VER" == latest ]]; then
  VER=$(curl -fsSL https://product-details.mozilla.org/1.0/firefox_versions.json \
        | sed -n 's/.*"LATEST_FIREFOX_VERSION": *"\([^"]*\)".*/\1/p')
  [[ -n "$VER" ]] || die "could not look up the latest Firefox version"
fi

BASE="https://archive.mozilla.org/pub/firefox/releases/$VER"
mkdir -p "$BUILD_DIR/downloads"
cd "$BUILD_DIR/downloads" || exit 1

for ext in tar.xz tar.bz2; do                       # .xz since Firefox 135
  NAME="firefox-$VER.$ext"
  PATHPART="linux-$ARCH/en-US/$NAME"
  if [[ -s "$NAME" ]] || curl -fsSL -o "$NAME.part" "$BASE/$PATHPART"; then
    [[ -s "$NAME" ]] || mv "$NAME.part" "$NAME"
    break
  fi
  rm -f "$NAME.part"; NAME=""
done
[[ -n "${NAME:-}" ]] || die "no Linux $ARCH build found for Firefox $VER"

msg "Verifying $NAME against Mozilla's SHA512SUMS" >&2
curl -fsSL -o "SHA512SUMS-$VER" "$BASE/SHA512SUMS"
want=$(grep " $PATHPART\$" "SHA512SUMS-$VER" | cut -d' ' -f1)
have=$(sha512sum "$NAME" | cut -d' ' -f1)
[[ -n "$want" && "$want" == "$have" ]] || { rm -f "$NAME"; die "checksum mismatch for $NAME"; }

echo "$BUILD_DIR/downloads/$NAME"
