// @rayact/sensors — browser implementation.
//
// The web peer of android/RayactSensorsRegistration.kt (SensorManager) and
// ios/RayactSensorsRegistration.swift (CoreMotion), backed by DeviceMotionEvent
// and DeviceOrientationEvent.
//
// Same contract as the mobile hosts, because src/index.ts talks to all three the
// same way: isAvailable / startObserving / stopObserving / drainEvents, answered
// synchronously. Events are buffered here and collected by the caller's poll
// loop rather than pushed, which is what keeps the bridge synchronous.
//
// Plain ES5, no build step. Never touches `Module`: registration goes through the
// queue the host drains, so load order does not matter.
(function () {
  'use strict';

  var MAX_BUFFERED = 256;   // a stalled poll loop must not grow without bound
  var buffer = [];
  var observing = {};       // type -> true
  var listening = false;

  // Shake detection mirrors the mobile hosts: magnitude spike above 1g with a
  // refractory period, so a single shake is one event rather than a burst.
  var SHAKE_THRESHOLD = 15;      // m/s^2, ~1.5g including gravity
  var SHAKE_COOLDOWN_MS = 700;
  var lastShakeAt = 0;

  function push(event) {
    if (buffer.length >= MAX_BUFFERED) buffer.shift();
    buffer.push(event);
  }

  function onMotion(event) {
    var now = Date.now();
    if (observing.accelerometer) {
      // accelerationIncludingGravity matches what SensorManager's
      // TYPE_ACCELEROMETER and CoreMotion's raw accelerometer report.
      var a = event.accelerationIncludingGravity || event.acceleration;
      if (a && a.x !== null && a.x !== undefined) {
        push({ type: 'accelerometer', x: a.x || 0, y: a.y || 0, z: a.z || 0, timestamp: now });
      }
    }
    if (observing.gyroscope && event.rotationRate) {
      var r = event.rotationRate;
      // Browsers report deg/s; the mobile hosts report rad/s.
      var toRadians = Math.PI / 180;
      push({
        type: 'gyroscope',
        x: (r.beta || 0) * toRadians,
        y: (r.gamma || 0) * toRadians,
        z: (r.alpha || 0) * toRadians,
        timestamp: now
      });
    }
    if (observing.shake) {
      var g = event.accelerationIncludingGravity;
      if (g) {
        var magnitude = Math.sqrt((g.x || 0) * (g.x || 0) +
                                  (g.y || 0) * (g.y || 0) +
                                  (g.z || 0) * (g.z || 0));
        if (magnitude > SHAKE_THRESHOLD && now - lastShakeAt > SHAKE_COOLDOWN_MS) {
          lastShakeAt = now;
          push({ type: 'shake', timestamp: now });
        }
      }
    }
  }

  // First beta reading after rotation observation starts, in radians. Pitch is
  // reported relative to it — see the comment in onOrientation.
  var pitchBaseline = null;

  function onOrientation(event) {
    if (!observing.rotation) return;
    // DeviceOrientationEvent reports degrees; the mobile hosts report radians
    // (Android's SensorManager.getOrientation(), iOS CMAttitude), and callers
    // like GlassTiltContext divide by a radian threshold (~0.785 = 45deg). Left
    // unconverted this was ~57x too large — "too aggressive" was degrees being
    // read as radians.
    var toRadians = Math.PI / 180;
    var beta = (event.beta || 0) * toRadians;
    // Pitch is baselined to the pose the device was in when observation started,
    // and roll/yaw are not. beta is measured from FLAT ON THE TABLE, so a phone
    // held upright in the hand rests at ~1.2-1.6 rad — already past the ~0.785
    // full-tilt threshold effects divide by, which left vertical response
    // saturated and near-motionless while horizontal (gamma, resting at 0) got
    // its full range. Tilt effects want "how far from the resting pose", and on
    // web the resting pose is wherever the hand holds the phone. gamma already
    // rests at ~0 in any normal grip, so it needs no baseline.
    if (pitchBaseline === null) pitchBaseline = beta;
    push({
      type: 'rotation',
      roll: (event.gamma || 0) * toRadians,
      pitch: beta - pitchBaseline,
      yaw: (event.alpha || 0) * toRadians,
      timestamp: Date.now()
    });
  }

  function anyObserving() {
    for (var key in observing) { if (observing[key]) return true; }
    return false;
  }

  function syncListeners() {
    var wanted = anyObserving();
    if (wanted && !listening) {
      window.addEventListener('devicemotion', onMotion);
      window.addEventListener('deviceorientation', onOrientation);
      listening = true;
    } else if (!wanted && listening) {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      listening = false;
      buffer.length = 0;
    }
  }

  function isAvailable(type) {
    if (type === 'rotation') return typeof window.DeviceOrientationEvent !== 'undefined';
    // accelerometer, gyroscope and shake all ride on DeviceMotionEvent.
    return typeof window.DeviceMotionEvent !== 'undefined';
  }

  function handle(method, payload) {
    var type = payload && payload.type;
    switch (method) {
      case 'isAvailable':
        return isAvailable(type);

      case 'startObserving':
        if (!isAvailable(type)) {
          return { ok: false, error: 'Sensor is unavailable in this browser: ' + type };
        }
        // iOS Safari (13+) requires a user gesture to grant motion access. The
        // request is async and cannot be awaited here, so it is kicked off and
        // events simply start arriving once the user allows it — the poll loop
        // needs no change either way.
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
          try { DeviceMotionEvent.requestPermission()['catch'](function () {}); } catch (e) {}
        }
        // Recalibrate the pitch baseline per observation session: the user may
        // be holding the device differently than last time.
        if (type === 'rotation') pitchBaseline = null;
        observing[type] = true;
        syncListeners();
        return true;

      case 'stopObserving':
        if (type === 'rotation') pitchBaseline = null;
        delete observing[type];
        syncListeners();
        return true;

      case 'drainEvents':
        var events = buffer;
        buffer = [];
        return events;

      default:
        return { ok: false, error: 'Unknown sensors method: ' + method };
    }
  }

  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerModule('sensors', handle);
  });
})();
