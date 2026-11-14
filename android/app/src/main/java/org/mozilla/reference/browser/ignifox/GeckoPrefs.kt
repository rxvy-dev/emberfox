/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.ignifox

import android.content.Context
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.preferences.Branch
import mozilla.components.support.base.log.logger.Logger

/**
 * Engine preferences Ignifox sets on every start: the same "send nothing" switches the
 * Linux browser locks, plus a few freedom settings. They stay visible in about:config.
 */
object GeckoPrefs {
    private val logger = Logger("IgnifoxPrefs")

    private val OFF =
        listOf(
            "toolkit.telemetry.enabled",
            "toolkit.telemetry.unified",
            "toolkit.telemetry.archive.enabled",
            "toolkit.telemetry.updatePing.enabled",
            "toolkit.telemetry.bhrPing.enabled",
            "toolkit.telemetry.firstShutdownPing.enabled",
            "toolkit.telemetry.newProfilePing.enabled",
            "toolkit.telemetry.shutdownPingSender.enabled",
            "datareporting.healthreport.uploadEnabled",
            "datareporting.policy.dataSubmissionEnabled",
            "datareporting.usage.uploadEnabled",
            "app.shield.optoutstudies.enabled",
            "app.normandy.enabled",
            "browser.ping-centre.telemetry",
            "dom.private-attribution.submission.enabled",
            "network.captive-portal-service.enabled",
            "network.connectivity-service.enabled",
            "beacon.enabled",
            "browser.send_pings",
            // Passkeys on Android need Google Play Services, which Ignifox does not ship.
            "security.webauth.webauthn",
        )

    private val ON =
        listOf(
            "privacy.globalprivacycontrol.functionality.enabled",
            "privacy.query_stripping.enabled",
            "privacy.query_stripping.enabled.pbmode",
        )

    private val TEXT =
        mapOf(
            "toolkit.telemetry.server" to "data:,",
            "toolkit.coverage.endpoint.base" to "",
            "app.normandy.api_url" to "",
            "breakpad.reportURL" to "",
        )

    @OptIn(ExperimentalAndroidComponentsApi::class)
    fun apply(context: Context, engine: Engine) {
        val fail: (String) -> (Throwable) -> Unit = { name -> { logger.warn("could not set $name: ${it.message}") } }
        for (name in OFF) engine.setBrowserPref(name, false, Branch.USER, {}, fail(name))
        for (name in ON) engine.setBrowserPref(name, true, Branch.USER, {}, fail(name))
        for ((name, value) in TEXT) engine.setBrowserPref(name, value, Branch.USER, {}, fail(name))

        // Freedom: let people install add-ons that Mozilla has not signed, if they ask for it.
        val unsigned = Ignifox.prefs(context).getBoolean(Ignifox.UNSIGNED_ADDONS, false)
        engine.setBrowserPref("xpinstall.signatures.required", !unsigned, Branch.USER, {}, fail("signatures"))
    }
}
