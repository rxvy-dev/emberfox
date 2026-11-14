/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.util.Base64
import androidx.core.content.edit
import androidx.preference.PreferenceManager
import java.io.ByteArrayOutputStream
import java.io.File
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.state.searchEngines
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.toolbar.BrowserToolbar
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.EngineSession.TrackingProtectionPolicy
import mozilla.components.concept.engine.mediaquery.PreferredColorScheme
import mozilla.components.feature.search.ext.buildSearchUrl
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.reference.browser.R
import org.mozilla.reference.browser.ext.components

/**
 * Ignifox Studio for Android: the settings model and everything that turns those settings
 * into what you see. It mirrors the Linux browser: same themes, same new tab page, same idea
 * of one place where the whole browser is customized.
 */
@Suppress("TooManyFunctions")
object Ignifox {
    // ---- setting keys (all live in the default shared preferences)
    const val THEME = "igni_theme"
    const val ACCENT = "igni_accent"
    const val THEME_CODE = "igni_theme_code"
    const val LOOK = "igni_look"
    const val BAR_POSITION = "igni_bar_position"
    const val BAR_SHAPE = "igni_bar_shape"
    const val BAR_HIDE = "igni_bar_hide_on_scroll"
    const val WEB_SCHEME = "igni_web_scheme"

    const val NT_ENABLED = "igni_nt_enabled"
    const val NT_WALLPAPER = "igni_nt_wallpaper"
    const val NT_WALLPAPER_FILE = "igni_nt_wallpaper_file"
    const val NT_DIM = "igni_nt_dim"
    const val NT_BLUR = "igni_nt_blur"
    const val NT_MOTION = "igni_nt_motion"
    const val NT_LAYOUT = "igni_nt_layout"
    const val NT_CLOCK = "igni_nt_clock"
    const val NT_CLOCK24 = "igni_nt_clock24"
    const val NT_SECONDS = "igni_nt_seconds"
    const val NT_DATE = "igni_nt_date"
    const val NT_GREETING = "igni_nt_greeting"
    const val NT_NAME = "igni_nt_name"
    const val NT_SEARCH = "igni_nt_search"
    const val NT_LINKS = "igni_nt_links"
    const val NT_TILES = "igni_nt_tiles"
    const val NT_NOTES = "igni_nt_notes"
    const val NT_METAL = "igni_nt_metal"

    const val TP_LEVEL = "igni_tp_level"
    const val HTTPS_ONLY = "igni_https_only"
    const val GPC = "igni_gpc"
    const val DOH = "igni_doh"
    const val CLEAR_ON_QUIT = "igni_clear_on_quit"

    const val ZOOM_ANY = "igni_zoom_any"
    const val FONT_SCALE = "igni_font_scale"
    const val UNSIGNED_ADDONS = "igni_unsigned_addons"
    const val DESKTOP_DEFAULT = "igni_desktop_default"

    /** Bumped on every Studio change so open screens know to redraw themselves. */
    const val REVISION = "igni_revision"

    /** The page's search box goes here; [resolveSearch] turns it into a real search. */
    const val SEARCH_HOST = "https://search.ignifox.invalid/"

    const val DEFAULT_LINKS =
        "DuckDuckGo | https://duckduckgo.com\n" +
            "Wikipedia | https://www.wikipedia.org\n" +
            "YouTube | https://www.youtube.com\n" +
            "GitHub | https://github.com\n" +
            "Reddit | https://www.reddit.com\n" +
            "Add-ons | https://addons.mozilla.org/android/"

    const val CUSTOM = "custom"
    private const val CODE_COLORS = 7
    private const val DARK_BELOW = 0.4
    private const val URL_BOX_ROUNDED_DP = 10f
    private const val URL_BOX_PILL_DP = 28f
    private const val SUGGESTION_ALPHA = 0x66
    private const val PERCENT = 100f

    fun prefs(context: Context): SharedPreferences = PreferenceManager.getDefaultSharedPreferences(context)

    fun revision(context: Context): Int = prefs(context).getInt(REVISION, 0)

    // ---------------------------------------------------------------- themes

    /** The chosen theme, with the custom accent colour applied when one is set. */
    fun palette(context: Context): Palette {
        val p = prefs(context)
        if (p.getString(THEME, "ignis") == CUSTOM) {
            paletteFromCode(p.getString(THEME_CODE, ""))?.let { return it }
        }
        val base = Themes.ALL.firstOrNull { it.key == p.getString(THEME, "ignis") } ?: Themes.ALL.first()
        val accent = parseColor(p.getString(ACCENT, "")) ?: return base
        return base.copy(accent = accent)
    }

