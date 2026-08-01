// @rayact/linking — browser implementation.
//
// The web peer of the Android (Intent.ACTION_VIEW) and iOS (UIApplication.open)
// registrations, backed by window.open / location.
//
// Without this, linking is broken on web rather than merely unimplemented: the
// engine always defines platformCall, so src/index.ts takes that branch and gets
// "platform modules are unavailable" — its own window.open fallback is only
// reachable in a plain-browser JS runtime, not inside QuickJS.
(function () {
  'use strict';

  // Schemes a browser can actually act on. Anything else (custom app schemes)
  // would silently open a blank tab, so it is reported as unopenable — same
  // answer the mobile hosts give when no app claims the scheme.
  var OPENABLE = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];

  function parse(url) {
    try { return new URL(url); } catch (e) { return null; }
  }

  function canOpen(url) {
    var parsed = parse(url);
    return !!parsed && OPENABLE.indexOf(parsed.protocol) >= 0;
  }

  function handle(method, payload) {
    var url = payload && payload.url;
    switch (method) {
      case 'canOpenURL':
        return canOpen(url);

      case 'openURL':
        if (!canOpen(url)) {
          return { ok: false, error: 'No application can open URL: ' + url };
        }
        // noopener/noreferrer: the opened page must not reach back into the app
        // through window.opener.
        var opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          // Popup blockers reject window.open outside a user gesture. Say so
          // plainly — the caller can retry from a click handler.
          return { ok: false, error: 'Opening URL was blocked by the browser: ' + url };
        }
        return true;

      case 'getInitialURL':
        // The page URL the app was loaded with is the web analogue of a deep
        // link, minus the ?dev= parameter the launcher adds.
        return window.location.href || null;

      default:
        return { ok: false, error: 'Unknown linking method: ' + method };
    }
  }

  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerModule('linking', handle);
  });
})();
