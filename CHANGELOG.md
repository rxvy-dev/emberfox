# Changelog

Emberfox versions are `<Firefox version>-<Emberfox revision>`, e.g. `160.0.1-1`.
A new Firefox release automatically produces a new Emberfox release (revision 1);
Emberfox-only changes bump the revision.

## Unreleased: first public release

### Privacy
- All telemetry, studies, Normandy/Nimbus experiments, usage pings, attribution and crash-report upload prefs **locked** off via autoconfig, backed by enterprise policies.
- Crash reporter, crash helper, ping sender, minidump analyzer and updater binaries removed from every build.
- Sponsored tiles and stories, Pocket, Firefox Suggest ads, VPN and "More from Mozilla" promos, and default-browser nags removed.
- AI features blocked by default (local translations remain available).
- Strict tracking protection, HTTPS-only, Global Privacy Control, cross-site referrer trimming, no speculative connections, BeaconDB geolocation.
- `./build.sh audit` verifies every build; Studio shows a live no-telemetry proof panel.

### Ember Studio (`about:ember`)
- 10 themes, a 7-color palette editor, saved themes, shareable theme codes, quick accent swap.
- Tab strip top / below the bar / vertical / hidden; sidebar side; bookmarks bar modes.
- Move any toolbar button between areas or hide it; Classic / Minimal / Power toolbar layouts.
- Focus mode (Ctrl+Alt+Z), corner radius, tab widths, density, interface font and size.
- Balanced / Hardened / Fortress privacy levels plus 25 fine-tune switches, including DoH providers.
- Custom CSS editor with live reload and snippets; export/import of the whole setup.
- First-run welcome wizard.
- Update notifier (GitHub releases only, no identifiers, can be turned off).

### Packaging
- One-line graphical installer: `curl -fsSL https://raw.githubusercontent.com/rxvy-dev/emberfox/main/install.sh | bash`. zenity/kdialog GUI with whiptail/text fallback; just-me, everyone or Flatpak; checksum-verified; update and uninstall on re-run.
- Universal tarball + `install.sh`, AppImage, Flatpak, `.deb`, `.rpm`, Arch PKGBUILD, Void template, Gentoo ebuild; x86_64 and aarch64.
- Automatic releases when Mozilla ships a new Firefox.
