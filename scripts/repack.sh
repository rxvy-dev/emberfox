#!/usr/bin/env bash
# Fast build (minutes): take Mozilla's official, signed-off Linux build and turn
# it into Ignifox: rebrand, strip telemetry binaries, lock privacy prefs,
# add Ignifox Studio.
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
  FROM=$("$IGNI_ROOT/scripts/fetch-firefox.sh" "$VER" "$ARCH")
fi

WORK="$BUILD_DIR/repack"
rm -rf "$WORK"; mkdir -p "$WORK"
if [[ -d "$FROM" ]]; then
  msg "Copying $FROM"
  cp -a "$FROM" "$WORK/ignifox"
else
  msg "Extracting $(basename "$FROM")"
  tar -C "$WORK" -xf "$FROM"
  mv "$WORK/firefox" "$WORK/ignifox"
fi
INST="$WORK/ignifox"
FFVER=$(sed -n 's/^Version=//p' "$INST/application.ini" | head -1)
[[ -n "$FFVER" ]] || die "can't read Firefox version from application.ini"

msg "Rebranding Firefox $FFVER -> Ignifox"
python3 "$IGNI_ROOT/tools/brandify.py" omni "$INST"

install_ignifox "$INST"

VERSION="$FFVER-$IGNI_SUFFIX"
echo "$VERSION" > "$INST/IGNIFOX_VERSION"
make_tarball "$INST" "$VERSION" "$ARCH"
msg "Ignifox $VERSION ready in $DIST_DIR"
