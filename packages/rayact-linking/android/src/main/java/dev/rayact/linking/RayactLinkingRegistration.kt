package dev.rayact.linking

import android.content.Intent
import android.net.Uri
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONObject

class RayactLinkingRegistration : RayactPlatformModuleRegistration {
    override fun register(
        context: android.content.Context,
        registry: RayactPlatformRegistry,
    ) {
        registry.registerModule("linking") { method, payload, completion ->
            runCatching {
                val data = runCatching { JSONObject(payload.toString(Charsets.UTF_8)) }
                    .getOrElse { JSONObject() }
                val url = data.optString("url")
                require(url.isNotBlank()) { "A URL is required" }
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                when (method) {
                    "canOpenURL" -> {
                        val available = intent.resolveActivity(context.packageManager) != null
                        available.toString().toByteArray(Charsets.UTF_8)
                    }
                    "openURL" -> {
                        val activity = RayactPlatformRegistry.currentActivity()
                            ?: error("No foreground activity is available")
                        require(intent.resolveActivity(context.packageManager) != null) {
                            "No application can open URL: $url"
                        }
                        activity.runOnUiThread { activity.startActivity(intent) }
                        "true".toByteArray(Charsets.UTF_8)
                    }
                    else -> error("Unknown linking method '$method'")
                }
            }.fold(
                onSuccess = { completion(Result.success(it)) },
                onFailure = { completion(Result.failure(it)) },
            )
        }
    }
}
