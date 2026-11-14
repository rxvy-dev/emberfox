/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.Toast
import androidx.core.content.edit
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.webextension.InstallationMethod
import mozilla.components.lib.publicsuffixlist.PublicSuffixList
import mozilla.components.lib.state.ext.flow
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.reference.browser.R
import org.mozilla.reference.browser.ext.components

/** Setting keys for the features in this file (all in the default shared preferences). */
object ExtraKeys {
    const val NT_TODO = "igni_nt_todo"
    const val NT_CD_TITLE = "igni_nt_cd_title"
    const val NT_CD_DATE = "igni_nt_cd_date"
    const val NT_FEEDS = "igni_nt_feeds"
    const val NT_FEEDS_COUNT = "igni_nt_feeds_count"
    const val SITE_TINT = "igni_site_tint"
    const val SITE_TINT_STRENGTH = "igni_site_tint_strength"
    const val TABS_GRID = "igni_tabs_grid"
    const val SWIPE_TABS = "igni_swipe_tabs"
    const val FP_PROTECT = "igni_fp_protect"
    const val FP_RESIST = "igni_fp_resist"
    const val AUTO_DELETE = "igni_auto_delete"
    const val KEEP_SITES = "igni_keep_sites"
    const val UPDATE_CHECK = "igni_update_check"
}

private fun httpGet(url: String, maxBytes: Int = 2_000_000): String {
    val c = URL(url).openConnection() as HttpURLConnection
    try {
        c.connectTimeout = 10_000
        c.readTimeout = 15_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("Accept", "application/json, application/rss+xml, application/atom+xml, text/xml, */*")
        c.useCaches = false
        if (c.responseCode !in 200..299) throw IOException("HTTP ${c.responseCode}")
        val bytes = c.inputStream.use { input ->
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(16 * 1024)
            while (out.size() < maxBytes) {
                val n = input.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
            }
            out.toByteArray()
        }
        return String(bytes, Charsets.UTF_8)
    } finally {
        c.disconnect()
    }
}

// ===================================================================== updates
/** Tells you when a newer Ignifox is on GitHub. Asks GitHub's public API once a day, nothing else. */
object Updates {
    private const val API = "https://api.github.com/repos/rxvy-dev/ignifox/releases/latest"
    const val PAGE = "https://github.com/rxvy-dev/ignifox/releases/latest"
    private const val LAST = "igni_update_last"
    private const val SKIP = "igni_update_skip"
    private const val DAY_MS = 24L * 60 * 60 * 1000

    fun current(context: Context): String =
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
        } catch (_: Exception) {
            ""
        }

    /** -1, 0 or 1, comparing versions like "160.0-3" number by number. */
    fun compare(a: String, b: String): Int {
        val x = Regex("\\d+").findAll(a).map { it.value.toLong() }.toList()
        val y = Regex("\\d+").findAll(b).map { it.value.toLong() }.toList()
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = (x.getOrElse(i) { 0 }).compareTo(y.getOrElse(i) { 0 })
            if (d != 0) return d
        }
        return 0
    }

    suspend fun latest(): String? = withContext(Dispatchers.IO) {
        try {
            JSONObject(httpGet(API)).optString("tag_name").removePrefix("v").ifEmpty { null }
        } catch (_: Exception) {
            null
        }
    }

    /** Called when the browser opens: at most once a day, quietly, and only for release builds. */
    fun maybeCheck(activity: Activity, scope: CoroutineScope) {
        val p = Ignifox.prefs(activity)
        val current = current(activity)
        if (!p.getBoolean(ExtraKeys.UPDATE_CHECK, true) || current.contains("dev")) return
        if (System.currentTimeMillis() - p.getLong(LAST, 0) < DAY_MS) return
        scope.launch {
            val latest = latest() ?: return@launch
            p.edit { putLong(LAST, System.currentTimeMillis()) }
            if (compare(latest, current) > 0 && p.getString(SKIP, "") != latest && !activity.isFinishing) {
                offer(activity, latest, current)
            }
        }
    }

    /** "Check now" in Studio. */
    fun checkNow(activity: Activity, scope: CoroutineScope) {
        scope.launch {
            val current = current(activity)
            val latest = latest()
            when {
                latest == null -> toast(activity, activity.getString(R.string.igni_update_failed))
                compare(latest, current) > 0 -> offer(activity, latest, current)
                else -> toast(activity, activity.getString(R.string.igni_update_current, current))
            }
        }
    }

    private fun offer(activity: Activity, latest: String, current: String) {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.igni_update_title, latest))
            .setMessage(activity.getString(R.string.igni_update_message, current))
            .setPositiveButton(R.string.igni_update_get) { _, _ ->
                activity.components.useCases.tabsUseCases.addTab(PAGE, selectTab = true)
                if (activity !is org.mozilla.reference.browser.BrowserActivity) activity.finish()
            }
            .setNeutralButton(R.string.igni_update_skip) { _, _ ->
                Ignifox.prefs(activity).edit { putString(SKIP, latest) }
            }
            .setNegativeButton(R.string.igni_update_later, null)
            .show()
    }
}

