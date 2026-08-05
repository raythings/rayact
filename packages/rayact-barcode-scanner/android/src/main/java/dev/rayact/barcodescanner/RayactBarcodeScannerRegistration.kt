package dev.rayact.barcodescanner

import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONObject

class RayactBarcodeScannerRegistration : RayactPlatformModuleRegistration {
    override fun register(
        context: android.content.Context,
        registry: RayactPlatformRegistry,
    ) {
        val scanner = BarcodeScannerModule()
        registry.registerModule("barcode-scanner") { method, payload, completion ->
            runCatching { scanner.invoke(method, payload.toString(Charsets.UTF_8)) }
                .fold(
                    onSuccess = { completion(Result.success(it.toByteArray(Charsets.UTF_8))) },
                    onFailure = { completion(Result.failure(it)) },
                )
        }
    }
}

private class BarcodeScannerModule {
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
        check(stateJson().optString("status") != "pending") { "A barcode scan is already in progress" }
        val activity = RayactPlatformRegistry.currentActivity()
            ?: error("No foreground activity is available")
        state = JSONObject().put("status", "pending").toString()
        activity.runOnUiThread {
            runCatching {
                val formats = requestedFormats(payload)
                val builder = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(formats.first(), *formats.drop(1).toIntArray())
                    .enableAutoZoom()
                GmsBarcodeScanning.getClient(activity, builder.build())
                    .startScan()
                    .addOnSuccessListener { barcode ->
                        val raw = barcode.rawValue
                        if (raw.isNullOrEmpty()) {
                            fail(IllegalStateException("Scanner returned an empty value"))
                        } else {
                            state = JSONObject()
                                .put("status", "success")
                                .put("data", raw)
                                .put("format", formatName(barcode.format))
                                .toString()
                        }
                    }
                    .addOnCanceledListener {
                        state = JSONObject().put("status", "canceled").toString()
                    }
                    .addOnFailureListener { error ->
                        if (error.message?.trim()?.equals("Failed to scan code.", ignoreCase = true) == true) {
                            state = JSONObject().put("status", "canceled").toString()
                        } else {
                            fail(error)
                        }
                    }
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
        if (requested == null || requested.length() == 0) return listOf(Barcode.FORMAT_ALL_FORMATS)
        return buildList {
            for (index in 0 until requested.length()) {
                formatConstant(requested.optString(index))?.let(::add)
            }
        }.ifEmpty { listOf(Barcode.FORMAT_ALL_FORMATS) }
    }

    private fun formatConstant(format: String): Int? = when (format) {
        "aztec" -> Barcode.FORMAT_AZTEC
        "codabar" -> Barcode.FORMAT_CODABAR
        "code128" -> Barcode.FORMAT_CODE_128
        "code39" -> Barcode.FORMAT_CODE_39
        "code93" -> Barcode.FORMAT_CODE_93
        "dataMatrix" -> Barcode.FORMAT_DATA_MATRIX
        "ean13" -> Barcode.FORMAT_EAN_13
        "ean8" -> Barcode.FORMAT_EAN_8
        "itf" -> Barcode.FORMAT_ITF
        "pdf417" -> Barcode.FORMAT_PDF417
        "qr" -> Barcode.FORMAT_QR_CODE
        "upcA" -> Barcode.FORMAT_UPC_A
        "upcE" -> Barcode.FORMAT_UPC_E
        else -> null
    }

    private fun formatName(format: Int): String = when (format) {
        Barcode.FORMAT_AZTEC -> "aztec"
        Barcode.FORMAT_CODABAR -> "codabar"
        Barcode.FORMAT_CODE_128 -> "code128"
        Barcode.FORMAT_CODE_39 -> "code39"
        Barcode.FORMAT_CODE_93 -> "code93"
        Barcode.FORMAT_DATA_MATRIX -> "dataMatrix"
        Barcode.FORMAT_EAN_13 -> "ean13"
        Barcode.FORMAT_EAN_8 -> "ean8"
        Barcode.FORMAT_ITF -> "itf"
        Barcode.FORMAT_PDF417 -> "pdf417"
        Barcode.FORMAT_QR_CODE -> "qr"
        Barcode.FORMAT_UPC_A -> "upcA"
        Barcode.FORMAT_UPC_E -> "upcE"
        else -> "unknown"
    }
}
