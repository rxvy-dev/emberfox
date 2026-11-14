/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.reference.browser.components

import android.content.Context
import mozilla.components.feature.push.AutoPushFeature
import mozilla.components.lib.crash.CrashReporter

/**
 * Ignifox ships without Google's Firebase Cloud Messaging, the only push transport the
 * upstream components support, so there is no push feature. Everything that depends on it
 * already treats a missing feature as "push is off".
 */
@Suppress("UNUSED_PARAMETER")
class Push(
    context: Context,
    crashReporter: CrashReporter,
) {
    val feature: AutoPushFeature? = null
}
