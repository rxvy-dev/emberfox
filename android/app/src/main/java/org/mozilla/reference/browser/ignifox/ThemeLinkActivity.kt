/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import org.mozilla.reference.browser.BrowserActivity
import org.mozilla.reference.browser.R

/**
 * Opens ignifox://theme?code=igni:… links, e.g. from the QR code in Ignifox Studio on Linux.
 * Always asks before changing anything, since any page could link here.
 */
class ThemeLinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val code = intent?.data?.getQueryParameter("code")
        if (Ignifox.paletteFromCode(code) == null) {
            Toast.makeText(this, R.string.igni_theme_code_bad, Toast.LENGTH_LONG).show()
            finish()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.igni_theme_link_title)
            .setMessage(code)
            .setPositiveButton(R.string.igni_theme_link_use) { _, _ ->
                Gallery.apply(this, code!!)
                startActivity(Intent(this, BrowserActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                finish()
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}
