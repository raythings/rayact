package com.rayact.engine

import android.content.Context
import android.view.View
import java.util.concurrent.ConcurrentHashMap

fun interface RayactPlatformModule {
    fun invoke(method: String, payload: ByteArray, completion: (Result<ByteArray>) -> Unit)
}

fun interface RayactPlatformViewFactory {
    fun create(context: Context, nodeId: Int, props: Map<String, Any?>): View
}

interface RayactPlatformModuleRegistration {
    fun register(context: Context, registry: RayactPlatformRegistry)
}

/**
 * Application-owned registry populated by generated autolinking code.
 * The engine package contains no optional module or platform-view implementation.
 */
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

    fun createView(kind: String, context: Context, nodeId: Int, props: Map<String, Any?>): View? =
        viewFactories[kind]?.create(context, nodeId, props)

    fun hasModule(name: String): Boolean = modules.containsKey(name)
    fun hasViewFactory(kind: String): Boolean = viewFactories.containsKey(kind)
}
