/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Emberfox branding + default preferences.
// Baked into the browser as the branding pref file (replaces firefox-branding.js).
// Everything here is a *default*: users can change it in Settings or Ember Studio.
// The non-negotiable telemetry kill-switches are locked separately in emberfox.cfg.

// ------------------------------------------------------------- branding
pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "about:ember#welcome");
pref("startup.homepage_welcome_url.additional", "");
pref("app.update.url.manual", "https://github.com/rxvy-dev/emberfox/releases");
pref("app.update.url.details", "https://github.com/rxvy-dev/emberfox/releases");
pref("app.releaseNotesURL", "https://github.com/rxvy-dev/emberfox/releases");
pref("app.releaseNotesURL.aboutDialog", "https://github.com/rxvy-dev/emberfox/releases");
pref("app.releaseNotesURL.prompt", "https://github.com/rxvy-dev/emberfox/releases");
pref("app.update.interval", 86400);
pref("app.update.promptWaitTime", 691200);
pref("app.update.checkInstallTime.days", 63);
pref("app.update.badgeWaitTime", 345600);
pref("devtools.selfxss.count", 5);

// --------------------------------------------------- no nagging / clutter
pref("browser.shell.checkDefaultBrowser", false);
pref("browser.aboutwelcome.enabled", false);
pref("browser.preferences.moreFromMozilla", false);
pref("browser.vpn_promo.enabled", false);
pref("browser.ipProtection.enabled", false);
pref("extensions.pocket.enabled", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.showSponsoredCheckboxes", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.newtabpage.activity-stream.default.sites", "");
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons", false);
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.urlbar.trending.featureGate", false);
pref("browser.urlbar.addons.featureGate", false);
pref("browser.urlbar.mdn.featureGate", false);
pref("browser.urlbar.weather.featureGate", false);
pref("browser.urlbar.yelp.featureGate", false);
pref("browser.tabs.firefox-view", false);
pref("browser.messaging-system.whatsNewPanel.enabled", false);
pref("identity.fxaccounts.toolbar.pxiToolbarEnabled", false);

// -------------------------------------------- AI off by default (opt-in)
pref("browser.ml.chat.enabled", false);
pref("browser.ml.linkPreview.enabled", false);
pref("browser.tabs.groups.smart.enabled", false);
pref("browser.smartwindow.enabled", false);

// ---------------------------------------------- sensible privacy defaults
pref("browser.contentblocking.category", "strict");
pref("privacy.globalprivacycontrol.enabled", true);
pref("dom.security.https_only_mode", true);
pref("dom.security.https_only_mode_send_http_background_request", false);
pref("network.http.referer.XOriginTrimmingPolicy", 2);
pref("network.prefetch-next", false);
pref("network.dns.disablePrefetch", true);
pref("network.predictor.enabled", false);
pref("browser.urlbar.speculativeConnect.enabled", false);
pref("browser.places.speculativeConnect.enabled", false);
pref("media.peerconnection.ice.default_address_only", true);
pref("browser.safebrowsing.downloads.remote.enabled", false);
pref("geo.provider.network.url", "https://api.beacondb.net/v1/geolocate");
pref("browser.search.suggest.enabled.private", false);
pref("signon.management.page.breach-alerts.enabled", false);
pref("extensions.webcompat-reporter.enabled", false);

// ------------------------------------------------------ power-user goodies
pref("toolkit.legacyUserProfileCustomizations.stylesheets", true); // userChrome.css works out of the box
pref("browser.compactmode.show", true);
pref("browser.tabs.closeTabByDblclick", true);
pref("browser.tabs.loadBookmarksInTabs", false);
pref("browser.bookmarks.openInTabClosesMenu", false);
pref("browser.tabs.splitView.enabled", true);
pref("browser.tabs.groups.enabled", true);
pref("browser.download.autohideButton", false);
pref("browser.download.always_ask_before_handling_new_types", true);
pref("browser.urlbar.trimHttps", true);
pref("findbar.highlightAll", true);
pref("layout.word_select.eat_space_to_next_word", false);
pref("full-screen-api.warning.timeout", 0);
pref("widget.use-xdg-desktop-portal.file-picker", 1);