private fun toast(context: Context, text: String) = Toast.makeText(context, text, Toast.LENGTH_LONG).show()

// ===================================================================== burn
/** Close every tab and wipe history, cookies, site data and caches in one go. */
object Burn {
    fun burn(context: Context) {
        val c = context.components
        c.useCases.tabsUseCases.removeAllTabs()
        c.core.engine.clearData(Engine.BrowsingData.all())
        MainScope().launch(Dispatchers.IO) {
            try {
                c.core.historyStorage.deleteEverything()
            } catch (_: Exception) {
            }
        }
        c.useCases.tabsUseCases.addTab(Ignifox.homeUrl(context), selectTab = true)
        toast(context, context.getString(R.string.igni_burned))
    }
}

// ===================================================================== cookie auto-delete
/** 15 seconds after a site's last tab closes, its cookies and storage are deleted (unless kept). */
object AutoDelete {
    private const val GRACE_MS = 15_000L
    private val pending = HashMap<String, Job>()
    private var psl: PublicSuffixList? = null
    private val siteCache = HashMap<String, String>()
    private lateinit var scope: CoroutineScope

    private suspend fun siteOf(context: Context, url: String): String? {
        val host = try {
            Uri.parse(url).takeIf { it.scheme == "http" || it.scheme == "https" }?.host
        } catch (_: Exception) {
            null
        } ?: return null
        siteCache[host]?.let { return it }
        val list = psl ?: PublicSuffixList(context.applicationContext).also { psl = it }
        val site = try {
            list.getPublicSuffixPlusOne(host).await() ?: host
        } catch (_: Exception) {
            host
        }
        if (siteCache.size > 500) siteCache.clear()
        siteCache[host] = site
        return site
    }

    fun kept(host: String, keepText: String?): Boolean =
        keepText.orEmpty().split(Regex("[\\s,]+"))
            .map { it.trim().lowercase().removePrefix("*.").removePrefix("https://").removePrefix("http://").substringBefore("/") }
            .filter { it.isNotEmpty() }
            .any { host == it || host.endsWith(".$it") }

    fun start(context: Context, appScope: CoroutineScope) {
        scope = appScope
        val store = context.components.core.store
        appScope.launch(Dispatchers.Main) {
            var previous = emptySet<String>()
            store.flow()
                .map { state -> state.tabs.filter { !it.content.private }.map { it.content.url } }
                .distinctUntilChanged()
                .collect { urls ->
                    val now = urls.mapNotNull { siteOf(context, it) }.toSet()
                    for (gone in previous - now) schedule(context, gone)
                    for (back in now) pending.remove(back)?.cancel()
                    previous = now
                }
        }
    }

    private fun schedule(context: Context, site: String) {
        if (!Ignifox.prefs(context).getBoolean(ExtraKeys.AUTO_DELETE, false)) return
        pending.remove(site)?.cancel()
        pending[site] = scope.launch(Dispatchers.Main) {
            delay(GRACE_MS)
            pending.remove(site)
            if (!kept(site, Ignifox.prefs(context).getString(ExtraKeys.KEEP_SITES, ""))) clear(context, site)
        }
    }

    fun clear(context: Context, site: String) {
        context.components.core.engine.clearData(
            Engine.BrowsingData.select(
                Engine.BrowsingData.COOKIES,
                Engine.BrowsingData.DOM_STORAGES,
                Engine.BrowsingData.AUTH_SESSIONS,
            ),
            host = site,
        )
    }

    /** Menu action: add or remove the current site from the keep-list. Returns true if now kept. */
    suspend fun toggleKeep(context: Context, url: String): Boolean? {
        val site = siteOf(context, url) ?: return null
        val p = Ignifox.prefs(context)
        val text = p.getString(ExtraKeys.KEEP_SITES, "").orEmpty()
        val lines = text.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
        val keep = !kept(site, text)
        val next = if (keep) lines + site else lines.filter { !kept(site, it) }
        p.edit { putString(ExtraKeys.KEEP_SITES, next.joinToString("\n")) }
        return keep
    }
}

// ===================================================================== news feeds
/** Headlines for the new tab page. The page can't fetch anything itself, so the app does. */
object Feeds {
    private const val FILE = "ignifox-feeds.json"
    private const val MAX_URLS = 8

    data class Item(val title: String, val link: String, val date: String, val source: String) {
        val time: Long get() = parseDate(date)
    }

    fun urls(text: String?): List<String> =
        text.orEmpty().split(Regex("\\s+")).map { it.trim() }
            .filter { Regex("^https?://\\S+$", RegexOption.IGNORE_CASE).matches(it) }
            .take(MAX_URLS)

