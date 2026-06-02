package com.rayact.engine

/**
 * Process-level facade over the native Rayact engine. The engine (QuickJS +
 * raym3) is a singleton not owned by any Activity, so it survives Activity
 * recreation and can coordinate multiple surfaces/screens.
 *
 * JNI symbol names map to Java_com_rayact_engine_RayactEngine_native* in
 * native/android/jni_bridge.cpp.
 */
object RayactEngine {
    init { System.loadLibrary("rayact") }

    @Volatile var created = false
        private set

    /** Create the engine once. dataPath = context.filesDir.absolutePath. */
    @Synchronized
    fun create(dataPath: String): Boolean {
        if (created) return true
        created = nativeCreate(dataPath)
        return created
    }

    /** Load app JS from a source string (bundled asset). */
    fun loadSource(source: String): Boolean = nativeLoadScript(0, source)

    /** Load app JS from a dev-server URL (adb reverse). */
    fun loadDevServer(url: String): Boolean = nativeLoadScript(1, url)

    // Touch action codes — mirror RCORE_AS_TOUCH_* in rcore_android_surface.h
    const val TOUCH_DOWN = 0
    const val TOUCH_UP = 1
    const val TOUCH_MOVE = 2

    external fun nativeCreate(dataPath: String): Boolean
    external fun nativeLoadScript(mode: Int, arg: String): Boolean
    external fun nativeSurfaceCreated(surface: android.view.Surface, density: Float)
    external fun nativeRenderFrame()
    external fun nativeTouch(action: Int, id: Int, x: Float, y: Float)
    external fun nativeSurfaceDestroyed()
    external fun nativeDestroy()
}
