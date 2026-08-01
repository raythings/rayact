package com.rayact.engine

import android.content.Context
import android.app.Activity
import android.content.Intent
import android.view.View
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.lang.ref.WeakReference

fun interface RayactPlatformModule {
    fun invoke(method: String, payload: ByteArray, completion: (Result<ByteArray>) -> Unit)
}

class RayactPlatformViewContext(
    val context: Context,
    val nodeId: Int,
    val initialProperties: Map<String, Any?>,
    val emit: (String) -> Unit,
)

interface RayactPlatformViewController {
    val view: View
    fun setProperties(properties: Map<String, Any?>) {}
    fun dispose() {}
}

fun interface RayactPlatformViewFactory {
    fun create(context: RayactPlatformViewContext): RayactPlatformViewController
}

interface RayactPlatformModuleRegistration {
    fun register(context: Context, registry: RayactPlatformRegistry)
}

class RayactPlatformRegistry {
    private val modules = ConcurrentHashMap<String, RayactPlatformModule>()
    private val viewFactories = ConcurrentHashMap<String, RayactPlatformViewFactory>()

    fun registerModule(name: String, module: RayactPlatformModule) {
        require(name.isNotBlank()) { "Platform module name must not be blank" }
        check(modules.putIfAbsent(name, module) == null) { "Platform module '$name' already registered" }
    }

    fun registerViewFactory(kind: String, factory: RayactPlatformViewFactory) {
        require(kind.isNotBlank()) { "Platform view kind must not be blank" }
        check(viewFactories.putIfAbsent(kind, factory) == null) { "Platform view '$kind' already registered" }
    }

    fun invoke(name: String, method: String, payload: ByteArray, completion: (Result<ByteArray>) -> Unit) {
        val module = modules[name]
        if (module == null) {
            completion(Result.failure(IllegalStateException("Platform module '$name' is not installed")))
            return
        }
        module.invoke(method, payload, completion)
    }

    fun createView(kind: String, context: RayactPlatformViewContext): RayactPlatformViewController? =
        viewFactories[kind]?.create(context)

    fun hasModule(name: String): Boolean = modules.containsKey(name)
    fun hasViewFactory(kind: String): Boolean = viewFactories.containsKey(kind)

    fun emitActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        val payload = JSONObject()
            .put("requestCode", requestCode)
            .put("resultCode", resultCode)
            .put("uri", data?.dataString ?: JSONObject.NULL)
            .toString()
            .toByteArray(Charsets.UTF_8)
        modules.values.forEach { module ->
            module.invoke("__activityResult", payload) { }
        }
    }

    companion object {
        val shared = RayactPlatformRegistry()
        private val initialized = AtomicBoolean(false)
        @Volatile private var foregroundActivity = WeakReference<Activity>(null)
        private const val CALL_TIMEOUT_SECONDS = 15L

        fun initialize(context: Context) {
            if (context is Activity) attachActivity(context)
            if (!initialized.compareAndSet(false, true)) return
            registerRayactNativeTextInput(shared)
            runCatching {
                val generated = Class.forName("com.rayact.generated.RayactGeneratedModules")
                generated.getMethod(
                    "register",
                    Context::class.java,
                    RayactPlatformRegistry::class.java,
                ).invoke(null, context.applicationContext, shared)
            }.onFailure {
                initialized.set(false)
                if (it !is ClassNotFoundException) throw it
            }
        }

        fun attachActivity(activity: Activity) {
            foregroundActivity = WeakReference(activity)
        }

        fun currentActivity(): Activity? =
            foregroundActivity.get()?.takeUnless { it.isFinishing || it.isDestroyed }

        @JvmStatic
        fun platformCallFromNative(name: String, method: String, payloadJson: String?): String {
            val latch = CountDownLatch(1)
            var response = "{\"ok\":false,\"error\":\"Platform module call did not complete\"}"
            shared.invoke(name, method, (payloadJson ?: "null").toByteArray(Charsets.UTF_8)) { result ->
                response = result.fold(
                    onSuccess = {
                        val json = it.toString(Charsets.UTF_8).ifBlank { "null" }
                        "{\"ok\":true,\"value\":$json}"
                    },
                    onFailure = {
                        "{\"ok\":false,\"error\":${JSONObject.quote(it.message ?: "Platform module call failed")}}"
                    },
                )
                latch.countDown()
            }
            if (!latch.await(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                return "{\"ok\":false,\"error\":\"Platform module call timed out\"}"
            }
            return response
        }
    }
}
