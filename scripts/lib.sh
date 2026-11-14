#!/usr/bin/env bash
# Shared helpers for Emberfox build scripts.
set -euo pipefail

EMBER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMBER_VERSION_FILE="$EMBER_ROOT/VERSION"
export EMBER_SUFFIX
EMBER_SUFFIX="$(cat "$EMBER_VERSION_FILE" 2>/dev/null || echo 1)"   # Emberfox release number on top of Firefox's
BUILD_DIR="${BUILD_DIR:-$EMBER_ROOT/build}"
DIST_DIR="${DIST_DIR:-$EMBER_ROOT/dist}"

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

# install_ember <install-dir> : strip telemetry binaries + drop in Emberfox engine, prefs, policies.
install_ember() {
  local inst="$1"
  [[ -f "$inst/omni.ja" ]] || die "$inst does not look like a Firefox/Emberfox install"

  msg "Stripping telemetry & updater binaries"
  for f in "${TELEMETRY_BINARIES[@]}"; do rm -rf "${inst:?}/$f"; done

  msg "Installing locked privacy config + policies"
  install -Dm644 "$EMBER_ROOT/settings/defaults/pref/autoconfig.js" "$inst/defaults/pref/autoconfig.js"
  install -Dm644 "$EMBER_ROOT/settings/emberfox.cfg" "$inst/emberfox.cfg"
  install -Dm644 "$EMBER_ROOT/settings/distribution/policies.json" "$inst/distribution/policies.json"
  # Mozilla's partner distribution file advertises "Mozilla" as distributor.
  rm -f "$inst/distribution/distribution.ini"

  msg "Installing Ember Studio engine"
  rm -rf "$inst/ember"
  cp -r "$EMBER_ROOT/ember" "$inst/ember"
  find "$inst/ember" -type f -exec chmod 644 {} +

  # App identity: own name, own profile folder, own window class / Wayland app-id.
  if [[ -f "$inst/application.ini" ]] && grep -q '^Name=Firefox' "$inst/application.ini"; then
    msg "Writing Emberfox application.ini"
    sed -e '/^;/d' -e 's/^Vendor=.*/Vendor=Emberfox/' \
        -e 's/^Name=.*/Name=Emberfox/' \
        -e 's/^RemotingName=.*/RemotingName=emberfox/' \
        -e '/^\[Crash Reporter\]/,/^\[/{s/^Enabled=.*/Enabled=0/;/^ServerURL=/d}' \
        -e '/^\[AppUpdate\]/,/^\[/{/^URL=/d}' \
        "$inst/application.ini" > "$inst/browser/application.ini"
  fi

  # Repacks keep Mozilla's "firefox" binary and get an "emberfox" launcher.
  # Source builds already produce a native "emberfox" binary.
  if [[ -x "$inst/firefox" && ! -e "$inst/emberfox-bin" ]]; then
    install -Dm755 "$EMBER_ROOT/packaging/emberfox.sh" "$inst/emberfox"
  fi
  install -Dm644 "$EMBER_ROOT/packaging/emberfox.desktop" "$inst/emberfox.desktop"
  for s in 16 22 24 32 48 64 128 256 512; do
    install -Dm644 "$EMBER_ROOT/branding/icons/default$s.png" "$inst/icons/hicolor/${s}x${s}/apps/emberfox.png"
  done
  install -Dm644 "$EMBER_ROOT/branding/logo.svg" "$inst/icons/hicolor/scalable/apps/emberfox.svg"
  install -Dm755 "$EMBER_ROOT/packaging/install.sh" "$inst/install.sh"
  install -Dm644 "$EMBER_ROOT/LICENSE" "$inst/LICENSE.emberfox"
}

# make_tarball <install-dir> <version> <arch>
make_tarball() {
  local inst="$1" ver="$2" arch="$3"
  mkdir -p "$DIST_DIR"
  local out="$DIST_DIR/emberfox-$ver-linux-$arch.tar.xz"
  msg "Packing $(basename "$out")"
  tar -C "$(dirname "$inst")" --owner=0 --group=0 -cJf "$out" "$(basename "$inst")"
  (cd "$DIST_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
  echo "$out"
}
