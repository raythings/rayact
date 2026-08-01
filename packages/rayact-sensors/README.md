# @rayact/sensors

Optional accelerometer, gyroscope, fused device-rotation, and shake-event
support for Rayact. Native sensor code is linked only when the application
depends on this package.

`addRotationListener` reports stable `roll`, `pitch`, and `yaw` angles in
radians. It uses Core Motion device attitude on iOS and the rotation-vector
sensor on Android, avoiding the drift that comes from integrating raw
gyroscope rates in JavaScript.
