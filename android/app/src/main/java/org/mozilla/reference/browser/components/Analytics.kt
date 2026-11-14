/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.components

import android.content.Context
import mozilla.components.concept.base.crash.Breadcrumb
import mozilla.components.lib.crash.Crash
import mozilla.components.lib.crash.CrashReporter
import mozilla.components.lib.crash.service.CrashReporterService

/**
 * Ignifox sends nothing anywhere. Other components need a [CrashReporter] instance to exist,
 * so this one is switched off and its only "service" drops every report on the floor.
 */
class Analytics(private val context: Context) {
    val crashReporter: CrashReporter by lazy {
        CrashReporter(
            context = context,
            services = listOf(NoCrashReports),
            telemetryServices = emptyList(),
            shouldPrompt = CrashReporter.Prompt.NEVER,
            enabled = false,
        )
    }
}

private object NoCrashReports : CrashReporterService {
    override val id: String = "none"
    override val name: String = "None"

    override fun createCrashReportUrl(identifier: String): String? = null

    override fun report(crash: Crash.UncaughtExceptionCrash): String? = null

    override fun report(crash: Crash.NativeCodeCrash): String? = null

    override fun report(
        throwable: Throwable,
        breadcrumbs: ArrayList<Breadcrumb>,
    ): String? = null
}
