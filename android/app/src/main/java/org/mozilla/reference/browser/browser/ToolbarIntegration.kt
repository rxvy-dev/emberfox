/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.browser

import org.mozilla.reference.browser.ignifox.SiteTint
import org.mozilla.reference.browser.ignifox.ExtraKeys
import org.mozilla.reference.browser.ignifox.Burn
import org.mozilla.reference.browser.ignifox.AutoDelete
import android.widget.Toast
import android.graphics.Bitmap
import android.app.AlertDialog
import android.content.res.ColorStateList
import mozilla.components.concept.menu.candidate.TextStyle
import mozilla.components.concept.menu.MenuStyle
import org.mozilla.reference.browser.ignifox.Ignifox
import android.content.Context
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import mozilla.components.browser.domains.autocomplete.ShippedDomainsProvider
import mozilla.components.browser.menu2.BrowserMenuController
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.storage.sync.PlacesHistoryStorage
import mozilla.components.browser.toolbar.BrowserToolbar
import mozilla.components.browser.toolbar.display.DisplayToolbar
import mozilla.components.concept.menu.MenuController
import mozilla.components.concept.menu.candidate.CompoundMenuCandidate
import mozilla.components.concept.menu.candidate.ContainerStyle
import mozilla.components.concept.menu.candidate.DrawableMenuIcon
import mozilla.components.concept.menu.candidate.MenuCandidate
import mozilla.components.concept.menu.candidate.RowMenuCandidate
import mozilla.components.concept.menu.candidate.SmallMenuCandidate
import mozilla.components.concept.menu.candidate.TextMenuCandidate
import mozilla.components.feature.pwa.WebAppUseCases
import mozilla.components.feature.session.SessionUseCases
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.feature.toolbar.ToolbarAutocompleteFeature
import mozilla.components.feature.toolbar.ToolbarFeature
import mozilla.components.lib.state.ext.flow
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.base.feature.UserInteractionHandler
import mozilla.components.support.ktx.android.view.ImeInsetsSynchronizer
import org.mozilla.reference.browser.R
import org.mozilla.reference.browser.addons.AddonsActivity
import org.mozilla.reference.browser.ext.components
import org.mozilla.reference.browser.ext.share
import org.mozilla.reference.browser.settings.SettingsActivity
import org.mozilla.reference.browser.tabs.synced.SyncedTabsActivity

/**
 * Wires the browser toolbar to the selected tab, or to the tab given by [sessionId]: URL loading and search,
 * autocomplete, the overflow menu and keeping the toolbar above the keyboard.
 */
