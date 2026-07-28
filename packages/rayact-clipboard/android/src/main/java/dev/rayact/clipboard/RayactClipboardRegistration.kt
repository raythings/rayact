package dev.rayact.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONObject

class RayactClipboardRegistration : RayactPlatformModuleRegistration {
    override fun register(context: Context, registry: RayactPlatformRegistry) {
        val appContext = context.applicationContext
        registry.registerModule("clipboard") { method, payload, completion ->
            val activity = RayactPlatformRegistry.currentActivity()
            if (activity == null) {
                completion(Result.failure(IllegalStateException("No foreground activity is available")))
                return@registerModule
            }
            activity.runOnUiThread {
                runCatching {
                    val manager = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    when (method) {
                        "getString" -> {
                            val clip = manager.primaryClip
                            val value = if (clip != null && clip.itemCount > 0) {
                                clip.getItemAt(0).coerceToText(appContext)?.toString().orEmpty()
                            } else ""
                            JSONObject.quote(value).toByteArray(Charsets.UTF_8)
                        }
                        "setString" -> {
                            val data = runCatching { JSONObject(payload.toString(Charsets.UTF_8)) }
                                .getOrElse { JSONObject() }
                            manager.setPrimaryClip(ClipData.newPlainText("rayact", data.optString("text")))
                            "true".toByteArray(Charsets.UTF_8)
                        }
                        "hasString" -> {
                            val clip = manager.primaryClip
                            val hasText = clip != null && clip.itemCount > 0 &&
                                !clip.getItemAt(0).coerceToText(appContext).isNullOrEmpty()
                            hasText.toString().toByteArray(Charsets.UTF_8)
                        }
                        else -> error("Unknown clipboard method '$method'")
                    }
                }.fold(
                    onSuccess = { completion(Result.success(it)) },
                    onFailure = { completion(Result.failure(it)) },
                )
            }
        }
    }
}
