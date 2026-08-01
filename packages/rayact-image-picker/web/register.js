// @rayact/image-picker — browser implementation.
//
// The web peer of the Android (MediaStore.ACTION_PICK_IMAGES) and iOS
// (PHPickerViewController) registrations, backed by <input type="file">.
//
// The bridge is synchronous but picking is not, so this follows the same
// start/poll contract the mobile hosts use: `startPicker` opens the file dialog
// and returns immediately, then `pollPicker` reports pending / success /
// canceled until the user is done. src/index.ts already drives that loop.
(function () {
  'use strict';

  var state = { status: 'idle', assets: null, error: null };
  var input = null;

  function reset() {
    if (input && input.parentNode) input.parentNode.removeChild(input);
    input = null;
  }

  function readDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(reader.error || new Error('Unable to read image')); };
      reader.onload = function () { resolve(String(reader.result)); };
      reader.readAsDataURL(file);
    });
  }

  function dimensions(uri) {
    return new Promise(function (resolve) {
      var image = new Image();
      // A file the browser cannot decode still deserves an asset entry; report
      // zero dimensions rather than failing the whole pick.
      image.onload = function () { resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = function () { resolve({ width: 0, height: 0 }); };
      image.src = uri;
    });
  }

  function toAsset(file, wantsBase64) {
    return readDataURL(file).then(function (uri) {
      return dimensions(uri).then(function (size) {
        return {
          uri: uri,
          mimeType: file.type || undefined,
          width: size.width,
          height: size.height,
          fileName: file.name || null,
          // The data URL already carries the bytes; only split them out when
          // asked, since base64 of a large image is expensive to keep twice.
          base64: wantsBase64 ? String(uri).split(',')[1] || null : null
        };
      });
    });
  }

  function startPicker(options) {
    reset();
    state = { status: 'pending', assets: null, error: null };

    var wantsBase64 = !!(options && options.base64);
    var multiple = !!(options && (options.allowsMultipleSelection || options.allowsMultiple));
    var mediaTypes = (options && options.mediaTypes) || 'images';
    var types = [].concat(mediaTypes).map(String);

    input = document.createElement('input');
    input.type = 'file';
    input.accept = types.indexOf('videos') >= 0
      ? (types.indexOf('images') >= 0 ? 'image/*,video/*' : 'video/*')
      : 'image/*';
    if (multiple) input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-10000px';       // offscreen, not display:none — Safari
    document.body.appendChild(input);    // ignores clicks on detached inputs

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) { state = { status: 'canceled', assets: null, error: null }; reset(); return; }
      Promise.all(files.map(function (file) { return toAsset(file, wantsBase64); }))
        .then(function (assets) { state = { status: 'success', assets: assets, error: null }; })
        ['catch'](function (error) {
          state = { status: 'error', assets: null, error: String(error && error.message || error) };
        })
        .then(reset);
    });

    // There is no reliable "dialog dismissed" event. The `cancel` event is
    // supported in current browsers; where it is not, the picker simply stays
    // pending until the user picks — the same as an unanswered native dialog.
    input.addEventListener('cancel', function () {
      state = { status: 'canceled', assets: null, error: null };
      reset();
    });

    // Browsers only honour .click() inside a user gesture. The engine dispatches
    // the press that led here on the same task, so this normally qualifies.
    input.click();
    return true;
  }

  function handle(method, payload) {
    switch (method) {
      case 'requestPermission':
        // The file dialog is the permission prompt; there is nothing to request.
        return { granted: true, canAskAgain: true, status: 'granted' };

      case 'startPicker':
        return startPicker(payload || {});

      case 'pollPicker':
        return state;

      default:
        return { ok: false, error: 'Unknown image-picker method: ' + method };
    }
  }

  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerModule('image-picker', handle);
  });
})();
