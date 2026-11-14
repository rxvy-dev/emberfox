#!/usr/bin/env bash
# Emberfox installer: graphical installer for every Linux distro.
#
#   curl -fsSL https://raw.githubusercontent.com/rxvy-dev/emberfox/main/install.sh | bash
#   wget -qO-  https://raw.githubusercontent.com/rxvy-dev/emberfox/main/install.sh | bash
#
# Opens a GUI (zenity on GNOME/GTK desktops, kdialog on KDE). Falls back to a
# terminal UI (whiptail/dialog) or plain prompts when no GUI toolkit is around.
#
# Options (append after `bash -s --` when piping, e.g. `| bash -s -- --user`):
#   --user        install just for you (no password)      --system   for everyone
#   --flatpak     install the Flatpak                     --uninstall
#   --cli         force the terminal UI                   --yes      accept defaults, no questions
#   --no-launch   don't start Emberfox at the end         --version vX.Y-N   a specific release
set -euo pipefail

REPO="rxvy-dev/emberfox"
RAW="https://raw.githubusercontent.com/$REPO/main"
API="https://api.github.com/repos/$REPO/releases"
TITLE="Emberfox Installer"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/emberfox-install.XXXXXX")"
# A closed progress window must never kill the installer (SIGPIPE): writes just fail.
trap '' PIPE
# GTK dialogs reject non-ASCII arguments under a non-UTF-8 locale; make sure we have one.
if [[ "$(locale charmap 2>/dev/null)" != UTF-8 ]]; then
  for l in C.UTF-8 C.utf8 en_US.UTF-8; do
    if locale -a 2>/dev/null | grep -qix "${l/UTF-8/utf8}\|$l"; then export LC_ALL="$l"; break; fi
  done
fi
trap 'exec 3>&- 2>/dev/null || true; rm -rf "$TMP"' EXIT

MODE=""; ACTION=""; FORCE_CLI=0; ASSUME_YES=0; LAUNCH=1; WANT_TAG=""
while (($#)); do
  case "$1" in
    --user) MODE=user ;;
    --system) MODE=system ;;
    --flatpak) MODE=flatpak ;;
    --uninstall) ACTION=uninstall ;;
    --cli) FORCE_CLI=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --no-launch) LAUNCH=0 ;;
    --version) WANT_TAG="$2"; shift ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]:-$0}" 2>/dev/null || echo "see $RAW/install.sh"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# --------------------------------------------------------------- fetching
if command -v curl >/dev/null 2>&1; then
  fetch()     { curl -fsSL --retry 3 -o "$2" "$1"; }
  fetch_out() { curl -fsSL --retry 3 "$1"; }
  final_url() { curl -fsSIL -o /dev/null -w '%{url_effective}' "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch()     { wget -q --tries=3 -O "$2" "$1"; }
  fetch_out() { wget -q --tries=3 -O- "$1"; }
  final_url() { wget -q -O /dev/null --server-response "$1" 2>&1 | awk 'tolower($1)=="location:"{u=$2} END{print u}' | tr -d '\r'; }
else
  echo "Emberfox installer needs curl or wget." >&2; exit 1
fi

# ------------------------------------------------------------------- UI
TTY=/dev/tty
have() { command -v "$1" >/dev/null 2>&1; }
gui_session() { [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; }
has_tty() { [[ -r $TTY && -w $TTY ]] && (: <"$TTY") 2>/dev/null; }

# Dark installer windows to match Emberfox (libadwaita/zenity 4, and GTK3 zenity/yad).
export ADW_DEBUG_COLOR_SCHEME="${ADW_DEBUG_COLOR_SCHEME:-prefer-dark}"
export GTK_THEME="${GTK_THEME:-Adwaita:dark}"

UI=text
if ((!FORCE_CLI)) && gui_session && have zenity; then UI=zenity
elif ((!FORCE_CLI)) && gui_session && have kdialog; then UI=kdialog
elif has_tty && have whiptail; then UI=whiptail
elif has_tty && have dialog; then UI=dialog
elif has_tty; then UI=text
elif ((ASSUME_YES)); then UI=none
else echo "No GUI, terminal or --yes: nothing to ask questions with." >&2; exit 1
fi

ICON="$TMP/emberfox.png"
fetch "$RAW/branding/icons/default128.png" "$ICON" 2>/dev/null || ICON=""
ZOPTS=(--title="$TITLE" --width=560)
if [[ $UI == zenity && -n $ICON ]]; then
  zhelp="$(zenity --help-all 2>/dev/null || true)"
  [[ $zhelp == *--window-icon* ]] && ZOPTS+=(--window-icon="$ICON")
  [[ $zhelp == *"--icon="* || $zhelp == *"--icon "* ]] && ZICON=(--icon="$ICON") || ZICON=()
else
  ZICON=()
fi
KOPTS=(--title "$TITLE"); [[ -n $ICON ]] && KOPTS+=(--icon "$ICON")
plain() { sed -e 's/<[^>]*>//g' -e 's/&amp;/\&/g' -e 's/\\n/\n/g'; }   # pango markup -> plain text
tui() { "$UI" --backtitle "$TITLE" "$@" 3>&1 1>&2 2>&3 <"$TTY" >"$TTY"; }

ui_info() {
  case $UI in
    zenity) zenity --info "${ZOPTS[@]}" "${ZICON[@]}" --text="$1" 2>/dev/null || true ;;
    kdialog) kdialog "${KOPTS[@]}" --msgbox "$(plain <<<"$1")" || true ;;
    whiptail|dialog) tui --msgbox "$(plain <<<"$1")" 16 74 || true ;;
    text) printf '\n%s\n' "$(plain <<<"$1")" >"$TTY" ;;
    none) plain <<<"$1" ;;
  esac
}

