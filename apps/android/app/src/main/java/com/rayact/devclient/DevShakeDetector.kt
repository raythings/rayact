package com.rayact.devclient

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.rayact.engine.RayactEngine
import kotlin.math.sqrt

class DevShakeDetector(context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private var lastShakeAt = 0L
    private var lastX = 0f
    private var lastY = 0f
    private var lastZ = 0f
    private var initialized = false

    fun start() {
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        if (!initialized) {
            lastX = x; lastY = y; lastZ = z
            initialized = true
            return
        }
        val dx = x - lastX
        val dy = y - lastY
        val dz = z - lastZ
        lastX = x; lastY = y; lastZ = z
        val gForce = sqrt(dx * dx + dy * dy + dz * dz) / SensorManager.GRAVITY_EARTH
        if (gForce < 2.2f) return
        val now = System.currentTimeMillis()
        if (now - lastShakeAt < 800) return
        lastShakeAt = now
        RayactEngine.nativeToggleDevMenu()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