    /**
     * Theme codes are shared with the Linux browser ("igni:" then seven colours: background,
     * two surfaces, text, dim text, accent, second accent), so a theme made there works here.
     */
    fun paletteFromCode(code: String?): Palette? {
        val match = Regex("^igni:([0-9a-fA-F,]+)$").find(code?.trim().orEmpty()) ?: return null
        val colors = match.groupValues[1].split(",").map { parseColor(it) ?: return null }
        if (colors.size != CODE_COLORS) return null
        val dark = luminance(colors[0]) < DARK_BELOW
        return Palette(
            CUSTOM, "Custom", dark,
            colors[0], colors[1], colors[2], colors[3], colors[4], colors[5], colors[6],
            if (dark) R.style.Igni_Obsidian else R.style.Igni_Paper,
        )
    }

    fun codeFor(p: Palette): String =
        "igni:" + listOf(p.bg, p.bg2, p.bg3, p.fg, p.fgDim, p.accent, p.accent2).joinToString(",") { hex(it).drop(1) }

    private fun luminance(color: Int): Double {
        fun channel(v: Int): Double {
            val c = v / 255.0
            return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(Color.red(color)) + 0.7152 * channel(Color.green(color)) +
            0.0722 * channel(Color.blue(color))
    }

    fun parseColor(text: String?): Int? {
        val t = text?.trim().orEmpty()
        if (!Regex("^#?[0-9a-fA-F]{6}$").matches(t)) return null
        return try {
            Color.parseColor(if (t.startsWith("#")) t else "#$t")
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    fun hex(color: Int): String = String.format("#%06x", color and 0xFFFFFF)

    /** Toolbar colours. Light themes get an ink-coloured bar so the white icons stay readable. */
    fun barBackground(p: Palette): Int = if (p.dark) p.bg2 else p.fg

    fun barBox(p: Palette): Int = if (p.dark) p.bg3 else blend(p.fg, p.bg3, 0.18f)

    fun barText(p: Palette): Int = if (p.dark) p.fg else p.bg3

    fun barDim(p: Palette): Int = if (p.dark) p.fgDim else blend(p.fg, p.bg3, 0.6f)

    fun blend(a: Int, b: Int, t: Float): Int {
        fun mix(x: Int, y: Int) = (x + (y - x) * t).toInt().coerceIn(0, 255)
        return Color.rgb(
            mix(Color.red(a), Color.red(b)),
            mix(Color.green(a), Color.green(b)),
            mix(Color.blue(a), Color.blue(b)),
        )
    }

    /**
     * Call before `super.onCreate()`. Picks the light or dark base and lays the theme's colours
     * over it, so every stock widget (switches, dialogs, lists) follows the Ignifox theme.
     */
    fun applyTheme(activity: Activity, actionBar: Boolean) {
        val p = palette(activity)
        activity.setTheme(
            when {
                p.dark && actionBar -> R.style.AppTheme
                p.dark -> R.style.AppThemeNotActionBar
                actionBar -> R.style.AppThemeLight
                else -> R.style.AppThemeLightNotActionBar
            },
        )
        activity.theme.applyStyle(p.overlay, true)
    }

    fun styleToolbar(toolbar: BrowserToolbar) {
        val context = toolbar.context
        val p = palette(context)
        val text = barText(p)
        val dim = barDim(p)
        val density = context.resources.displayMetrics.density
        toolbar.setBackgroundColor(barBackground(p))
        toolbar.display.colors =
            toolbar.display.colors.copy(
                siteInfoIconSecure = text,
                siteInfoIconInsecure = text,
                emptyIcon = text,
                menu = text,
                hint = dim,
                title = text,
                text = text,
                trackingProtection = p.accent,
                separator = dim,
                highlight = p.accent,
            )
        toolbar.display.setUrlBackground(
            GradientDrawable().apply {
                setColor(barBox(p))
                cornerRadius =
                    density *
                        when (prefs(context).getString(BAR_SHAPE, "rounded")) {
                            "pill" -> URL_BOX_PILL_DP
                            "square" -> 0f
                            else -> URL_BOX_ROUNDED_DP
                        }
            },
        )
        toolbar.edit.colors =
            toolbar.edit.colors.copy(
                clear = text,
                hint = dim,
                text = text,
                suggestionBackground = Color.argb(
                    SUGGESTION_ALPHA,
                    Color.red(p.accent),
                    Color.green(p.accent),
                    Color.blue(p.accent),
                ),
                suggestionForeground = text,
            )
    }

    // ---------------------------------------------------------------- one-click looks

    /** A look is a bundle of settings, the same idea as "One-click looks" on Linux. */
    fun applyLook(context: Context, look: String) {
        prefs(context).edit {
            when (look) {
                "classic" -> {
                    putString(THEME, "ignis"); putString(BAR_POSITION, "top"); putString(BAR_SHAPE, "rounded")
                    putString(NT_WALLPAPER, "embers"); putString(NT_LAYOUT, "center")
                }
                "thumb" -> {
                    putString(THEME, "ignis"); putString(BAR_POSITION, "bottom"); putString(BAR_SHAPE, "pill")
                    putString(NT_WALLPAPER, "embers"); putString(NT_LAYOUT, "center")
                }
                "oled" -> {
                    putString(THEME, "void"); putString(BAR_POSITION, "bottom"); putString(BAR_SHAPE, "pill")
                    putString(NT_WALLPAPER, "solid"); putString(NT_LAYOUT, "center")
                }
                "minimal" -> {
                    putString(THEME, "obsidian"); putString(BAR_POSITION, "bottom"); putString(BAR_SHAPE, "square")
                    putString(NT_WALLPAPER, "solid"); putString(NT_LAYOUT, "minimal")
                }
                "hacker" -> {
                    putString(THEME, "toxic"); putString(BAR_POSITION, "top"); putString(BAR_SHAPE, "square")
                    putString(NT_WALLPAPER, "solid"); putString(NT_LAYOUT, "top")
                }
                "neon" -> {
                    putString(THEME, "synthwave"); putString(BAR_POSITION, "bottom"); putString(BAR_SHAPE, "pill")
                    putString(NT_WALLPAPER, "aurora"); putString(NT_LAYOUT, "center")
                }
                "daylight" -> {
                    putString(THEME, "paper"); putString(BAR_POSITION, "top"); putString(BAR_SHAPE, "rounded")
                    putString(NT_WALLPAPER, "gradient"); putString(NT_LAYOUT, "center")
                }
            }
            putString(ACCENT, "")
        }
    }

    // ---------------------------------------------------------------- new tab page

    private const val NEW_TAB_EXTENSION = "newtab@ignifox"
    private const val NEW_TAB_EXTENSION_URL = "resource://android/assets/extensions/ignifox/"
    private const val NEW_TAB_PATH = "newtab/index.html"
    private const val NT_BASE = "igni_nt_base"
    private const val WALLPAPER_FILE = "ignifox-wallpaper.b64"
    private const val WALLPAPER_MAX_SIDE = 960
    private const val WALLPAPER_QUALITY = 60

    /**
     * The new tab page (the same one the Linux browser uses) ships inside the APK as a tiny
     * built-in extension with no permissions, because the engine will not open local files
     * directly. Installing it tells us the page's address; [onReady] runs once that is known.
     */
    fun installNewTab(context: Context, engine: Engine, onReady: () -> Unit) {
        engine.installBuiltInWebExtension(
            id = NEW_TAB_EXTENSION,
            url = NEW_TAB_EXTENSION_URL,
            onSuccess = { extension ->
                val base = extension.getMetadata()?.baseUrl.orEmpty()
                if (base.startsWith("moz-extension://")) {
                    prefs(context).edit { putString(NT_BASE, if (base.endsWith("/")) base else "$base/") }
                }
                onReady()
            },
            onError = { onReady() },
        )
    }

    /** True once [installNewTab] has learned where the page lives. */
    fun newTabReady(context: Context): Boolean = !prefs(context).getString(NT_BASE, "").isNullOrEmpty()

    /** Where new tabs open. A plain blank page when the Ignifox New Tab is switched off. */
    fun homeUrl(context: Context): String =
        if (prefs(context).getBoolean(NT_ENABLED, true)) newTabUrl(context) else "about:blank"

    /** The page cannot read anything from the app, so its settings travel in the address after "#". */
    fun newTabUrl(context: Context): String {
        val base = prefs(context).getString(NT_BASE, "").orEmpty()
        if (base.isEmpty()) return "about:blank"
        return base + NEW_TAB_PATH + "#" + Uri.encode(newTabConfig(context).toString())
    }

    fun isNewTab(url: CharSequence): Boolean = url.startsWith("moz-extension://") && url.contains(NEW_TAB_PATH)

    /** Shrinks a picked picture and keeps it as the new tab wallpaper. False if it could not be read. */
    fun setWallpaper(context: Context, uri: Uri): Boolean =
        try {
            val source = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            if (source == null) {
                false
            } else {
                val scale = WALLPAPER_MAX_SIDE.toFloat() / maxOf(source.width, source.height)
                val small =
                    if (scale < 1f) {
                        Bitmap.createScaledBitmap(
                            source,
                            (source.width * scale).toInt().coerceAtLeast(1),
                            (source.height * scale).toInt().coerceAtLeast(1),
                            true,
                        )
                    } else {
                        source
                    }
                val bytes = ByteArrayOutputStream()
                small.compress(Bitmap.CompressFormat.JPEG, WALLPAPER_QUALITY, bytes)
                File(context.filesDir, WALLPAPER_FILE)
                    .writeText(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
                prefs(context).edit {
                    putString(NT_WALLPAPER, "image")
                    putString(NT_WALLPAPER_FILE, System.currentTimeMillis().toString())
                }
                true
            }
        } catch (_: java.io.IOException) {
            false
        } catch (_: SecurityException) {
            false
        } catch (_: OutOfMemoryError) {
            false
        }

    private fun wallpaperData(context: Context): String {
        val file = File(context.filesDir, WALLPAPER_FILE)
        if (prefs(context).getString(NT_WALLPAPER, "embers") != "image" || !file.exists()) return ""
        return try {
            "data:image/jpeg;base64," + file.readText()
        } catch (_: java.io.IOException) {
            ""
        }
    }

    fun parseLinks(text: String): List<Pair<String, String>> =
        text.lines().mapNotNull { line ->
            val parts = line.split("|", limit = 2).map { it.trim() }
            val url = (parts.getOrNull(1) ?: parts[0]).takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val full = if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://").containsMatchIn(url)) url else "https://$url"
            val title = if (parts.size > 1) parts[0] else ""
            title to full
        }

    private fun newTabConfig(context: Context): JSONObject {
        val p = prefs(context)
        val pal = palette(context)
        val search = context.components.core.store.state.search
        val engines = search.searchEngines
        val current = search.selectedOrDefaultSearchEngine

        fun engineJson(engine: SearchEngine) =
            JSONObject()
                .put("name", engine.name)
                .put("url", SEARCH_HOST + "?e=" + Uri.encode(engine.id) + "&q={searchTerms}")
                .put("alias", "")

        val fallback =
            JSONObject()
                .put("name", "DuckDuckGo")
                .put("url", "https://duckduckgo.com/?q={searchTerms}")
                .put("alias", "")
        val links = JSONArray()
        for ((title, url) in parseLinks(p.getString(NT_LINKS, DEFAULT_LINKS) ?: DEFAULT_LINKS)) {
            links.put(JSONObject().put("title", title).put("url", url))
        }
        return JSONObject()
            .put("platform", "android")
            .put("noAutofocus", true)
            .put(
                "palette",
                JSONObject()
                    .put("bg", hex(pal.bg)).put("bg2", hex(pal.bg2)).put("bg3", hex(pal.bg3))
                    .put("fg", hex(pal.fg)).put("fgDim", hex(pal.fgDim))
                    .put("accent", hex(pal.accent)).put("accent2", hex(pal.accent2))
                    .put("dark", pal.dark),
            )
            .put("radius", if (p.getString(BAR_SHAPE, "rounded") == "square") 0 else 14)
            .put("layout", p.getString(NT_LAYOUT, "center"))
            .put("wallpaper", p.getString(NT_WALLPAPER, "embers"))
            .put("wallpaperFile", "")
            .put("wallpaperData", wallpaperData(context))
            .put("dim", p.getInt(NT_DIM, 25))
            .put("blur", p.getInt(NT_BLUR, 0))
            .put("motion", p.getString(NT_MOTION, "on"))
            .put("clock", p.getBoolean(NT_CLOCK, true))
            .put("clock24", p.getBoolean(NT_CLOCK24, false))
            .put("seconds", p.getBoolean(NT_SECONDS, false))
            .put("date", p.getBoolean(NT_DATE, true))
            .put("greeting", p.getBoolean(NT_GREETING, true))
            .put("name", p.getString(NT_NAME, ""))
            .put("search", p.getBoolean(NT_SEARCH, true))
            .put("engineSwitcher", engines.size > 1)
            .put("engine", current?.let { engineJson(it) } ?: fallback)
            .put("engines", JSONArray().apply { engines.forEach { put(engineJson(it)) } })
            .put("links", links)
            .put("columns", 4)
            .put("tileStyle", p.getString(NT_TILES, "rounded"))
            .put("favicons", false)
            .put("notes", p.getBoolean(NT_NOTES, false))
            .put("font", if (p.getBoolean(NT_METAL, false)) "Metal Mania" else "")
            .put("fontFile", "")
    }

    /**
     * The new tab page cannot see the browser's search engines, so its search box points at
     * [SEARCH_HOST]. This turns such an address into the real search URL, or null for any other.
     */
    fun resolveSearch(context: Context, uri: String): String? {
        if (!uri.startsWith(SEARCH_HOST)) return null
        val parsed = Uri.parse(uri)
        val terms = parsed.getQueryParameter("q").orEmpty()
        val search = context.components.core.store.state.search
        val engine =
            search.searchEngines.firstOrNull { it.id == parsed.getQueryParameter("e") }
                ?: search.selectedOrDefaultSearchEngine
        return engine?.buildSearchUrl(terms) ?: ("https://duckduckgo.com/?q=" + Uri.encode(terms))
    }

    // ---------------------------------------------------------------- engine settings

    fun trackingPolicy(context: Context): TrackingProtectionPolicy =
        when (prefs(context).getString(TP_LEVEL, "strict")) {
            "off" -> TrackingProtectionPolicy.none()
            "standard" -> TrackingProtectionPolicy.recommended()
            else -> TrackingProtectionPolicy.strict()
        }

    fun colorScheme(context: Context): PreferredColorScheme =
        when (prefs(context).getString(WEB_SCHEME, "theme")) {
            "light" -> PreferredColorScheme.Light
            "dark" -> PreferredColorScheme.Dark
            "system" -> PreferredColorScheme.System
            else -> if (palette(context).dark) PreferredColorScheme.Dark else PreferredColorScheme.Light
        }

    fun httpsOnly(context: Context): Engine.HttpsOnlyMode =
        if (prefs(context).getBoolean(HTTPS_ONLY, true)) {
            Engine.HttpsOnlyMode.ENABLED
        } else {
            Engine.HttpsOnlyMode.DISABLED
        }

    /** Pushes every Studio setting the engine cares about into the running engine. */
    fun applyEngineSettings(context: Context) {
        val p = prefs(context)
        val engine = context.components.core.engine
        val settings = engine.settings
        settings.trackingProtectionPolicy = trackingPolicy(context)
        settings.preferredColorScheme = colorScheme(context)
        settings.httpsOnlyMode = httpsOnly(context)
        settings.globalPrivacyControlEnabled = p.getBoolean(GPC, true)
        settings.forceUserScalableContent = p.getBoolean(ZOOM_ANY, true)
        // The engine refuses a manual text size while it is following the phone's font size.
        settings.automaticFontSizeAdjustment = false
        settings.fontInflationEnabled = p.getInt(FONT_SCALE, PERCENT.toInt()) != PERCENT.toInt()
        settings.fontSizeFactor = p.getInt(FONT_SCALE, PERCENT.toInt()) / PERCENT
        applyDoh(context)
        GeckoPrefs.apply(context, engine)
    }

    private fun applyDoh(context: Context) {
        val settings = context.components.core.engine.settings
        when (val choice = prefs(context).getString(DOH, "default")) {
            "off" -> settings.dohSettingsMode = Engine.DohSettingsMode.OFF
            "default", null -> settings.dohSettingsMode = Engine.DohSettingsMode.DEFAULT
            else -> {
                settings.dohProviderUrl = choice
                settings.dohSettingsMode = Engine.DohSettingsMode.MAX
            }
        }
    }

    /** Called by Studio after any change: update the engine and tell open screens. */
    fun changed(context: Context) {
        applyEngineSettings(context)
        prefs(context).edit { putInt(REVISION, revision(context) + 1) }
    }
}