ui_error() {
  case $UI in
    zenity) zenity --error "${ZOPTS[@]}" --text="$1" 2>/dev/null || true ;;
    kdialog) kdialog "${KOPTS[@]}" --error "$(plain <<<"$1")" || true ;;
    whiptail|dialog) tui --msgbox "ERROR\n\n$(plain <<<"$1")" 14 74 || true ;;
    *) printf '\nERROR: %s\n' "$(plain <<<"$1")" >&2 ;;
  esac
}

die() { ui_error "$1"; exit 1; }

# ui_yesno TEXT [yes-label] [no-label]
ui_yesno() {
  local y="${2:-Yes}" n="${3:-No}"
  ((ASSUME_YES)) && return 0
  case $UI in
    zenity) zenity --question "${ZOPTS[@]}" "${ZICON[@]}" --text="$1" --ok-label="$y" --cancel-label="$n" 2>/dev/null ;;
    kdialog) kdialog "${KOPTS[@]}" --yes-label "$y" --no-label "$n" --yesno "$(plain <<<"$1")" ;;
    whiptail) tui --yes-button "$y" --no-button "$n" --yesno "$(plain <<<"$1")" 16 74 ;;
    dialog) tui --yes-label "$y" --no-label "$n" --yesno "$(plain <<<"$1")" 16 74 ;;
    text)
      local a; printf '\n%s\n[%s/%s] (Enter = %s): ' "$(plain <<<"$1")" "$y" "$n" "$y" >"$TTY"
      read -r a <"$TTY"; [[ -z $a || ${a,,} == y* || ${a,,} == "${y,,}" ]] ;;
  esac
}