    private val entities = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ")

    private fun decode(s: String): String =
        s.replace(Regex("<!\\[CDATA\\[([\\s\\S]*?)]]>"), "$1")
            .replace(Regex("<[^>]+>"), "")
            .replace(Regex("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);")) { m ->
                val e = m.groupValues[1]
                when {
                    e.startsWith("#x", true) -> e.drop(2).toIntOrNull(16)?.takeIf { it in 1..0x10FFFF }
                        ?.let { String(Character.toChars(it)) } ?: ""
                    e.startsWith("#") -> e.drop(1).toIntOrNull()?.takeIf { it in 1..0x10FFFF }
                        ?.let { String(Character.toChars(it)) } ?: ""
                    else -> entities[e.lowercase()] ?: m.value
                }
            }
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun firstTag(block: String, name: String): String =
        Regex("<$name(?:\\s[^>]*)?>([\\s\\S]*?)</$name>", RegexOption.IGNORE_CASE).find(block)
            ?.let { decode(it.groupValues[1]) }.orEmpty()

    /** Same rules as the desktop parser (data.sys.mjs parseFeed): titles, http(s) links, dates. */
    fun parse(xml: String, limit: Int = 20): List<Item> {
        val head = xml.replace(Regex("<(item|entry)[\\s>][\\s\\S]*$", RegexOption.IGNORE_CASE), "")
        val source = firstTag(head, "title").take(60)
        val out = mutableListOf<Item>()
        for (m in Regex("<(item|entry)(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>", RegexOption.IGNORE_CASE).findAll(xml)) {
            if (out.size >= limit) break
            val block = m.groupValues[2]
            val link = if (m.groupValues[1].equals("entry", true)) {
                val tag = Regex("<link\\b[^>]*rel=[\"']alternate[\"'][^>]*>", RegexOption.IGNORE_CASE).find(block)
                    ?: Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE).find(block)
                tag?.let { Regex("href=[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE).find(it.value)?.groupValues?.get(1) }
                    ?.let { decode(it) }.orEmpty()
            } else {
                firstTag(block, "link").ifEmpty { firstTag(block, "guid") }
            }
            val title = firstTag(block, "title")
            val date = listOf("pubDate", "updated", "published", "dc:date").map { firstTag(block, it) }.firstOrNull { it.isNotEmpty() }.orEmpty()
            if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(link) || title.isEmpty()) continue
            out.add(Item(title.take(200), link, date, source))
        }
        return out
    }

    private fun parseDate(s: String): Long {
        for (pattern in listOf("EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd")) {
            try {
                return SimpleDateFormat(pattern, Locale.US).parse(s.trim())?.time ?: continue
            } catch (_: Exception) {
            }
        }
        return 0
    }

    fun merge(lists: List<List<Item>>, count: Int): List<Item> {
        val per = maxOf(1, count / maxOf(1, lists.size))
        val picked = lists.flatMap { it.take(per) }
        val rest = lists.flatMap { it.drop(per) }.sortedByDescending { it.time }
        return (picked + rest.take(maxOf(0, count - picked.size))).sortedByDescending { it.time }.take(count)
    }

    suspend fun refresh(context: Context): Int = withContext(Dispatchers.IO) {
        val p = Ignifox.prefs(context)
        val urls = urls(p.getString(ExtraKeys.NT_FEEDS, ""))
        val count = p.getInt(ExtraKeys.NT_FEEDS_COUNT, 6).coerceIn(3, 20)
        val items = if (urls.isEmpty()) {
            emptyList()
        } else {
            merge(urls.map { url -> try { parse(httpGet(url)) } catch (_: Exception) { emptyList() } }, count)
        }
        val json = JSONArray()
        for (item in items) {
            json.put(JSONObject().put("title", item.title).put("link", item.link).put("date", item.date).put("source", item.source))
        }
        File(context.filesDir, FILE).writeText(json.toString())
        items.size
    }

    fun cached(context: Context): JSONArray =
        try {
            if (urls(Ignifox.prefs(context).getString(ExtraKeys.NT_FEEDS, "")).isEmpty()) JSONArray()
            else JSONArray(File(context.filesDir, FILE).readText())
        } catch (_: Exception) {
            JSONArray()
        }
}

// ===================================================================== theme gallery
/** The community themes in the Ignifox repository (themes/index.json), shared with the desktop. */
object Gallery {
    private const val URL_INDEX = "https://raw.githubusercontent.com/rxvy-dev/ignifox/main/themes/index.json"

    data class Theme(val name: String, val description: String, val code: String)

