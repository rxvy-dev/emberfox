/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.edit
import androidx.lifecycle.lifecycleScope
import androidx.preference.EditTextPreference
import androidx.preference.ListPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import java.io.File
import kotlin.random.Random
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.browser.state.state.searchEngines
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.webextension.InstallationMethod
import mozilla.components.feature.search.ext.createSearchEngine
import org.mozilla.reference.browser.R
import org.mozilla.reference.browser.addons.AddonsActivity
import org.mozilla.reference.browser.ext.requireComponents
import org.mozilla.reference.browser.settings.SettingsFragment

/** Ignifox Studio: every look, new tab, search, privacy and freedom setting on one screen. */
@Suppress("TooManyFunctions")
class StudioFragment : PreferenceFragmentCompat(), SharedPreferences.OnSharedPreferenceChangeListener {
    private val handler = Handler(Looper.getMainLooper())
    private var needsRecreate = false

    private val applyChanges = Runnable {
        val context = context ?: return@Runnable
        Ignifox.changed(context)
        if (needsRecreate) {
            needsRecreate = false
            activity?.recreate()
        }
    }

    private val pickWallpaper =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            val context = context
            if (uri != null && context != null && !Ignifox.setWallpaper(context, uri)) {
                Toast.makeText(context, R.string.igni_wallpaper_failed, Toast.LENGTH_LONG).show()
            }
        }

    private val pickAddon =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) installAddonFile(uri)
        }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.ignifox_preferences, rootKey)

        findPreference<EditTextPreference>(Ignifox.NT_LINKS)?.apply {
            if (text.isNullOrEmpty()) text = Ignifox.DEFAULT_LINKS
            setOnBindEditTextListener { edit ->
                edit.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                    InputType.TYPE_TEXT_VARIATION_URI
                edit.isSingleLine = false
                edit.minLines = MIN_LINK_LINES
            }
        }
        findPreference<EditTextPreference>(Ignifox.ACCENT)?.setOnPreferenceChangeListener { _, value ->
            val text = (value as? String).orEmpty().trim()
            text.isEmpty() || Ignifox.parseColor(text) != null
        }

        findPreference<ListPreference>(Ignifox.LOOK)?.setOnPreferenceChangeListener { _, value ->
            Ignifox.applyLook(requireContext(), value as String)
            needsRecreate = true
            false
        }

        // Themes made in the Linux browser's palette editor come over as a short code.
        findPreference<EditTextPreference>(Ignifox.THEME_CODE)?.setOnPreferenceChangeListener { _, value ->
            val ok = Ignifox.paletteFromCode(value as? String) != null
            if (ok) {
                Ignifox.prefs(requireContext()).edit { putString(Ignifox.THEME, Ignifox.CUSTOM) }
                needsRecreate = true
            } else {
                Toast.makeText(requireContext(), R.string.igni_theme_code_bad, Toast.LENGTH_LONG).show()
            }
            ok
        }
        findPreference<ListPreference>(Ignifox.THEME)?.apply {
            if (Ignifox.paletteFromCode(Ignifox.prefs(requireContext()).getString(Ignifox.THEME_CODE, "")) != null) {
                entries = entries.toList().plus(getString(R.string.igni_theme_custom)).toTypedArray()
                entryValues = entryValues.toList().plus(Ignifox.CUSTOM).toTypedArray()
            }
        }
        click("igni_theme_code_copy") {
            val code = Ignifox.codeFor(Ignifox.palette(requireContext()))
            val clipboard = requireContext().getSystemService(ClipboardManager::class.java)
            clipboard?.setPrimaryClip(ClipData.newPlainText("Ignifox theme", code))
            Toast.makeText(requireContext(), code, Toast.LENGTH_LONG).show()
        }

        for (key in listOf(ExtraKeys.NT_FEEDS, ExtraKeys.KEEP_SITES)) {
            findPreference<EditTextPreference>(key)?.setOnBindEditTextListener { edit ->
                edit.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                    InputType.TYPE_TEXT_VARIATION_URI
                edit.isSingleLine = false
                edit.minLines = MIN_LINK_LINES
            }
        }
        click("igni_gallery") { openGallery() }
        click("igni_burn_now") {
            Burn.burn(requireContext())
            activity?.finish()
        }
        click("igni_ubo") { UBlock.install(requireContext()) }
        click("igni_update_now") { Updates.checkNow(requireActivity(), lifecycleScope) }

        click("igni_surprise") { surpriseMe() }
        click("igni_nt_wallpaper_pick") { pickWallpaper.launch("image/*") }
        click("igni_search_add") { addSearchEngine() }
        click("igni_clear_now") { clearData() }
        click("igni_addons") { startActivity(Intent(requireContext(), AddonsActivity::class.java)) }
        click("igni_addons_more") { openTab("https://addons.mozilla.org/android/") }
        click("igni_addon_file") { pickAddon.launch("*/*") }
        click("igni_about_config") { openTab("about:config") }
        click("igni_source") { openTab("https://github.com/rxvy-dev/ignifox") }

        setupSearchEngines()
    }

    override fun onResume() {
        super.onResume()
        (activity as? SettingsFragment.ActionBarUpdater)?.updateTitle(R.string.igni_studio)
        preferenceManager.sharedPreferences?.registerOnSharedPreferenceChangeListener(this)
    }

    override fun onPause() {
        super.onPause()
        preferenceManager.sharedPreferences?.unregisterOnSharedPreferenceChangeListener(this)
    }

    override fun onDestroy() {
        handler.removeCallbacks(applyChanges)
        super.onDestroy()
    }

    override fun onSharedPreferenceChanged(prefs: SharedPreferences?, key: String?) {
        if (key == null || !key.startsWith("igni_") || key == Ignifox.REVISION) return
        if (key == Ignifox.THEME || key == Ignifox.ACCENT) needsRecreate = true
        if (key == ExtraKeys.NT_FEEDS || key == ExtraKeys.NT_FEEDS_COUNT) {
            val app = requireContext().applicationContext
            lifecycleScope.launch {
                Feeds.refresh(app)
                Ignifox.changed(app)
            }
        }
        // Several settings can change at once (a look, Surprise me); apply them in one go.
        handler.removeCallbacks(applyChanges)
        handler.postDelayed(applyChanges, APPLY_DELAY_MS)
    }

    private fun click(key: String, action: () -> Unit) {
        findPreference<Preference>(key)?.setOnPreferenceClickListener {
            action()
            true
        }
    }

    private fun openTab(url: String) {
        requireComponents.useCases.tabsUseCases.addTab(url, selectTab = true)
        activity?.finish()
    }

    /** A random theme with a random accent that is nudged until it reads well on that theme. */
    private fun surpriseMe() {
        val theme = Themes.ALL.random()
        val hsv = floatArrayOf(Random.nextFloat() * HUE_RANGE, SURPRISE_SATURATION, if (theme.dark) 1f else DARK_VALUE)
        val accent = android.graphics.Color.HSVToColor(hsv)
        Ignifox.prefs(requireContext()).edit {
            putString(Ignifox.THEME, theme.key)
            putString(Ignifox.ACCENT, Ignifox.hex(accent))
            putString(Ignifox.BAR_SHAPE, listOf("rounded", "pill", "square").random())
            putString(Ignifox.NT_WALLPAPER, listOf("embers", "aurora", "gradient").random())
        }
    }

    /** The community gallery: pick a theme from the list in the Ignifox repository. */
    private fun openGallery() {
        val context = requireContext()
        lifecycleScope.launch {
            val themes = try {
                Gallery.load()
            } catch (_: Exception) {
                emptyList()
            }
            if (!isAdded) return@launch
            if (themes.isEmpty()) {
                Toast.makeText(context, R.string.igni_gallery_failed, Toast.LENGTH_LONG).show()
                return@launch
            }
            val labels = themes.map { t ->
                val p = Ignifox.paletteFromCode(t.code)
                android.text.SpannableString("●  ${t.name}").apply {
                    if (p != null) {
                        setSpan(android.text.style.ForegroundColorSpan(p.accent), 0, 1, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                }
            }.toTypedArray<CharSequence>()
            AlertDialog.Builder(context)
                .setTitle(R.string.igni_gallery)
                .setItems(labels) { _, i ->
                    Gallery.apply(context, themes[i].code)
                    needsRecreate = true
                    handler.post(applyChanges)
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
    }

    private fun setupSearchEngines() {
        val pref = findPreference<ListPreference>("igni_search_engine") ?: return
        val search = requireComponents.core.store.state.search
        val engines = search.searchEngines
        pref.entries = engines.map { it.name }.toTypedArray()
        pref.entryValues = engines.map { it.id }.toTypedArray()
        val current = search.selectedOrDefaultSearchEngine
        pref.value = current?.id
        pref.summary = current?.name
        pref.setOnPreferenceChangeListener { _, value ->
            val engine = requireComponents.core.store.state.search.searchEngines.firstOrNull { it.id == value }
            if (engine != null) {
                requireComponents.useCases.searchUseCases.selectSearchEngine(engine)
                pref.summary = engine.name
                handler.postDelayed(applyChanges, APPLY_DELAY_MS)
            }
            engine != null
        }
    }

    private fun addSearchEngine() {
        val context = requireContext()
        val pad = (DIALOG_PADDING_DP * resources.displayMetrics.density).toInt()
        val name = EditText(context).apply { setHint(R.string.igni_search_name_hint) }
        val url =
            EditText(context).apply {
                setHint(R.string.igni_search_url_hint)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            }
        val box =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(pad, pad, pad, 0)
                addView(name)
                addView(url)
            }
        AlertDialog.Builder(context)
            .setTitle(R.string.igni_search_add)
            .setView(box)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val template = url.text.toString().trim().replace("%s", "{searchTerms}")
                val title = name.text.toString().trim()
                if (title.isEmpty() || !template.contains("{searchTerms}") || !template.startsWith("http")) {
                    Toast.makeText(context, R.string.igni_search_bad, Toast.LENGTH_LONG).show()
                } else {
                    val icon = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
                    icon.eraseColor(Ignifox.palette(context).accent)
                    val engine = createSearchEngine(title, template, icon)
                    requireComponents.useCases.searchUseCases.addSearchEngine(engine)
                    requireComponents.useCases.searchUseCases.selectSearchEngine(engine)
                    Toast.makeText(context, getString(R.string.igni_search_added, title), Toast.LENGTH_SHORT).show()
                    handler.postDelayed({ if (isAdded) setupSearchEngines() }, APPLY_DELAY_MS)
                    handler.postDelayed(applyChanges, APPLY_DELAY_MS * 2)
                }
            }
            .show()
    }

    private fun clearData() {
        val components = requireComponents
        val context = requireContext().applicationContext
        components.core.engine.clearData(Engine.BrowsingData.all())
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { components.core.historyStorage.deleteEverything() }
            Toast.makeText(context, R.string.igni_clear_done, Toast.LENGTH_SHORT).show()
        }
    }

    private fun installAddonFile(uri: Uri) {
        val context = requireContext().applicationContext
        val components = requireComponents
        lifecycleScope.launch {
            val file =
                withContext(Dispatchers.IO) {
                    val out = File(context.cacheDir, "addon-${System.currentTimeMillis()}.xpi")
                    try {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            out.outputStream().use { input.copyTo(it) }
                        }
                        out.takeIf { it.length() > 0 }
                    } catch (_: java.io.IOException) {
                        null
                    } catch (_: SecurityException) {
                        null
                    }
                }
            if (file == null) {
                Toast.makeText(context, context.getString(R.string.igni_addon_failed, "?"), Toast.LENGTH_LONG).show()
                return@launch
            }
            components.core.addonManager.installAddon(
                url = Uri.fromFile(file).toString(),
                installationMethod = InstallationMethod.FROM_FILE,
                onSuccess = { addon ->
                    val label = addon.translatableName.values.firstOrNull() ?: addon.id
                    Toast.makeText(context, context.getString(R.string.igni_addon_installed, label), Toast.LENGTH_LONG)
                        .show()
                },
                onError = { error ->
                    Toast.makeText(
                            context,
                            context.getString(R.string.igni_addon_failed, error.message ?: error.javaClass.simpleName),
                            Toast.LENGTH_LONG,
                        )
                        .show()
                },
            )
        }
    }

    companion object {
        private const val APPLY_DELAY_MS = 150L
        private const val MIN_LINK_LINES = 6
        private const val DIALOG_PADDING_DP = 20
        private const val ICON_SIZE = 64
        private const val HUE_RANGE = 360f
        private const val SURPRISE_SATURATION = 0.85f
        private const val DARK_VALUE = 0.6f
    }
}