# ui_choice TEXT "key|label|default(on/off)"...   -> echoes chosen key
ui_choice() {
  local text="$1"; shift
  local def="" item k l s
  for item in "$@"; do IFS='|' read -r k l s <<<"$item"; [[ $s == on && -z $def ]] && def=$k; done
  ((ASSUME_YES)) && { echo "$def"; return 0; }
  case $UI in
    zenity)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$([[ $s == on ]] && echo TRUE || echo FALSE)" "$k" "$l"); done
      zenity --list --radiolist "${ZOPTS[@]}" --ok-label="Next" --cancel-label="Cancel" --height=$((190 + 34 * $#)) --text="$text" \
        --column="" --column="key" --column="Option" --hide-column=2 --print-column=2 --hide-header "${rows[@]}" 2>/dev/null ;;
    kdialog)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$k" "$l" "$s"); done
      kdialog "${KOPTS[@]}" --radiolist "$(plain <<<"$text")" "${rows[@]}" ;;
    whiptail|dialog)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$k" "$l" "$([[ $s == on ]] && echo ON || echo OFF)"); done
      tui --notags --radiolist "$(plain <<<"$text")" 20 78 $# "${rows[@]}" ;;
    text)
      local i=1 keys=() a
      printf '\n%s\n' "$(plain <<<"$text")" >"$TTY"
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; keys+=("$k"); printf '  %d) %s%s\n' $i "$l" "$([[ $k == "$def" ]] && echo '  (default)')" >"$TTY"; i=$((i + 1)); done
      printf 'Choose [1-%d]: ' $# >"$TTY"; read -r a <"$TTY"
      if [[ $a =~ ^[0-9]+$ ]] && ((a >= 1 && a <= $#)); then echo "${keys[$((a - 1))]}"; else echo "$def"; fi ;;
  esac
}

# ui_checklist TEXT "key|label|on/off"...   -> echoes chosen keys, space separated
ui_checklist() {
  local text="$1"; shift
  local item k l s defs=()
  for item in "$@"; do IFS='|' read -r k l s <<<"$item"; [[ $s == on ]] && defs+=("$k"); done
  ((ASSUME_YES)) && { echo "${defs[*]}"; return 0; }
  case $UI in
    zenity)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$([[ $s == on ]] && echo TRUE || echo FALSE)" "$k" "$l"); done
      zenity --list --checklist "${ZOPTS[@]}" --ok-label="Install" --cancel-label="Cancel" --height=$((190 + 34 * $#)) --text="$text" --separator=" " \
        --column="" --column="key" --column="Option" --hide-column=2 --print-column=2 --hide-header "${rows[@]}" 2>/dev/null ;;
    kdialog)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$k" "$l" "$s"); done
      kdialog "${KOPTS[@]}" --checklist "$(plain <<<"$text")" "${rows[@]}" | tr -d '"' ;;
    whiptail|dialog)
      local rows=()
      for item in "$@"; do IFS='|' read -r k l s <<<"$item"; rows+=("$k" "$l" "$([[ $s == on ]] && echo ON || echo OFF)"); done
      tui --notags --separate-output --checklist "$(plain <<<"$text")" 20 78 $# "${rows[@]}" | tr '\n' ' ' ;;
    text)
      local out=()
      printf '\n%s\n' "$(plain <<<"$text")" >"$TTY"
      for item in "$@"; do
        IFS='|' read -r k l s <<<"$item"
        if ui_yesno "  $l?" "y" "n"; then out+=("$k"); fi
      done
      echo "${out[*]}" ;;
  esac
}

# Progress window: progress_start TEXT / progress PCT MSG / progress_end
KDREF=""
QDBUS="$(command -v qdbus6 || command -v qdbus || command -v qdbus-qt5 || true)"
progress_start() {
  case $UI in
    zenity) exec 3> >(zenity --progress "${ZOPTS[@]}" --text="$1" --percentage=0 --auto-close --no-cancel 2>/dev/null) ;;
    whiptail|dialog) exec 3> >("$UI" --backtitle "$TITLE" --gauge "$(plain <<<"$1")" 8 74 0 >"$TTY" 2>&1) ;;
    kdialog) [[ -n $QDBUS ]] && KDREF="$(kdialog "${KOPTS[@]}" --progressbar "$(plain <<<"$1")" 100 2>/dev/null || true)" ;;
    *) printf '\n%s\n' "$(plain <<<"$1")" ;;
  esac
}
progress() {
  local pct="$1" msg="$2"
  case $UI in
    zenity) printf '%s\n# %s\n' "$pct" "$msg" >&3 2>/dev/null || true ;;
    whiptail|dialog) printf 'XXX\n%s\n%s\nXXX\n' "$pct" "$msg" >&3 2>/dev/null || true ;;
    kdialog)
      if [[ -n $KDREF ]]; then
        # shellcheck disable=SC2086 # KDREF is "service path"
        "$QDBUS" $KDREF Set "" value "$pct" >/dev/null 2>&1 || true
        # shellcheck disable=SC2086
        "$QDBUS" $KDREF setLabelText "$msg" >/dev/null 2>&1 || true
      fi ;;
    text) printf '\r  [%3s%%] %-60s' "$pct" "$msg" >"$TTY" ;;
    none) printf '[%3s%%] %s\n' "$pct" "$msg" ;;
  esac
}
progress_end() {
  case $UI in
    zenity|whiptail|dialog) progress 100 "Done"; exec 3>&- || true; sleep 0.4 ;;
    kdialog)
      # shellcheck disable=SC2086
      if [[ -n $KDREF ]]; then "$QDBUS" $KDREF close >/dev/null 2>&1 || true; fi ;;
    text) printf '\n' >"$TTY" ;;
  esac
}