    suspend fun load(): List<Theme> = withContext(Dispatchers.IO) {
        val arr = JSONObject(httpGet(URL_INDEX)).optJSONArray("themes") ?: JSONArray()
        (0 until minOf(arr.length(), 200)).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val code = o.optString("code")
            if (Ignifox.paletteFromCode(code) == null) return@mapNotNull null
            Theme(o.optString("name").take(40), o.optString("description").take(140), code)
        }
    }

    fun apply(context: Context, code: String): Boolean {
        if (Ignifox.paletteFromCode(code) == null) return false
        Ignifox.prefs(context).edit {
            putString(Ignifox.THEME_CODE, code)
            putString(Ignifox.THEME, Ignifox.CUSTOM)
            putString(Ignifox.ACCENT, "")
        }
        Ignifox.changed(context)
        return true
    }
}

// ===================================================================== site tint
object SiteTint {
    /** The colour a site "is", from its icon: the average of its vivid pixels. Same rule as desktop. */
    fun colorOf(icon: Bitmap?): Int? {
        if (icon == null) return null
        val small = try {
            Bitmap.createScaledBitmap(icon, 24, 24, true)
        } catch (_: Exception) {
            return null
        }
        val px = IntArray(24 * 24)
        small.getPixels(px, 0, 24, 0, 0, 24, 24)
        var r = 0.0; var g = 0.0; var b = 0.0; var w = 0.0
        for (c in px) {
            val a = Color.alpha(c) / 255.0
            if (a < 0.5) continue
            val R = Color.red(c); val G = Color.green(c); val B = Color.blue(c)
            val max = maxOf(R, G, B); val min = minOf(R, G, B)
            val sat = if (max == 0) 0.0 else (max - min).toDouble() / max
            if (sat < 0.25 || max < 40) continue
            val weight = sat * a
            r += R * weight; g += G * weight; b += B * weight; w += weight
        }
        if (w < 0.5) return null
        return Color.rgb((r / w).toInt(), (g / w).toInt(), (b / w).toInt())
    }
}

// ===================================================================== uBlock Origin
/** On the first start, offer uBlock Origin. Android asks you to confirm its permissions. */
object UBlock {
    private const val OFFERED = "igni_ubo_offered"
    const val URL_XPI = "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi"

    fun offerOnce(context: Context) {
        val p = Ignifox.prefs(context)
        if (p.getBoolean(OFFERED, false)) return
        p.edit { putBoolean(OFFERED, true) }
        install(context)
    }

    fun install(context: Context) {
        val app = context.applicationContext
        app.components.core.addonManager.installAddon(
            url = URL_XPI,
            installationMethod = InstallationMethod.MANAGER,
            onSuccess = { toast(app, app.getString(R.string.igni_ubo_installed)) },
            onError = { },
        )
    }
}

// ===================================================================== swipe the address bar
/**
 * Swipe left or right on the address bar to go to the next or previous tab. Lives in the
 * activity's touch dispatch so the toolbar's own taps keep working.
 */
class ToolbarSwipe(private val activity: Activity, private val onSwitch: (direction: Int) -> Boolean) {
    private var startX = 0f
    private var startY = 0f
    private var tracking = false
    private var swiping = false
    private val slop = ViewConfiguration.get(activity).scaledTouchSlop * 3

    /** Returns true when the event was used for a swipe. */
    fun onTouch(ev: MotionEvent, bar: View?, cancelChildren: (MotionEvent) -> Unit): Boolean {
        if (!Ignifox.prefs(activity).getBoolean(ExtraKeys.SWIPE_TABS, true)) return false
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                tracking = bar != null && bar.isShown && bar.findFocus() == null && hit(bar, ev)
                swiping = false
                startX = ev.rawX
                startY = ev.rawY
            }
            MotionEvent.ACTION_MOVE -> if (tracking) {
                val dx = ev.rawX - startX
                val dy = ev.rawY - startY
                if (!swiping && abs(dx) > slop && abs(dx) > 2 * abs(dy)) {
                    swiping = true
                    val cancel = MotionEvent.obtain(ev).apply { action = MotionEvent.ACTION_CANCEL }
                    cancelChildren(cancel)
                    cancel.recycle()
                }
                if (swiping) {
                    bar?.translationX = dx / 4
                    return true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> if (swiping) {
                val dx = ev.rawX - startX
                swiping = false
                tracking = false
                bar?.animate()?.translationX(0f)?.setDuration(150)?.start()
                if (ev.actionMasked == MotionEvent.ACTION_UP) onSwitch(if (dx < 0) 1 else -1)
                return true
            } else {
                tracking = false
            }
        }
        return false
    }

    private fun hit(v: View, ev: MotionEvent): Boolean {
        val loc = IntArray(2)
        v.getLocationOnScreen(loc)
        return ev.rawX >= loc[0] && ev.rawX <= loc[0] + v.width && ev.rawY >= loc[1] && ev.rawY <= loc[1] + v.height
    }
}
