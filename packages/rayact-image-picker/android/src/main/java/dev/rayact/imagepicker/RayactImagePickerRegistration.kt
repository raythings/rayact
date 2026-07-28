package dev.rayact.imagepicker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONArray
import org.json.JSONObject

class RayactImagePickerRegistration : RayactPlatformModuleRegistration {
    override fun register(context: Context, registry: RayactPlatformRegistry) {
        val module = ImagePickerModule(context.applicationContext)
        registry.registerModule("image-picker") { method, payload, completion ->
            runCatching { module.invoke(method, payload.toString(Charsets.UTF_8)) }
                .fold(
                    onSuccess = { completion(Result.success(it.toByteArray(Charsets.UTF_8))) },
                    onFailure = { completion(Result.failure(it)) },
                )
        }
    }
}

private class ImagePickerModule(private val context: Context) {
    @Volatile private var state = JSONObject().put("status", "idle").toString()
    @Volatile private var wantsBase64 = false

    fun invoke(method: String, payloadJson: String): String = when (method) {
        "requestPermission" -> JSONObject()
            .put("granted", true)
            .put("canAskAgain", true)
            .put("status", "granted")
            .toString()
        "startPicker" -> {
            startPicker(runCatching { JSONObject(payloadJson) }.getOrElse { JSONObject() })
            "true"
        }
        "pollPicker" -> state
        "__activityResult" -> {
            handleActivityResult(JSONObject(payloadJson))
            "true"
        }
        else -> error("Unknown image-picker method '$method'")
    }

    private fun startPicker(options: JSONObject) {
        val activity = RayactPlatformRegistry.currentActivity()
            ?: error("No foreground activity is available")
        wantsBase64 = options.optBoolean("base64", false)
        state = JSONObject().put("status", "pending").toString()
        activity.runOnUiThread {
            val intent = if (android.os.Build.VERSION.SDK_INT >= 33) {
                Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
            } else {
                Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*")
            }
            runCatching { activity.startActivityForResult(intent, REQUEST_CODE) }
                .onFailure(::fail)
        }
    }

    private fun handleActivityResult(payload: JSONObject) {
        if (payload.optInt("requestCode") != REQUEST_CODE) return
        val uriText = payload.optString("uri").takeIf { it.isNotBlank() && it != "null" }
        if (payload.optInt("resultCode") != Activity.RESULT_OK || uriText == null) {
            state = JSONObject().put("status", "canceled").toString()
            return
        }
        val uri = android.net.Uri.parse(uriText)
        Thread {
            runCatching {
                val resolver = context.contentResolver
                val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, dimensions) }
                var name: String? = null
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) name = cursor.getString(0)
                }
                val asset = JSONObject()
                    .put("uri", uri.toString())
                    .put("mimeType", resolver.getType(uri) ?: "image/*")
                    .put("width", dimensions.outWidth.coerceAtLeast(0))
                    .put("height", dimensions.outHeight.coerceAtLeast(0))
                    .put("fileName", name ?: JSONObject.NULL)
                if (wantsBase64) {
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                    asset.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                }
                state = JSONObject().put("status", "success")
                    .put("assets", JSONArray().put(asset))
                    .toString()
            }.onFailure(::fail)
        }.start()
    }

    private fun fail(error: Throwable) {
        state = JSONObject()
            .put("status", "error")
            .put("error", error.message ?: "Native image picker failed")
            .toString()
    }

    private companion object {
        const val REQUEST_CODE = 58421
    }
}