human() { awk -v b="$1" 'BEGIN{ if (b>=1048576) printf "%.1f MB", b/1048576; else printf "%d KB", b/1024 }'; }

# download URL OUT SIZE BASE_PCT SPAN_PCT LABEL : download with live progress
download() {
  local url="$1" dest="$2" size="${3:-0}" base="$4" span="$5" label="$6" have pct
  fetch "$url" "$dest" &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    have=$(stat -c %s "$dest" 2>/dev/null || echo 0)
    if ((size > 0)); then pct=$((base + have * span / size)); else pct=$base; fi
    ((pct > base + span)) && pct=$((base + span))
    if ((size > 0)); then progress "$pct" "$label  $(human "$have") / $(human "$size")"; else progress "$pct" "$label  $(human "$have")"; fi
    sleep 0.3
  done
  wait "$pid"
}

# ----------------------------------------------------------------- system
case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  *) die "Emberfox runs on x86_64 and ARM64 (aarch64). This machine is $(uname -m)." ;;
esac
MUSL=0
if ldd --version 2>&1 | grep -qi musl || [[ -e /lib/ld-musl-x86_64.so.1 || -e /lib/ld-musl-aarch64.so.1 ]]; then MUSL=1; fi
DISTRO="$( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-$NAME}") || uname -s)"

USER_PREFIX="$HOME/.local/opt/emberfox"
SYS_PREFIX="/opt/emberfox"
installed_where() {
  if [[ -f $SYS_PREFIX/EMBERFOX_VERSION ]]; then echo system
  elif [[ -f $USER_PREFIX/EMBERFOX_VERSION ]]; then echo user
  elif have flatpak && flatpak info dev.rxvy.Emberfox >/dev/null 2>&1; then echo flatpak
  fi
}
installed_version() {
  case "$1" in
    system) cat "$SYS_PREFIX/EMBERFOX_VERSION" ;;
    user) cat "$USER_PREFIX/EMBERFOX_VERSION" ;;
    flatpak) flatpak info dev.rxvy.Emberfox 2>/dev/null | awk -F': *' '/Version/{print $2; exit}' ;;
  esac
}

# Run a command as root, with a graphical password prompt when possible.
as_root() {
  if [[ $(id -u) == 0 ]]; then "$@"; return; fi
  if have sudo && [[ $UI == zenity || $UI == kdialog ]]; then
    local ask="$TMP/askpass"
    if [[ $UI == zenity ]]; then
      printf '#!/bin/sh\nexec zenity --password --title="%s" 2>/dev/null\n' "$TITLE" >"$ask"
    else
      printf '#!/bin/sh\nexec kdialog --title "%s" --password "Your password is needed to install Emberfox for everyone."\n' "$TITLE" >"$ask"
    fi
    chmod 700 "$ask"
    SUDO_ASKPASS="$ask" sudo -A "$@"
  elif have pkexec && gui_session; then pkexec "$@"
  elif have sudo; then sudo "$@" <"$TTY"
  elif have doas; then doas "$@" <"$TTY"
  else die "Installing for everyone needs sudo, doas or pkexec. Choose \"Just me\" instead."
  fi
}

# --------------------------------------------------------------- release
TAG=""; ASSETS="$TMP/assets.tsv"
resolve_release() {
  local json="$TMP/release.json" url="$API/latest"
  [[ -n $WANT_TAG ]] && url="$API/tags/$WANT_TAG"
  if fetch "$url" "$json" 2>/dev/null; then
    # Whitespace-agnostic: pull out just the fields we need, in document order.
    # Inside each asset, name -> size -> browser_download_url always come in that order.
    grep -oE '"(tag_name|name|size|browser_download_url)": *("[^"]*"|[0-9]+)' "$json" >"$TMP/fields" || true
    TAG=$(awk -F'"' '$2=="tag_name"{print $4; exit}' "$TMP/fields")
    awk -F'"' '
      $2=="name" {n=$4}
      $2=="size" {s=$3; gsub(/[^0-9]/,"",s)}
      $2=="browser_download_url" {print n "\t" s "\t" $4}' "$TMP/fields" >"$ASSETS"
  fi
  if [[ -z $TAG ]]; then   # API rate-limited or blocked: fall back to the redirect
    local where
    where="$(final_url "https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
    TAG="${WANT_TAG:-$(sed -n 's#.*/tag/##p' <<<"$where")}"
    : >"$ASSETS"
    # GitHub sends /releases/latest to plain /releases when nothing is published yet.
    if [[ -z $TAG && $where == */releases ]]; then
      die "Emberfox hasn't published a release yet.\n\nThe first build is on its way. Try again soon, or watch https://github.com/$REPO/releases"
    fi
  fi
  [[ -n $TAG ]] || die "Couldn't reach GitHub to find the latest Emberfox release.\n\nCheck your internet connection, or see https://github.com/$REPO/releases"
}
asset() {   # asset NAME -> "size<TAB>url" (url built from tag if the API listing is missing)
  local line; line=$(awk -F'\t' -v n="$1" '$1==n{print $2 "\t" $3; exit}' "$ASSETS")
  [[ -n $line ]] && echo "$line" || printf '0\thttps://github.com/%s/releases/download/%s/%s\n' "$REPO" "$TAG" "$1"
}

