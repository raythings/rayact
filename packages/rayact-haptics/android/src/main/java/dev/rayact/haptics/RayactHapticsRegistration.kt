package dev.rayact.haptics

import android.view.HapticFeedbackConstants
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONObject

class RayactHapticsRegistration : RayactPlatformModuleRegistration {
    override fun register(
        context: android.content.Context,
        registry: RayactPlatformRegistry,
    ) {
        registry.registerModule("haptics") { method, payload, completion ->
            runCatching {
                val activity = RayactPlatformRegistry.currentActivity()
                    ?: error("No foreground activity is available")
                val data = runCatching { JSONObject(payload.toString(Charsets.UTF_8)) }
                    .getOrElse { JSONObject() }
                val feedback = when (method) {
                    "selection" -> HapticFeedbackConstants.TEXT_HANDLE_MOVE
                    "impact" -> when (data.optString("style")) {
                        "heavy", "rigid" -> HapticFeedbackConstants.LONG_PRESS
                        else -> HapticFeedbackConstants.CONTEXT_CLICK
                    }
                    "notification" -> when (data.optString("type")) {
                        "error" -> HapticFeedbackConstants.REJECT
                        else -> HapticFeedbackConstants.CONFIRM
                    }
                    else -> error("Unknown haptics method '$method'")
                }
                activity.runOnUiThread {
                    activity.window.decorView.performHapticFeedback(feedback)
                }
                "true".toByteArray(Charsets.UTF_8)
            }.fold(
                onSuccess = { completion(Result.success(it)) },
                onFailure = { completion(Result.failure(it)) },
            )
        }
    }
}