@Suppress("LongParameterList")
class ToolbarIntegration(
    private val context: Context,
    private val toolbar: BrowserToolbar,
    toolbarParentView: View,
    historyStorage: PlacesHistoryStorage,
    private val store: BrowserStore,
    private val sessionUseCases: SessionUseCases,
    private val tabsUseCases: TabsUseCases,
    private val webAppUseCases: WebAppUseCases,
    sessionId: String? = null,
) : LifecycleAwareFeature, UserInteractionHandler {
    private val shippedDomainsProvider =
        ShippedDomainsProvider().also {
            it.initialize(context)
        }

    private val palette = Ignifox.palette(context)
    private val menuText = TextStyle(color = palette.fg)
    private val barOnTop = Ignifox.prefs(context).getString(Ignifox.BAR_POSITION, "bottom") == "top"
    private val scope = MainScope()
    private var menuUpdateJob: Job? = null
    private var tintJob: kotlinx.coroutines.Job? = null

    private fun menuToolbar(session: SessionState?): RowMenuCandidate {
        val tint = palette.fg

        val forward =
            SmallMenuCandidate(
                contentDescription = "Forward",
                icon =
                    DrawableMenuIcon(
                        context,
                        mozilla.components.ui.icons.R.drawable.mozac_ic_forward_24,
                        tint = tint,
                    ),
                containerStyle = ContainerStyle(isEnabled = session?.content?.canGoForward == true),
            ) {
                sessionUseCases.goForward.invoke()
            }

        val refresh =
            SmallMenuCandidate(
                contentDescription = "Refresh",
                icon =
                    DrawableMenuIcon(
                        context,
                        mozilla.components.ui.icons.R.drawable.mozac_ic_arrow_clockwise_24,
                        tint = tint,
                    ),
            ) {
                sessionUseCases.reload.invoke()
            }

        val stop =
            SmallMenuCandidate(
                contentDescription = "Stop",
                icon =
                    DrawableMenuIcon(
                        context,
                        mozilla.components.ui.icons.R.drawable.mozac_ic_cross_24,
                        tint = tint,
                    ),
            ) {
                sessionUseCases.stopLoading.invoke()
            }

        return RowMenuCandidate(listOf(forward, refresh, stop))
    }

    private fun sessionMenuItems(sessionState: SessionState): List<MenuCandidate> =
        listOfNotNull(
            menuToolbar(sessionState),
            TextMenuCandidate("Share", textStyle = menuText) {
                val url = sessionState.content.url
                context.share(url)
            },
            CompoundMenuCandidate(
                text = "Request desktop site",
                textStyle = menuText,
                isChecked = sessionState.content.desktopMode,
                end = CompoundMenuCandidate.ButtonType.SWITCH,
            ) { checked ->
                sessionUseCases.requestDesktopSite.invoke(checked)
            },
            if (webAppUseCases.isPinningSupported()) {
                TextMenuCandidate(
                    text = "Add to homescreen",
                    textStyle = menuText,
                    containerStyle = ContainerStyle(isVisible = webAppUseCases.isPinningSupported()),
                ) {
                    scope.launch { webAppUseCases.addToHomescreen() }
                }
            } else {
                null
            },
            TextMenuCandidate(text = "Find in Page", textStyle = menuText) {
                FindInPageIntegration.launch?.invoke()
            },
        )

    private fun menuItems(sessionState: SessionState?): List<MenuCandidate> {
        val sessionMenuItems =
            if (sessionState != null) {
                sessionMenuItems(sessionState)
            } else {
                emptyList()
            }

        return listOf(
            TextMenuCandidate(text = context.getString(R.string.igni_menu_new_tab), textStyle = menuText) {
                tabsUseCases.addTab(url = Ignifox.homeUrl(context), selectTab = true)
            },
            TextMenuCandidate(text = context.getString(R.string.igni_menu_private_tab), textStyle = menuText) {
                tabsUseCases.addTab(url = "about:privatebrowsing", selectTab = true, private = true)
            },
            TextMenuCandidate(text = context.getString(R.string.igni_menu_burn), textStyle = menuText) {
                AlertDialog.Builder(context)
                    .setTitle(R.string.igni_menu_burn)
                    .setMessage(R.string.igni_burn_confirm)
                    .setPositiveButton(R.string.igni_burn_go) { _, _ -> Burn.burn(context) }
                    .setNegativeButton(android.R.string.cancel, null)
                    .show()
            },
        ) +
            keepCookiesItem(sessionState) +
            sessionMenuItems +
            listOf(
                TextMenuCandidate(text = "Add-ons", textStyle = menuText) {
                    val intent = Intent(context, AddonsActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                },
                TextMenuCandidate(text = "Synced Tabs", textStyle = menuText) {
                    val intent = Intent(context, SyncedTabsActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                },
                TextMenuCandidate(text = context.getString(R.string.igni_studio), textStyle = menuText) {
                    val intent = Intent(context, SettingsActivity::class.java)
                    intent.putExtra(SettingsActivity.EXTRA_OPEN_STUDIO, true)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                },
                TextMenuCandidate(text = "Settings", textStyle = menuText) {
                    val intent = Intent(context, SettingsActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                },
            )
    }

    private val browserMenuController: MenuController =
        BrowserMenuController(style = MenuStyle(backgroundColor = ColorStateList.valueOf(palette.bg2)))

    init {
        toolbar.display.apply {
            indicators =
                listOf(
                    DisplayToolbar.Indicators.SECURITY,
                    DisplayToolbar.Indicators.TRACKING_PROTECTION,
                )
            displayIndicatorSeparator = true
            menuController = browserMenuController
            hint = context.getString(R.string.toolbar_hint)

            // The Ignifox New Tab is a local page: show the search hint instead of its file address.
            // (The private browsing start page is a built-in page too.)
            urlFormatter = { url -> if (Ignifox.isNewTab(url) || url.startsWith("data:text/html")) "" else url }
        }
        Ignifox.styleToolbar(toolbar)

        toolbar.edit.apply {
            hint = context.getString(R.string.toolbar_hint)
        }

        ToolbarAutocompleteFeature(toolbar).apply {
            updateAutocompleteProviders(listOf(historyStorage, shippedDomainsProvider))
        }

        if (!barOnTop) ImeInsetsSynchronizer.setup(
            targetView = toolbar,
            onIMEAnimationStarted = { isKeyboardShowingUp, keyboardHeight ->
                // If the keyboard is hiding have the engine view immediately expand to the entire height of the
                // screen and ensure the toolbar is shown above keyboard before both would be animated down.
                if (!isKeyboardShowingUp) {
                    (toolbarParentView.layoutParams as? ViewGroup.MarginLayoutParams)?.bottomMargin = 0
                    (toolbar.layoutParams as? ViewGroup.MarginLayoutParams)?.bottomMargin = keyboardHeight
                    toolbarParentView.requestLayout()
                }
            },
            onIMEAnimationFinished = { isKeyboardShowingUp, keyboardHeight ->
                // If the keyboard is showing up keep the engine view covering the entire height
                // of the screen until the animation is finished to avoid reflowing the web content
                // together with the keyboard animation in a short burst of updates.
                if (isKeyboardShowingUp || keyboardHeight == 0) {
                    (toolbarParentView.layoutParams as? ViewGroup.MarginLayoutParams)?.bottomMargin = keyboardHeight
                    (toolbar.layoutParams as? ViewGroup.MarginLayoutParams)?.bottomMargin = 0
                    toolbarParentView.requestLayout()
                }
            },
        )
    }

    private val toolbarFeature: ToolbarFeature =
        ToolbarFeature(
            toolbar,
            context.components.core.store,
            context.components.useCases.sessionUseCases.loadUrl,
            { searchTerms ->
                context.components.useCases.searchUseCases.defaultSearch.invoke(
                    searchTerms = searchTerms,
                    searchEngine = null,
                    parentSessionId = null,
                )
            },
            sessionId,
        )

    /** "Keep cookies for this site" when cookie auto-delete is on. */
    private fun keepCookiesItem(sessionState: SessionState?): List<MenuCandidate> {
        val url = sessionState?.content?.url ?: return emptyList()
        if (!Ignifox.prefs(context).getBoolean(ExtraKeys.AUTO_DELETE, false) || !url.startsWith("http")) return emptyList()
        return listOf(
            TextMenuCandidate(text = context.getString(R.string.igni_menu_keep), textStyle = menuText) {
                scope.launch {
                    val kept = AutoDelete.toggleKeep(context, url) ?: return@launch
                    Toast.makeText(
                        context,
                        if (kept) R.string.igni_keep_on else R.string.igni_keep_off,
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            },
        )
    }

    /** Toolbar tinted with the colour of the current site's icon (Studio → Look → Site tint). */
    private fun applyTint(icon: Bitmap?) {
        val p = Ignifox.prefs(context)
        val base = Ignifox.barBackground(palette)
        val color = if (p.getBoolean(ExtraKeys.SITE_TINT, false)) SiteTint.colorOf(icon) else null
        val strength = p.getInt(ExtraKeys.SITE_TINT_STRENGTH, DEFAULT_TINT).coerceIn(5, 80) / 100f
        toolbar.setBackgroundColor(if (color == null) base else Ignifox.blend(base, color, strength))
    }

    override fun start() {
        toolbarFeature.start()

        tintJob?.cancel()
        tintJob = scope.launch {
            store
                .flow()
                .map { state -> state.selectedTab?.content?.icon }
                .distinctUntilChanged()
                .collect { icon -> applyTint(icon) }
        }

        menuUpdateJob?.cancel()
        menuUpdateJob = scope.launch {
            store
                .flow()
                .map { state -> state.selectedTab }
                .distinctUntilChanged()
                .collect { tab ->
                    browserMenuController.submitList(menuItems(tab))
                }
        }
    }

    override fun stop() {
        toolbarFeature.stop()

        menuUpdateJob?.cancel()
        menuUpdateJob = null
        tintJob?.cancel()
        tintJob = null
    }

    override fun onBackPressed(): Boolean = toolbarFeature.onBackPressed()

    companion object {
        private const val DEFAULT_TINT = 35
    }
}
