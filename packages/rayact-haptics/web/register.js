// @rayact/haptics — browser implementation.
//
// The web peer of the Android (Vibrator/HapticFeedbackConstants) and iOS
// (UIFeedbackGenerator) registrations, backed by the Vibration API.
//
// Browsers expose only "vibrate for N ms", so the semantic feedback types are
// mapped to short patterns. Desktop browsers and iOS Safari have no Vibration
// API at all: those calls succeed and do nothing, matching how the mobile hosts
// behave on a device with haptics disabled — feedback is an enhancement, and
// failing the call would make callers handle an error that is not actionable.
(function () {
  'use strict';

  // Durations in ms; arrays are vibrate/pause/vibrate patterns.
  var IMPACT = { light: 10, medium: 20, heavy: 30, soft: 15, rigid: 25 };
  var NOTIFICATION = { success: [15, 60, 15], warning: [25, 60, 25], error: [35, 60, 35, 60, 35] };
  var SELECTION = 8;

  function vibrate(pattern) {
    if (!navigator.vibrate) return true;   // unsupported: succeed silently
    try { navigator.vibrate(pattern); } catch (e) { /* user-gesture gated */ }
    return true;
  }

  function handle(method, payload) {
    switch (method) {
      case 'selection':
        return vibrate(SELECTION);
      case 'impact':
        return vibrate(IMPACT[(payload && payload.style) || 'medium'] || IMPACT.medium);
      case 'notification':
        return vibrate(NOTIFICATION[(payload && payload.type) || 'success'] || NOTIFICATION.success);
      default:
        return { ok: false, error: 'Unknown haptics method: ' + method };
    }
  }

  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerModule('haptics', handle);
  });
})();
