// @rayact/clipboard — browser implementation.
//
// The web peer of the Android (ClipboardManager) and iOS (UIPasteboard)
// registrations, backed by the async Clipboard API with a synchronous mirror.
//
// The bridge is synchronous — the caller reads the result on the same tick — but
// navigator.clipboard.readText() is a promise (and gated behind a permission
// prompt). So reads answer from a mirror that is refreshed opportunistically:
// every write updates it, and every read kicks off a background refresh for the
// next call. That makes "copy in the app, paste in the app" exact, which is the
// overwhelmingly common case, and makes "copy elsewhere, paste here" arrive one
// call late rather than never.
(function () {
  'use strict';

  var mirror = '';

  function refresh() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    try {
      navigator.clipboard.readText().then(function (text) {
        mirror = typeof text === 'string' ? text : '';
      })['catch'](function () { /* permission denied or not focused */ });
    } catch (e) { /* older browsers */ }
  }

  function handle(method, payload) {
    switch (method) {
      case 'getString':
        refresh();          // for the next call
        return mirror;

      case 'setString':
        var text = payload && payload.text != null ? String(payload.text) : '';
        mirror = text;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try { navigator.clipboard.writeText(text)['catch'](function () {}); }
          catch (e) {}
        }
        return null;

      case 'hasString':
        refresh();
        return mirror.length > 0;

      default:
        return { ok: false, error: 'Unknown clipboard method: ' + method };
    }
  }

  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerModule('clipboard', handle);
  });
})();
