/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import org.mozilla.reference.browser.BrowserActivity
import org.mozilla.reference.browser.IntentReceiverActivity
import org.mozilla.reference.browser.R

/** Home-screen widget: a search box, your first four new-tab shortcuts and the burn button. */
class IgniWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        manager.updateAppWidget(ids, views(context))
    }

    companion object {
        private val TILES = intArrayOf(R.id.w_s1, R.id.w_s2, R.id.w_s3, R.id.w_s4)
        private const val BG_ALPHA = 236

        /** Redraw every placed widget, e.g. after the theme or shortcuts change. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, IgniWidget::class.java))
            if (ids.isNotEmpty()) manager.updateAppWidget(ids, views(context))
        }

        private fun action(context: Context, action: String, code: Int): PendingIntent =
            PendingIntent.getActivity(
                context,
                code,
                Intent(context, BrowserActivity::class.java).setAction(action)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

        fun views(context: Context): RemoteViews {
            val p = Ignifox.palette(context)
            val v = RemoteViews(context.packageName, R.layout.ignifox_widget)
            v.setInt(R.id.w_bg, "setColorFilter", p.bg)
            v.setInt(R.id.w_bg, "setImageAlpha", BG_ALPHA)
            v.setInt(R.id.w_search_bg, "setColorFilter", p.bg3)
            v.setTextColor(R.id.w_search_text, p.fgDim)
            v.setOnClickPendingIntent(R.id.w_search, action(context, BrowserActivity.ACTION_SEARCH, 1))

            val links = Ignifox.parseLinks(
                Ignifox.prefs(context).getString(Ignifox.NT_LINKS, Ignifox.DEFAULT_LINKS) ?: Ignifox.DEFAULT_LINKS,
            )
            TILES.forEachIndexed { i, id ->
                val link = links.getOrNull(i)
                if (link == null) {
                    v.setViewVisibility(id, android.view.View.INVISIBLE)
                    return@forEachIndexed
                }
                val (title, url) = link
                val label = title.ifEmpty { Uri.parse(url).host.orEmpty().removePrefix("www.") }
                v.setViewVisibility(id, android.view.View.VISIBLE)
                v.setTextViewText(id, label.take(1).uppercase())
                v.setContentDescription(id, label)
                v.setTextColor(id, p.accent)
                v.setInt(id, "setBackgroundColor", Color.TRANSPARENT)
                val open = Intent(Intent.ACTION_VIEW, Uri.parse(url), context, IntentReceiverActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                v.setOnClickPendingIntent(
                    id,
                    PendingIntent.getActivity(context, 10 + i, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
                )
            }
            v.setTextColor(R.id.w_burn, p.fg)
            v.setInt(R.id.w_burn, "setBackgroundColor", Color.TRANSPARENT)
            v.setOnClickPendingIntent(R.id.w_burn, action(context, BrowserActivity.ACTION_BURN, 2))
            return v
        }
    }
}