if [[ -n ${EMBERFOX_TARBALL:-} ]]; then          # testing hook: install a local build
  TAG="v$(basename "$EMBERFOX_TARBALL" | sed -E 's/^emberfox-(.*)-linux-.*/\1/')"
else
  resolve_release
fi
VER="${TAG#v}"

# ------------------------------------------------------------- uninstall
do_uninstall() {
  local where="$1"
  case "$where" in
    system) as_root "$SYS_PREFIX/install.sh" --uninstall ;;
    user) "$USER_PREFIX/install.sh" --uninstall --user ;;
    flatpak) flatpak uninstall -y --noninteractive dev.rxvy.Emberfox ;;
  esac >/dev/null
  ui_info "<b>Emberfox has been removed.</b>\n\nYour bookmarks, passwords and settings are kept in your profile in case you come back."
}

WHERE="$(installed_where || true)"
if [[ $ACTION == uninstall ]]; then
  [[ -n $WHERE ]] || die "Emberfox isn't installed."
  ui_yesno "Remove Emberfox $(installed_version "$WHERE") ($WHERE install)?" "Remove" "Cancel" || exit 0
  do_uninstall "$WHERE"; exit 0
fi

# -------------------------------------------------------------- welcome
if [[ -n $WHERE ]]; then
  CUR="$(installed_version "$WHERE" || true)"
  if [[ $CUR == "$VER" ]]; then
    PICK=$(ui_choice "<b>Emberfox $CUR is installed and up to date.</b>" \
      "reinstall|Reinstall Emberfox $VER|on" "uninstall|Uninstall Emberfox|off" "quit|Close|off") || exit 0
  else
    PICK=$(ui_choice "<b>Emberfox ${CUR:-?} is installed.</b> Version <b>$VER</b> is available." \
      "update|Update to $VER|on" "uninstall|Uninstall Emberfox|off" "quit|Close|off") || exit 0
  fi
  case "$PICK" in
    uninstall) do_uninstall "$WHERE"; exit 0 ;;
    update|reinstall) MODE="${MODE:-$WHERE}" ;;
    *) exit 0 ;;
  esac
else
  ui_yesno "<span size='x-large'><b>Welcome to Emberfox $VER</b></span>

Firefox's engine with every telemetry and data-upload channel locked off, no ads or sponsored junk, and <b>Ember Studio</b> for themes, colors and moving the whole UI around.

This will install Emberfox on <b>$DISTRO</b> ($ARCH)." "Install" "Cancel" || exit 0
fi

# ---------------------------------------------------------- where to go
if [[ -z $MODE ]]; then
  if ((MUSL)); then
    have flatpak || die "This system uses musl libc ($DISTRO), which Mozilla's engine doesn't support natively.\n\nInstall Flatpak (e.g. <tt>apk add flatpak</tt>), then run this installer again."
    MODE=flatpak
  else
    OPTS=("user|Just for me: no password needed (~/.local)|on"
          "system|For everyone on this computer: asks for your password (/opt)|off")
    have flatpak && OPTS+=("flatpak|Flatpak: sandboxed, updates with your other Flatpaks|off")
    MODE=$(ui_choice "<b>How should Emberfox be installed?</b>" "${OPTS[@]}") || exit 0
    [[ -n $MODE ]] || exit 0
  fi
fi

