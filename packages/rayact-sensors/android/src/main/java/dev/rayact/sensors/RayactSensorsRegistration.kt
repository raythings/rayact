package dev.rayact.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque
import kotlin.math.sqrt

class RayactSensorsRegistration : RayactPlatformModuleRegistration {
    override fun register(context: Context, registry: RayactPlatformRegistry) {
        val module = SensorsModule(context.applicationContext)
        registry.registerModule("sensors") { method, payload, completion ->
            runCatching { module.invoke(method, payload.toString(Charsets.UTF_8)) }
                .fold(
                    onSuccess = { completion(Result.success(it.toByteArray(Charsets.UTF_8))) },
                    onFailure = { completion(Result.failure(it)) },
                )
        }
    }
}

private class SensorsModule(context: Context) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val active = mutableSetOf<String>()
    private val events = ArrayDeque<JSONObject>()
    private var lastShakeAt = 0L
    private var previousAcceleration: FloatArray? = null

    fun invoke(method: String, payloadJson: String): String {
        val payload = runCatching { JSONObject(payloadJson) }.getOrElse { JSONObject() }
        return when (method) {
            "isAvailable" -> hasSensor(payload.optString("type")).toString()
            "startObserving" -> {
                val type = payload.optString("type")
                require(type == "accelerometer" || type == "gyroscope" || type == "shake") {
                    "Unsupported sensor type '$type'"
                }
                synchronized(active) { active += type }
                refreshRegistrations(payload.optInt("intervalMs", 50))
                "true"
            }
            "stopObserving" -> {
                synchronized(active) { active -= payload.optString("type") }
                refreshRegistrations(50)
                "true"
            }
            "drainEvents" -> drainEvents().toString()
            else -> error("Unknown sensors method '$method'")
        }
    }

    private fun hasSensor(type: String): Boolean = when (type) {
        "accelerometer", "shake" -> manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null
        "gyroscope" -> manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null
        else -> false
    }

    private fun refreshRegistrations(intervalMs: Int) {
        val snapshot = synchronized(active) { active.toSet() }
        val delayUs = intervalMs.coerceIn(16, 1000) * 1000
        mainHandler.post {
            manager.unregisterListener(this)
            if ("accelerometer" in snapshot || "shake" in snapshot) {
                manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
                    manager.registerListener(this, it, delayUs, mainHandler)
                }
            }
            if ("gyroscope" in snapshot) {
                manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let {
                    manager.registerListener(this, it, delayUs, mainHandler)
                }
            }
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        val timestamp = System.currentTimeMillis()
        val snapshot = synchronized(active) { active.toSet() }
        val type = when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> "accelerometer"
            Sensor.TYPE_GYROSCOPE -> "gyroscope"
            else -> return
        }
        if (type in snapshot) enqueue(JSONObject()
            .put("type", type)
            .put("x", event.values[0])
            .put("y", event.values[1])
            .put("z", event.values[2])
            .put("timestamp", timestamp))

        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER && "shake" in snapshot) {
            val previous = previousAcceleration
            previousAcceleration = floatArrayOf(event.values[0], event.values[1], event.values[2])
            if (previous != null) {
                val dx = event.values[0] - previous[0]
                val dy = event.values[1] - previous[1]
                val dz = event.values[2] - previous[2]
                val force = sqrt(dx * dx + dy * dy + dz * dz) / SensorManager.GRAVITY_EARTH
                if (force >= 2.2f && timestamp - lastShakeAt >= 800) {
                    lastShakeAt = timestamp
                    enqueue(JSONObject().put("type", "shake").put("timestamp", timestamp))
                }
            }
        }
    }

    private fun enqueue(event: JSONObject) = synchronized(events) {
        if (events.size >= 256) events.removeFirst()
        events.addLast(event)
    }

    private fun drainEvents(): JSONArray = synchronized(events) {
        JSONArray().also { output ->
            while (events.isNotEmpty()) output.put(events.removeFirst())
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
