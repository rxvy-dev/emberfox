/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser

import org.mozilla.reference.browser.ignifox.Updates
import org.mozilla.reference.browser.ignifox.UBlock
import org.mozilla.reference.browser.ignifox.ToolbarSwipe
import org.mozilla.reference.browser.ignifox.Burn
import androidx.lifecycle.lifecycleScope
import android.view.MotionEvent
import mozilla.components.browser.state.selector.selectedTab
import org.mozilla.reference.browser.ignifox.Ignifox
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.AttributeSet
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.snackbar.Snackbar.LENGTH_LONG
import mozilla.components.browser.state.state.WebExtensionState
import mozilla.components.concept.engine.EngineView
import mozilla.components.feature.intent.ext.EXTRA_SESSION_ID
import mozilla.components.lib.crash.Crash
import mozilla.components.support.base.feature.ActivityResultHandler
import mozilla.components.support.base.feature.UserInteractionHandler
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.ktx.android.view.setupPersistentInsets
import mozilla.components.support.utils.SafeIntent
import mozilla.components.support.webextensions.WebExtensionPopupObserver
import org.mozilla.reference.browser.addons.WebExtensionActionPopupActivity
import org.mozilla.reference.browser.browser.BrowserFragment
import org.mozilla.reference.browser.browser.CrashIntegration
import org.mozilla.reference.browser.ext.components

/** Activity that holds the [BrowserFragment]. */
open class BrowserActivity : AppCompatActivity() {
    private lateinit var crashIntegration: CrashIntegration

    private val sessionId: String?
        get() = SafeIntent(intent).getStringExtra(EXTRA_SESSION_ID)

    private val webExtensionPopupObserver by lazy {
        WebExtensionPopupObserver(components.core.store, ::openPopup)
    }

    /** Returns a new instance of [BrowserFragment] to display. */
    open fun createBrowserFragment(sessionId: String?): Fragment = BrowserFragment.create(sessionId)

    private var studioRevision = 0
    private val toolbarSwipe by lazy { ToolbarSwipe(this) { direction -> switchTab(direction) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        Ignifox.applyTheme(this, actionBar = false)
        studioRevision = Ignifox.revision(this)
        setContentView(R.layout.activity_main)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT))
        window.setupPersistentInsets()

        components.notificationsDelegate.bindToActivity(this)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction().apply {
                replace(R.id.container, createBrowserFragment(sessionId))
                commit()
            }
        }

        crashIntegration =
            CrashIntegration(this, components.analytics.crashReporter) { crash ->
                onNonFatalCrash(crash)
            }
        lifecycle.addObserver(crashIntegration)

        lifecycle.addObserver(webExtensionPopupObserver)

        if (savedInstanceState == null) {
            handleIgnifoxAction(intent)
            window.decorView.postDelayed({ if (!isFinishing) UBlock.offerOnce(this) }, UBO_DELAY_MS)
        }
        Updates.maybeCheck(this, lifecycleScope)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    supportFragmentManager.fragments.forEach {
                        if (it is UserInteractionHandler && it.onBackPressed()) {
                            return
                        }
                    }
                }
            },
        )
    }

    @Suppress("DEPRECATION") // ComponentActivity wants us to use registerForActivityResult
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        Logger.info(
            "Activity onActivityResult received with " +
                "requestCode: $requestCode, resultCode: $resultCode, data: $data",
        )

        supportFragmentManager.fragments.forEach {
            if (it is ActivityResultHandler && it.onActivityResult(requestCode, data, resultCode)) {
                return
            }
        }

        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onResume() {
        super.onResume()
        // Ignifox Studio changed something while we were in the background: redraw with it.
        if (studioRevision != Ignifox.revision(this)) {
            val tab = components.core.store.state.selectedTab
            if (tab != null && Ignifox.isNewTab(tab.content.url)) {
                components.useCases.sessionUseCases.loadUrl(Ignifox.homeUrl(this))
            }
            recreate()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIgnifoxAction(intent)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        val bar = findViewById<View>(R.id.toolbar)
        if (toolbarSwipe.onTouch(ev, bar) { cancel -> super.dispatchTouchEvent(cancel) }) return true
        return super.dispatchTouchEvent(ev)
    }

    /** Next (1) or previous (-1) tab, staying among normal or private tabs. */
    private fun switchTab(direction: Int): Boolean {
        val state = components.core.store.state
        val current = state.selectedTab ?: return false
        val tabs = state.tabs.filter { it.content.private == current.content.private }
        val next = tabs.getOrNull(tabs.indexOf(current) + direction) ?: return false
        components.useCases.tabsUseCases.selectTab(next.id)
        return true
    }

    /** Home-screen widget and launcher shortcuts land here. */
    private fun handleIgnifoxAction(intent: Intent?) {
        when (intent?.action) {
            ACTION_NEW_TAB -> components.useCases.tabsUseCases.addTab(Ignifox.homeUrl(this), selectTab = true)
            ACTION_PRIVATE_TAB -> components.useCases.tabsUseCases.addTab("about:privatebrowsing", selectTab = true, private = true)
            ACTION_BURN -> Burn.burn(this)
            ACTION_SEARCH -> {
                components.useCases.tabsUseCases.addTab(Ignifox.homeUrl(this), selectTab = true)
                window.decorView.postDelayed({
                    findViewById<mozilla.components.browser.toolbar.BrowserToolbar>(R.id.toolbar)?.editMode()
                }, SEARCH_FOCUS_DELAY_MS)
            }
            else -> return
        }
        intent.action = null
    }

    override fun onDestroy() {
        super.onDestroy()
        components.notificationsDelegate.unBindActivity(this)
    }

    override fun onUserLeaveHint() {
        supportFragmentManager.fragments.forEach {
            if (it is UserInteractionHandler && it.onHomePressed()) {
                return
            }
        }

        super.onUserLeaveHint()
    }

    override fun onCreateView(
        parent: View?,
        name: String,
        context: Context,
        attrs: AttributeSet,
    ): View? =
        when (name) {
            EngineView::class.java.name -> {
                components.core.engine.createView(context, attrs).asView()
            }

            else -> {
                super.onCreateView(parent, name, context, attrs)
            }
        }

    private fun onNonFatalCrash(crash: Crash) {
        Snackbar.make(findViewById(android.R.id.content), R.string.crash_report_non_fatal_message, LENGTH_LONG)
            .setAction(R.string.crash_report_non_fatal_action) {
                crashIntegration.sendCrashReport(crash)
            }
            .show()
    }

    private fun openPopup(webExtensionState: WebExtensionState) {
        val intent = Intent(this, WebExtensionActionPopupActivity::class.java)
        intent.putExtra("web_extension_id", webExtensionState.id)
        intent.putExtra("web_extension_name", webExtensionState.name)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
    }

    companion object {
        const val ACTION_NEW_TAB = "dev.rxvy.ignifox.NEW_TAB"
        const val ACTION_PRIVATE_TAB = "dev.rxvy.ignifox.PRIVATE_TAB"
        const val ACTION_BURN = "dev.rxvy.ignifox.BURN"
        const val ACTION_SEARCH = "dev.rxvy.ignifox.SEARCH"
        private const val UBO_DELAY_MS = 4000L
        private const val SEARCH_FOCUS_DELAY_MS = 400L
    }
}
