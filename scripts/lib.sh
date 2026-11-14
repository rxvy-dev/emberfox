#!/usr/bin/env bash
# Shared helpers for Ignifox build scripts.
set -euo pipefail

IGNI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IGNI_VERSION_FILE="$IGNI_ROOT/VERSION"
export IGNI_SUFFIX
IGNI_SUFFIX="$(cat "$IGNI_VERSION_FILE" 2>/dev/null || echo 1)"   # Ignifox release number on top of Firefox's
BUILD_DIR="${BUILD_DIR:-$IGNI_ROOT/build}"
DIST_DIR="${DIST_DIR:-$IGNI_ROOT/dist}"

msg()  { printf '\033[1;31m🔥\033[0m \033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  local missing=()
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || missing+=("$c"); done
  if ((${#missing[@]})); then
    die "missing tools: ${missing[*]}  (see README 'Build dependencies')"
  fi
}

host_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x86_64 ;;
    aarch64|arm64) echo aarch64 ;;
    *) die "unsupported architecture $(uname -m) (Mozilla ships x86_64 and aarch64 Linux builds)" ;;
  esac
}

# Files that report to Mozilla or exist only to do so. Removed from every build.
TELEMETRY_BINARIES=(crashreporter crashreporter.ini crashhelper minidump-analyzer pingsender
                    updater updater.ini update-settings.ini icons/updater.png
                    Throbber-small.gif precomplete removed-files)

# install_ignifox <install-dir> : strip telemetry binaries + drop in Ignifox engine, prefs, policies.
install_ignifox() {
  local inst="$1"
  [[ -f "$inst/omni.ja" ]] || die "$inst does not look like a Firefox/Ignifox install"

  msg "Stripping telemetry & updater binaries"
  for f in "${TELEMETRY_BINARIES[@]}"; do rm -rf "${inst:?}/$f"; done

  msg "Installing locked privacy config + policies"
  install -Dm644 "$IGNI_ROOT/settings/defaults/pref/autoconfig.js" "$inst/defaults/pref/autoconfig.js"
  install -Dm644 "$IGNI_ROOT/settings/ignifox.cfg" "$inst/ignifox.cfg"
  install -Dm644 "$IGNI_ROOT/settings/distribution/policies.json" "$inst/distribution/policies.json"
  # Mozilla's partner distribution file advertises "Mozilla" as distributor.
  rm -f "$inst/distribution/distribution.ini"

  msg "Installing Ignifox Studio engine"
  rm -rf "$inst/studio"
  cp -r "$IGNI_ROOT/studio" "$inst/studio"
  find "$inst/studio" -type f -exec chmod 644 {} +

  # App identity: own name, own profile folder, own window class / Wayland app-id.
  if [[ -f "$inst/application.ini" ]] && grep -q '^Name=Firefox' "$inst/application.ini"; then
    msg "Writing Ignifox application.ini"
    sed -e '/^;/d' -e 's/^Vendor=.*/Vendor=Ignifox/' \
        -e 's/^Name=.*/Name=Ignifox/' \
        -e 's/^RemotingName=.*/RemotingName=ignifox/' \
        -e '/^\[Crash Reporter\]/,/^\[/{s/^Enabled=.*/Enabled=0/;/^ServerURL=/d}' \
        -e '/^\[AppUpdate\]/,/^\[/{/^URL=/d}' \
        "$inst/application.ini" > "$inst/browser/application.ini"
  fi

  # Repacks keep Mozilla's "firefox" binary and get an "ignifox" launcher.
  # Source builds already produce a native "ignifox" binary.
  if [[ -x "$inst/firefox" && ! -e "$inst/ignifox-bin" ]]; then
    install -Dm755 "$IGNI_ROOT/packaging/ignifox.sh" "$inst/ignifox"
  fi
  install -Dm644 "$IGNI_ROOT/packaging/ignifox.desktop" "$inst/ignifox.desktop"
  for s in 16 22 24 32 48 64 128 256 512; do
    install -Dm644 "$IGNI_ROOT/branding/icons/default$s.png" "$inst/icons/hicolor/${s}x${s}/apps/ignifox.png"
  done
  install -Dm644 "$IGNI_ROOT/branding/logo.svg" "$inst/icons/hicolor/scalable/apps/ignifox.svg"
  install -Dm755 "$IGNI_ROOT/packaging/install.sh" "$inst/install.sh"
  install -Dm644 "$IGNI_ROOT/LICENSE" "$inst/LICENSE.ignifox"
}

# make_tarball <install-dir> <version> <arch>
make_tarball() {
  local inst="$1" ver="$2" arch="$3"
  mkdir -p "$DIST_DIR"
  local out="$DIST_DIR/ignifox-$ver-linux-$arch.tar.xz"
  msg "Packing $(basename "$out")"
  tar -C "$(dirname "$inst")" --owner=0 --group=0 -cJf "$out" "$(basename "$inst")"
  (cd "$DIST_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
  echo "$out"
}
