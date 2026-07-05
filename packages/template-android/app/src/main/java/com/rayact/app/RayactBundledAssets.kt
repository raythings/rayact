package com.rayact.app

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Extracts the APK's bundled runtime files (icon/emoji fonts, stylesheet
 * files) from the assets/runtime tree into filesDir, preserving relative paths.
 *
 * The native engine loads these via plain filesystem paths relative to its
 * working directory (filesDir) — e.g. ./resources/fonts/MaterialSymbolsRounded.ttf
 * for icons and ./packages/rayact-react/src/avoid-keyboard.css for importCSS.
 * Previously these were pushed by run-android.sh via `adb run-as`, which
 * silently broke on every reinstall (blank navbar icons, collapsed layout).
 *
 * Extraction runs once per APK install/update (tracked by lastUpdateTime).
 */
object RayactBundledAssets {
    private const val TAG = "RayactBundledAssets"
    private const val ASSET_ROOT = "runtime"
    private const val PREFS = "rayact_bundled_assets"
    private const val KEY_STAMP = "apk_stamp"

    fun extract(context: Context) {
        val stamp = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        }.getOrDefault(0L)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (stamp != 0L && prefs.getLong(KEY_STAMP, -1L) == stamp && stampedFilesPresent(context)) {
            return
        }
        val copied = copyDir(context, ASSET_ROOT)
        if (copied >= 0) {
            prefs.edit().putLong(KEY_STAMP, stamp).apply()
            Log.i(TAG, "Extracted $copied bundled runtime file(s) to ${context.filesDir}")
        }
    }

    /** Cheap sanity check so a wiped files dir re-triggers extraction. */
    private fun stampedFilesPresent(context: Context): Boolean {
        val fonts = File(context.filesDir, "resources/fonts")
        return fonts.isDirectory && (fonts.list()?.isNotEmpty() == true)
    }

    /** Recursively copies the given asset directory into filesDir. Returns file count, -1 on failure. */
    private fun copyDir(context: Context, path: String): Int {
        val children = runCatching { context.assets.list(path) }.getOrNull() ?: return -1
        var count = 0
        for (child in children) {
            val assetPath = "$path/$child"
            val grandChildren = runCatching { context.assets.list(assetPath) }.getOrNull()
            if (grandChildren != null && grandChildren.isNotEmpty()) {
                val sub = copyDir(context, assetPath)
                if (sub < 0) return -1
                count += sub
            } else {
                val rel = assetPath.removePrefix("$ASSET_ROOT/")
                val out = File(context.filesDir, rel)
                val ok = runCatching {
                    out.parentFile?.mkdirs()
                    context.assets.open(assetPath).use { input ->
                        val tmp = File(out.parentFile, "${out.name}.tmp")
                        tmp.outputStream().use { input.copyTo(it) }
                        if (!tmp.renameTo(out)) {
                            tmp.copyTo(out, overwrite = true)
                            tmp.delete()
                        }
                    }
                }.isSuccess
                if (!ok) {
                    Log.e(TAG, "Failed to extract $assetPath")
                    return -1
                }
                count++
            }
        }
        return count
    }
}
