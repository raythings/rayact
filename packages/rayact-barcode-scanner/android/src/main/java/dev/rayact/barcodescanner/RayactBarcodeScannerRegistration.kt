package dev.rayact.barcodescanner

import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONObject
import java.lang.reflect.Proxy

class RayactBarcodeScannerRegistration : RayactPlatformModuleRegistration {
    override fun register(
        context: android.content.Context,
        registry: RayactPlatformRegistry,
    ) {
        val scanner = BarcodeScannerModule(registry)
        registry.registerModule("barcode-scanner") { method, payload, completion ->
            runCatching { scanner.invoke(method, payload.toString(Charsets.UTF_8)) }
                .fold(
                    onSuccess = { completion(Result.success(it.toByteArray(Charsets.UTF_8))) },
                    onFailure = { completion(Result.failure(it)) },
                )
        }
    }
}

private class BarcodeScannerModule(
    private val registry: RayactPlatformRegistry,
) {
    @Volatile private var state = JSONObject().put("status", "idle").toString()

    fun invoke(method: String, payloadJson: String): String = when (method) {
        "isAvailable" -> (RayactPlatformRegistry.currentActivity() != null).toString()
        "startScan" -> {
            startScan(runCatching { JSONObject(payloadJson) }.getOrElse { JSONObject() })
            "true"
        }
        "pollScan" -> state
        else -> error("Unknown barcode-scanner method '$method'")
    }

    private fun startScan(payload: JSONObject) {
        if (stateJson().optString("status") == "pending") {
            error("A barcode scan is already in progress")
        }
        val activity = RayactPlatformRegistry.currentActivity()
            ?: error("No foreground activity is available")
        state = JSONObject().put("status", "pending").toString()
        activity.runOnUiThread {
            runCatching {
                val builder = Class.forName(
                    "com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions\$Builder"
                ).getDeclaredConstructor().newInstance()
                val formats = requestedFormats(payload)
                builder.javaClass.methods.first { it.name == "setBarcodeFormats" }
                    .invoke(builder, formats.first(), formats.drop(1).toIntArray())
                builder.javaClass.methods.firstOrNull { it.name == "enableAutoZoom" }?.invoke(builder)
                val options = builder.javaClass.methods.first { it.name == "build" }.invoke(builder)
                val scanning = Class.forName("com.google.mlkit.vision.codescanner.GmsBarcodeScanning")
                val scanner = scanning.methods.first { it.name == "getClient" && it.parameterCount == 2 }
                    .invoke(null, activity, options)
                val task = scanner.javaClass.methods.first { it.name == "startScan" }.invoke(scanner)
                fun listener(typeName: String, body: (Array<out Any?>?) -> Unit): Any {
                    val type = Class.forName(typeName)
                    return Proxy.newProxyInstance(type.classLoader, arrayOf(type)) { _, method, args ->
                        if (method.name.startsWith("on")) body(args)
                        null
                    }
                }
                val success = listener("com.google.android.gms.tasks.OnSuccessListener") { args ->
                    val barcode = args?.firstOrNull()
                    val raw = barcode?.javaClass?.methods
                        ?.firstOrNull { it.name == "getRawValue" }?.invoke(barcode) as? String
                    val format = (barcode?.javaClass?.methods
                        ?.firstOrNull { it.name == "getFormat" }?.invoke(barcode) as? Int)
                    if (raw.isNullOrEmpty()) {
                        fail(IllegalStateException("Scanner returned an empty value"))
                    } else {
                        state = JSONObject()
                            .put("status", "success")
                            .put("data", raw)
                            .put("format", formatName(format))
                            .toString()
                    }
                }
                val canceled = listener("com.google.android.gms.tasks.OnCanceledListener") {
                    state = JSONObject().put("status", "canceled").toString()
                }
                val failure = listener("com.google.android.gms.tasks.OnFailureListener") { args ->
                    val error = args?.firstOrNull() as? Throwable
                        ?: IllegalStateException("Native barcode scan failed")
                    if (error.message?.trim()?.equals("Failed to scan code.", ignoreCase = true) == true) {
                        state = JSONObject().put("status", "canceled").toString()
                    } else {
                        fail(error)
                    }
                }
                task.javaClass.methods.first { it.name == "addOnSuccessListener" && it.parameterCount == 1 }
                    .invoke(task, success)
                task.javaClass.methods.first { it.name == "addOnCanceledListener" && it.parameterCount == 1 }
                    .invoke(task, canceled)
                task.javaClass.methods.first { it.name == "addOnFailureListener" && it.parameterCount == 1 }
                    .invoke(task, failure)
            }.onFailure(::fail)
        }
    }

    private fun fail(error: Throwable) {
        state = JSONObject()
            .put("status", "error")
            .put("error", error.message ?: "Native barcode scan failed")
            .toString()
    }

    private fun stateJson(): JSONObject =
        runCatching { JSONObject(state) }.getOrElse { JSONObject() }

    private fun requestedFormats(payload: JSONObject): List<Int> {
        val requested = payload.optJSONArray("formats")
        if (requested == null || requested.length() == 0) return listOf(-1)
        return buildList {
            for (index in 0 until requested.length()) {
                formatConstant(requested.optString(index))?.let(::add)
            }
        }.ifEmpty { listOf(-1) }
    }

    private fun formatConstant(format: String): Int? = when (format) {
        "aztec" -> 4096
        "codabar" -> 8
        "code128" -> 1
        "code39" -> 2
        "code93" -> 4
        "dataMatrix" -> 16
        "ean13" -> 32
        "ean8" -> 64
        "itf" -> 128
        "pdf417" -> 2048
        "qr" -> 256
        "upcA" -> 512
        "upcE" -> 1024
        else -> null
    }

    private fun formatName(format: Int?): String = when (format) {
        4096 -> "aztec"
        8 -> "codabar"
        1 -> "code128"
        2 -> "code39"
        4 -> "code93"
        16 -> "dataMatrix"
        32 -> "ean13"
        64 -> "ean8"
        128 -> "itf"
        2048 -> "pdf417"
        256 -> "qr"
        512 -> "upcA"
        1024 -> "upcE"
        else -> "unknown"
    }
}
