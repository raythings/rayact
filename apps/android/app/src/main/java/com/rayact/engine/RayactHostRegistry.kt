package com.rayact.engine

import android.os.Handler
import android.os.Looper
import com.rayact.app.NavigationHost
import com.rayact.app.RayactScreenFragment
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Bridge between the C++ engine (JNI) and the Kotlin [NavigationHost]. The
 * JS-side navigator (via `__rayactHostRequestNewSurface`) calls into C++,
 * which calls into the JVM to allocate a new EGL surface + engine screen.
 *
 * Each pushed screen is a [RayactScreenFragment] (a proper Android Fragment
 * with lifecycle + FragmentManager back stack), mirroring the spoke design
 * from `@tamer4lynx/tamer-navigation`. Unlike tamer, all fragments share
 * ONE QJS context (the C++ engine coordinates them, not separate JS VMs).
 */
object RayactHostRegistry {

    @Volatile
    private var host: NavigationHost? = null

    fun setHost(h: NavigationHost) {
        host = h
    }

    fun clearHost(h: NavigationHost) {
        if (host === h) host = null
    }

    /**
     * Allocates a new screen fragment on the registered host. Returns the
     * new surfaceId (>0) or 0 on failure / no host. Blocks up to 2 seconds
     * for the fragment's `surfaceId` to become available (the engine
     * allocates the screen in the Fragment's `RayactSurfaceView.surfaceCreated`
     * callback, which fires asynchronously on the render thread).
     *
     * Called from the render thread by the JNI reverse-call. The Fragment
     * transaction is committed on the main thread.
     */
    fun requestNewSurface(): Int {
        val h = host ?: return 0
        val latch = CountDownLatch(1)
        val result = IntArray(1) // [surfaceId]
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val frag = h.pushScreen()
                frag.onSurfaceReady = { sid ->
                    result[0] = sid
                    latch.countDown()
                }
                // If the surface was already created synchronously, the
                // listener will fire too late; check now as a fallback.
                if (frag.surfaceId > 0) {
                    result[0] = frag.surfaceId
                    latch.countDown()
                }
            } catch (t: Throwable) {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
        return result[0]
    }

    /**
     * Pop the topmost fragment via the FragmentManager back stack. Called
     * from the JS navigator via `__rayactHostReleaseTopSurface`. The
     * Fragment's `onDestroyView` → `surfaceDestroyed` → `nativeDestroySurface`
     * chain tears down the EGL surface and engine screen.
     */
    fun releaseTopSurface() {
        val h = host ?: return
        Handler(Looper.getMainLooper()).post {
            h.popScreen()
        }
    }

    /**
     * Returns the root surfaceId (the one MainActivity created with
     * `installRoot`). The JS navigator uses this for the initial route,
     * so the first screen doesn't allocate a redundant new fragment.
     */
    fun rootSurfaceId(): Int = host?.rootSurfaceId ?: 0

    /**
     * JS asks the host to finish the Activity (BackHandler.exitApp() OR
     * the system back press reached the root and no JS listener handled
     * it). The render thread's drain in jni_bridge.cpp posts this on the
     * main thread so the finish goes through the activity lifecycle
     * correctly.
     */
    fun finishActivityFromHost() {
        val h = host ?: return
        val activity = (h.context as? android.app.Activity) ?: return
        Handler(Looper.getMainLooper()).post { activity.finish() }
    }
}
