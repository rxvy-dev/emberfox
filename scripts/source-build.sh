#!/usr/bin/env bash
# Full build from Mozilla source (1–3 h on a 16-thread machine, ~40 GB disk,
# 16+ GB RAM recommended). Produces a native "emberfox" binary with telemetry,
# crash reporter and updater compiled out, then adds the same Ember layer the
# repack uses.
#
#   source-build.sh [--version 160.0.1] [--lto] [--pgo] [--src DIR] [--git]
source "$(dirname "$0")/lib.sh"
need curl tar python3 rsvg-convert convert identify

VER=latest; LTO=0; PGO=0; SRC=""; USE_GIT=0
while (($#)); do
  case "$1" in
    --version) VER="$2"; shift ;;
    --lto) LTO=1 ;;
    --pgo) PGO=1 ;;
    --src) SRC="$2"; shift ;;
    --git) USE_GIT=1 ;;
    *) die "unknown option $1" ;;
  esac
  shift
done
if [[ "$VER" == latest ]]; then
  VER=$(curl -fsSL https://product-details.mozilla.org/1.0/firefox_versions.json \
        | sed -n 's/.*"LATEST_FIREFOX_VERSION": *"\([^"]*\)".*/\1/p')
fi
ARCH="$(host_arch)"
SRC="${SRC:-$BUILD_DIR/firefox-$VER}"

# ---- 1. source
if [[ ! -f "$SRC/mach" ]]; then
  mkdir -p "$BUILD_DIR"
  if ((USE_GIT)); then
    need git
    TAG="FIREFOX_${VER//./_}_RELEASE"
    msg "Cloning mozilla-firefox/firefox @ $TAG (shallow)"
    git clone --depth 1 --branch "$TAG" https://github.com/mozilla-firefox/firefox.git "$SRC"
  else
    msg "Downloading Firefox $VER source"
    TB="$BUILD_DIR/downloads/firefox-$VER.source.tar.xz"
    mkdir -p "$(dirname "$TB")"
    [[ -s "$TB" ]] || curl -fL -o "$TB" "https://archive.mozilla.org/pub/firefox/releases/$VER/source/firefox-$VER.source.tar.xz"
    mkdir -p "$SRC"
    tar -C "$SRC" --strip-components=1 -xf "$TB"
  fi
fi

# ---- 2. branding: start from Mozilla's unofficial branding, overlay ours
msg "Installing Emberfox branding"
BR="$SRC/browser/branding/emberfox"
rm -rf "$BR"
cp -r "$SRC/browser/branding/unofficial" "$BR"
python3 "$EMBER_ROOT/tools/brandify.py" dir "$BR"
for s in 16 22 24 32 48 64 128 256; do
  cp "$EMBER_ROOT/branding/icons/default$s.png" "$BR/default$s.png"
done

# ---- 3. patches (optional extras; Emberfox's core needs none)
shopt -s nullglob
for p in "$EMBER_ROOT"/patches/*.patch; do
  msg "Applying $(basename "$p")"
  patch -d "$SRC" -p1 --forward --batch < "$p" || die "patch failed: $p"
done

# ---- 4. mozconfig
cp "$EMBER_ROOT/mozconfig" "$SRC/mozconfig"
((LTO)) && echo 'ac_add_options --enable-lto=cross' >> "$SRC/mozconfig"
((PGO)) && echo 'ac_add_options MOZ_PGO=1' >> "$SRC/mozconfig"

# ---- 5. build
cd "$SRC" || exit 1
export MOZBUILD_STATE_PATH="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}"
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=none
msg "Bootstrapping toolchains (rust, clang, sysroots)"
./mach --no-interactive bootstrap --application-choice browser
msg "Building (this is the long part)"
./mach build
./mach package

# ---- 6. Ember layer + tarball (same as repack)
PKG=$(ls obj-emberfox/dist/emberfox-*.tar.* | head -1)
WORK="$BUILD_DIR/source-pkg"; rm -rf "$WORK"; mkdir -p "$WORK"
tar -C "$WORK" -xf "$PKG"
INST="$WORK/emberfox"
install_ember "$INST"
VERSION="$VER-$EMBER_SUFFIX"
echo "$VERSION" > "$INST/EMBERFOX_VERSION"
make_tarball "$INST" "$VERSION-src" "$ARCH"
msg "Source-built Emberfox $VERSION ready in $DIST_DIR"
