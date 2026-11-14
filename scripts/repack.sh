#!/usr/bin/env bash
# Fast build (minutes): take Mozilla's official, signed-off Linux build and turn
# it into Emberfox: rebrand, strip telemetry binaries, lock privacy prefs,
# add Ember Studio.
#
#   repack.sh                          latest Firefox for this machine's arch
#   repack.sh --version 160.0          a specific release
#   repack.sh --arch aarch64
#   repack.sh --from /path/firefox.tar.xz   (or an already-extracted firefox/ dir)
source "$(dirname "$0")/lib.sh"
need tar xz unzip python3 rsvg-convert convert identify

VER=latest; ARCH="$(host_arch)"; FROM=""
while (($#)); do
  case "$1" in
    --version) VER="$2"; shift ;;
    --arch) ARCH="$2"; shift ;;
    --from) FROM="$2"; shift ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

if [[ -z "$FROM" ]]; then
  FROM=$("$EMBER_ROOT/scripts/fetch-firefox.sh" "$VER" "$ARCH")
fi

WORK="$BUILD_DIR/repack"
rm -rf "$WORK"; mkdir -p "$WORK"
if [[ -d "$FROM" ]]; then
  msg "Copying $FROM"
  cp -a "$FROM" "$WORK/emberfox"
else
  msg "Extracting $(basename "$FROM")"
  tar -C "$WORK" -xf "$FROM"
  mv "$WORK/firefox" "$WORK/emberfox"
fi
INST="$WORK/emberfox"
FFVER=$(sed -n 's/^Version=//p' "$INST/application.ini" | head -1)
[[ -n "$FFVER" ]] || die "can't read Firefox version from application.ini"

msg "Rebranding Firefox $FFVER -> Emberfox"
python3 "$EMBER_ROOT/tools/brandify.py" omni "$INST"

install_ember "$INST"

VERSION="$FFVER-$EMBER_SUFFIX"
echo "$VERSION" > "$INST/EMBERFOX_VERSION"
make_tarball "$INST" "$VERSION" "$ARCH"
msg "Emberfox $VERSION ready in $DIST_DIR"
