package com.rayact.generated

import android.content.Context
import com.rayact.engine.RayactPlatformRegistry

object RayactGeneratedModules {
    @JvmStatic fun register(context: Context, registry: RayactPlatformRegistry) {
        dev.rayact.barcodescanner.RayactBarcodeScannerRegistration().register(context, registry)
        dev.rayact.haptics.RayactHapticsRegistration().register(context, registry)
        dev.rayact.sensors.RayactSensorsRegistration().register(context, registry)
        dev.rayact.webview.RayactWebViewRegistration().register(context, registry)
    }
}