EXTRAS=$(ui_checklist "<b>Finishing touches</b>" \
  "default|Make Emberfox my default browser|on" \
  "launch|Open Emberfox when the install finishes|$([[ $LAUNCH == 1 ]] && echo on || echo off)") || EXTRAS=""

# -------------------------------------------------------------- install
progress_start "Installing Emberfox $VER..."

if [[ $MODE == flatpak ]]; then
  NAME="Emberfox-$VER-$ARCH.flatpak"
  IFS=$'\t' read -r SIZE URL < <(asset "$NAME")
  download "$URL" "$TMP/$NAME" "$SIZE" 0 70 "Downloading Emberfox" || { progress_end; die "Download failed:\n$URL"; }
  progress 75 "Adding Flathub (for the runtime)"
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo >/dev/null 2>&1 || true
  progress 80 "Installing Flatpak (first time can take a few minutes)"
  flatpak install --user -y --noninteractive "$TMP/$NAME" >/dev/null 2>&1 || { progress_end; die "Flatpak install failed. Try: flatpak install --user $NAME"; }
  DESKTOP_ID="dev.rxvy.Emberfox.desktop"; RUN=(flatpak run dev.rxvy.Emberfox)
else
  NAME="emberfox-$VER-linux-$ARCH.tar.xz"
  if [[ -n ${EMBERFOX_TARBALL:-} ]]; then
    cp "$EMBERFOX_TARBALL" "$TMP/$NAME"; progress 60 "Using local build"
  else
    IFS=$'\t' read -r SIZE URL < <(asset "$NAME")
    download "$URL" "$TMP/$NAME" "$SIZE" 0 60 "Downloading Emberfox" || { progress_end; die "Download failed:\n$URL"; }
    progress 62 "Verifying checksum"
    IFS=$'\t' read -r _ SUMURL < <(asset SHA256SUMS)
    if fetch "$SUMURL" "$TMP/SHA256SUMS" 2>/dev/null; then
      want=$(awk -v n="$NAME" '$2==n || $2=="*"n {print $1; exit}' "$TMP/SHA256SUMS")
      have_sum=$( (sha256sum "$TMP/$NAME" 2>/dev/null || shasum -a 256 "$TMP/$NAME") | cut -d' ' -f1)
      if [[ -n $want && $want != "$have_sum" ]]; then progress_end; die "Checksum mismatch: the download is corrupted or was tampered with. Nothing was installed."; fi
    fi
  fi
  progress 68 "Unpacking"
  tar -C "$TMP" -xJf "$TMP/$NAME" || { progress_end; die "Couldn't unpack the download (is xz installed?)."; }
  progress 85 "Installing"
  if [[ $MODE == system ]]; then
    as_root "$TMP/emberfox/install.sh" >/dev/null || { progress_end; die "Install for everyone failed (wrong password?)."; }
    RUN=(/usr/local/bin/emberfox)
  else
    "$TMP/emberfox/install.sh" --user >/dev/null || { progress_end; die "Install failed."; }
    RUN=("$HOME/.local/bin/emberfox")
  fi
  DESKTOP_ID="emberfox.desktop"
fi

if [[ " $EXTRAS " == *" default "* ]]; then
  progress 95 "Setting default browser"
  if have xdg-settings; then xdg-settings set default-web-browser "$DESKTOP_ID" >/dev/null 2>&1 || true; fi
  if have xdg-mime; then
    for t in x-scheme-handler/http x-scheme-handler/https text/html; do xdg-mime default "$DESKTOP_ID" "$t" >/dev/null 2>&1 || true; done
  fi
fi
progress_end

# ------------------------------------------------------------------ done
if [[ " $EXTRAS " == *" launch "* ]]; then
  ui_info "<span size='large'><b>Emberfox $VER is installed. 🔥</b></span>

It's in your app menu. Opening it now: the welcome screen walks you through themes, layout and privacy.

Tip: <b>Ctrl+Alt+E</b> opens Ember Studio any time."
  (setsid -f "${RUN[@]}" >/dev/null 2>&1 || nohup "${RUN[@]}" >/dev/null 2>&1 &) || true
else
  ui_info "<span size='large'><b>Emberfox $VER is installed. 🔥</b></span>

Find it in your app menu, or run <tt>${RUN[*]}</tt>.
Tip: <b>Ctrl+Alt+E</b> opens Ember Studio any time."
fi
