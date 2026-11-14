# Changelog

Ignifox versions are `<Firefox version>-<Ignifox revision>`, e.g. `160.0.1-1`.
A new Firefox release automatically produces a new Ignifox release (revision 1);
Ignifox-only changes bump the revision.

## Unreleased

### Import
- Studio → Import finds Firefox (incl. Snap & Flatpak), LibreWolf, Waterfox, Floorp, Zen, Mullvad Browser and Emberfox profiles.
- Imports right away: bookmarks (your toolbar comes over as-is if yours is empty), a year of history, settings (Emberfox settings are renamed for Ignifox), userChrome/custom CSS, the Emberfox new tab wallpaper, extensions (reinstalled from addons.mozilla.org).
- Imports on next start, through the launcher: passwords, logins & cookies, open tabs, form history. Replaced files are backed up and profiles in use are never touched.
- Chrome-family browsers go through Firefox's built-in importer; also links to CSV password import and HTML bookmark import.
- The welcome screen offers import when it finds another browser.

### Fonts
- Import .ttf/.otf/.ttc/.woff/.woff2 into ~/.local/share/fonts/ignifox with live previews; use them for the interface, websites or the new tab clock and greeting.
- Website font settings: sans/serif/mono families, default and minimum size, force your own fonts. Font pickers list every installed font.

### More customization
- One-click looks: Classic, Zen-style, Arc-like, Chrome-like, Minimal, Hacker/TTY. 🎲 Surprise me random palettes (contrast-checked).
- Tab strip background: accent gradient or your own picture with darkening.
- Multi-row tabs (experimental), right-click menu clean-up (AI items hidden by default), recommended add-ons with one-click install.

### Renamed: Emberfox → Ignifox
- New name (Latin *ignis*, fire) and IGNIFOX wordmark; "Emberfox" was already used by other creators.
- Everything renamed: app, packages (`ignifox`, `dev.rxvy.Ignifox`), Studio (`about:ignifox`, Ctrl+Alt+I), prefs (`ignifox.*`), CSS variables (`--igni-*`), default theme (Ignis).
- Upgrading: the one-line installer removes an Emberfox install, moves its profile, and renames its Studio settings.

## 160.0-1: first public release (as Emberfox)

### Privacy
- All telemetry, studies, Normandy/Nimbus experiments, usage pings, attribution and crash-report upload prefs **locked** off via autoconfig, backed by enterprise policies.
- Crash reporter, crash helper, ping sender, minidump analyzer and updater binaries removed from every build.
- Sponsored tiles and stories, Pocket, Firefox Suggest ads, VPN and "More from Mozilla" promos, and default-browser nags removed.
- AI features blocked by default (local translations remain available).
- Strict tracking protection, HTTPS-only, Global Privacy Control, cross-site referrer trimming, no speculative connections, BeaconDB geolocation.
- `./build.sh audit` verifies every build; Studio shows a live no-telemetry proof panel.

### Ignifox Studio (`about:ignifox`)
- 10 themes, a 7-color palette editor, saved themes, shareable theme codes, quick accent swap.
- Tab strip top / below the bar / vertical / hidden; sidebar side; bookmarks bar modes.
- Move any toolbar button between areas or hide it; Classic / Minimal / Power toolbar layouts.
- Focus mode (Ctrl+Alt+Z), corner radius, tab widths, density, interface font and size.
- Balanced / Hardened / Fortress privacy levels plus 25 fine-tune switches, including DoH providers.
- Custom CSS editor with live reload and snippets; export/import of the whole setup.
- First-run welcome wizard.
- Update notifier (GitHub releases only, no identifiers, can be turned off).

### Ignifox New Tab
- Custom start page with clock, date, greeting, search box with engine switcher and `@keyword` routing, editable shortcut tiles, optional most-visited sites, notes.
- Wallpapers: animated embers, aurora, gradient, solid, or your own picture (dim + blur); 3 layouts; 4 tile styles. Also usable as the home page.
- Runs as an unprivileged local page; settings are written into it by the engine. No network use unless site icons are enabled.

### Search
- Studio → Search: one-click default engine, separate private-window engine, 25 one-click engines (★ to add and make default), custom engines from any `%s` URL, editable keywords, suggestion toggles.

### More customization
- Tab styles (pills, underline, boxy), tab height, floating page card, interface scale, scrollbar styles, overlay scrollbars, compact menus, address bar max width, icon-only bookmarks.
- Container tabs, recently-used Ctrl+Tab, spell check mode, downloads panel, open bookmarks/address-bar results in new tabs, link to keyboard shortcut editor (about:keyboard).
- Separate search bar available in the Placement button list.

### Packaging
- One-line graphical installer: `curl -fsSL https://raw.githubusercontent.com/rxvy-dev/ignifox/main/install.sh | bash`. zenity/kdialog GUI with whiptail/text fallback; just-me, everyone or Flatpak; checksum-verified; update and uninstall on re-run.
- Universal tarball + `install.sh`, AppImage, Flatpak, `.deb`, `.rpm`, Arch PKGBUILD, Void template, Gentoo ebuild; x86_64 and aarch64.
- Automatic releases when Mozilla ships a new Firefox.
