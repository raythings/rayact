// @rayact/webview — browser platform view.
//
// Registers the "webview" kind with the web host's platform-view registry, the
// browser peer of this package's android/ Kotlin, ios/ Swift and desktop/ ObjC++
// registrations. The host owns positioning, clipping, hit-testing and overlay
// compositing; everything below owns the <iframe>.
//
// Plain ES5, no build step, no imports: this file is copied verbatim next to the
// app and loaded with a <script> tag.
//
// It must not touch `Module` directly — it may run before or after the wasm host
// initializes. Instead it pushes a registration callback the host drains (and
// the host replays any views created before this script arrived).
(function () {
  'use strict';

  // Injected into every srcdoc document so a page can talk to native the same way
  // it does on Android (window.RayactWebView.postMessage) and iOS
  // (window.webkit.messageHandlers.RayactWebView.postMessage). The frame is
  // sandboxed WITHOUT allow-same-origin, so the host cannot reach into
  // contentWindow to eval — everything goes over postMessage instead, including
  // injectJavaScript(), which arrives as an eval command.
  //
  // Host commands travel over a private MessageChannel, not window postMessage:
  // the page has its own `message` listener (that is the documented way native
  // pushes data to it), so command objects sent on the same channel would surface
  // in the app as stray messages.
  var SHIM = [
    '<script>(function(){',
    'function send(type,data){try{parent.postMessage({__rayactWebView:type,data:String(data)},"*");}catch(e){}}',
    'var api={postMessage:function(m){send("message",m);}};',
    'window.RayactWebView=api;',
    'window.webkit=window.webkit||{};',
    'window.webkit.messageHandlers=window.webkit.messageHandlers||{};',
    'window.webkit.messageHandlers.RayactWebView=api;',
    'try{',
    'var ch=new MessageChannel();',
    'ch.port1.onmessage=function(e){',
    'var d=e.data||{};',
    'if(d.cmd==="eval"){try{(0,eval)(d.code);}catch(err){send("error",err);}}',
    'else if(d.cmd==="history"){try{history[d.dir]();}catch(err){}}',
    '};',
    'parent.postMessage({__rayactWebView:"__port"},"*",[ch.port2]);',
    '}catch(e){}',
    '})();<\/script>'
  ].join('');

  // Live controllers, so the single window 'message' listener below can map an
  // event's source frame back to the view that owns it.
  var controllers = [];

  function findByFrame(source) {
    for (var i = 0; i < controllers.length; i++) {
      if (controllers[i].el.contentWindow === source) return controllers[i];
    }
    return null;
  }

  // A page reaches native through the shim, which posts to the host window.
  window.addEventListener('message', function (event) {
    var payload = event.data;
    if (!payload || typeof payload !== 'object' || !payload.__rayactWebView) return;
    var controller = findByFrame(event.source);
    if (!controller) return;
    if (payload.__rayactWebView === '__port') {
      // Private command channel handshake — never surfaced to the app.
      controller.port = event.ports && event.ports[0];
      return;
    }
    controller.emit({ type: payload.__rayactWebView, data: payload.data });
  });

  function createController(context) {
    var frame = document.createElement('iframe');
    // Remote content is untrusted: keep it sandboxed and never let it reach back
    // into the host page. allow-same-origin is deliberately absent, which is why
    // the bridge is postMessage-based.
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    // The package owns this element's chrome, so it resets it here rather than
    // relying on host CSS. An iframe's UA default is a 2px inset border, which
    // reads as an outline drawn around the view inside the rayact scene; the
    // page's own background is what should show. Transparent background lets
    // raym3 content show through wherever the page does not paint.
    frame.style.border = '0';
    frame.style.margin = '0';
    frame.style.padding = '0';
    frame.style.background = 'transparent';
    frame.style.boxSizing = 'border-box';
    // Chrome paints a focus ring on the frame when a click inside it moves focus;
    // like the base canvas, this element is app surface, not a control.
    frame.style.outline = 'none';

    var controller = {
      el: frame,
      nodeId: context.nodeId,
      emit: context.emit,
      port: null,
      sourceHtml: '',
      sourceUri: '',
      injectedJavaScript: '',
      injectedJavaScriptBeforeContentLoaded: '',
      lastCommand: ''
    };

    frame.addEventListener('load', function () {
      var url = controller.sourceUri || 'about:srcdoc';
      // A remote document cannot carry the baked-in scripts, so it gets the
      // after-load injection over the command port instead.
      if (controller.sourceUri && controller.injectedJavaScript) {
        sendCommand(controller, { cmd: 'eval', code: controller.injectedJavaScript });
      }
      controller.emit({ type: 'loadEnd', data: url });
      controller.emit({
        type: 'navigationStateChange',
        data: JSON.stringify({ url: url, canGoBack: false, canGoForward: false })
      });
    });

    controllers.push(controller);
    controller.applyProps = function (props) { applyProps(controller, props); };
    controller.dispose = function () {
      var index = controllers.indexOf(controller);
      if (index >= 0) controllers.splice(index, 1);
      controller.port = null;
    };
    applyProps(controller, context.props || {});
    return controller;
  }

  function sendCommand(controller, message) {
    if (!controller.port) return false;
    controller.port.postMessage(message);
    return true;
  }

  // Compose the document a srcdoc webview actually loads: the bridge shim and the
  // document-start script run before page content, and the after-load script is
  // appended so it runs once the document is parsed (matching Android's
  // evaluateJavascript-on-page-finished) without needing a round trip.
  function buildSrcdoc(controller) {
    return SHIM +
      (controller.injectedJavaScriptBeforeContentLoaded
        ? '<script>' + controller.injectedJavaScriptBeforeContentLoaded + '<\/script>'
        : '') +
      (controller.sourceHtml || '') +
      (controller.injectedJavaScript
        ? '<script>' + controller.injectedJavaScript + '<\/script>'
        : '');
  }

  function loadSource(controller) {
    var el = controller.el;
    if (controller.sourceHtml) {
      el.removeAttribute('src');
      controller.emit({ type: 'loadStart', data: 'about:srcdoc' });
      controller.port = null;
      el.srcdoc = buildSrcdoc(controller);
    } else if (controller.sourceUri) {
      el.removeAttribute('srcdoc');
      controller.emit({ type: 'loadStart', data: controller.sourceUri });
      // A remote document never runs the shim, so it has no command port.
      controller.port = null;
      el.src = controller.sourceUri;
    }
  }

  // Mirrors runCommand in the Android controller and the desktop plugin: the
  // WebView handle's imperative methods arrive as a one-shot `command` prop with a
  // #N suffix so repeating the same action still reads as a new value.
  function runCommand(controller, raw) {
    var value = String(raw).replace(/#\d+$/, '');
    if (value === 'reload') {
      loadSource(controller);
    } else if (value === 'goBack' || value === 'goForward') {
      // Cross-origin history is not reachable from the host, so the shim performs
      // it inside the frame.
      sendCommand(controller, {
        cmd: 'history', dir: value === 'goBack' ? 'back' : 'forward'
      });
    } else if (value === 'stopLoading') {
      // No cross-origin equivalent of WebView.stopLoading(); the browser owns
      // iframe loading. Reported so callers are not misled.
      controller.emit({ type: 'error', data: 'stopLoading is not supported on web' });
    } else if (value.indexOf('inject:') === 0) {
      sendCommand(controller, { cmd: 'eval', code: value.slice('inject:'.length) });
    } else if (value.indexOf('post:') === 0) {
      // Android dispatches a MessageEvent carrying the string; a plain postMessage
      // into the frame produces exactly that.
      if (controller.el.contentWindow) {
        controller.el.contentWindow.postMessage(value.slice('post:'.length), '*');
      }
    }
  }

  function applyProps(controller, props) {
    if (!props) return;
    // Undefined arrives as an explicit null tombstone (the bridge's patch
    // encoding), so switching between uri and html clears the other.
    var sourceChanged = false;
    if ('sourceHtml' in props) {
      var html = props.sourceHtml || '';
      if (html !== controller.sourceHtml) { controller.sourceHtml = html; sourceChanged = true; }
    }
    if ('sourceUri' in props) {
      var uri = props.sourceUri || '';
      if (uri !== controller.sourceUri) { controller.sourceUri = uri; sourceChanged = true; }
    }
    if ('injectedJavaScript' in props) {
      controller.injectedJavaScript = props.injectedJavaScript || '';
    }
    if ('injectedJavaScriptBeforeContentLoaded' in props) {
      var before = props.injectedJavaScriptBeforeContentLoaded || '';
      // The document-start script is baked into srcdoc, so changing it has to
      // reload the document to take effect.
      if (before !== controller.injectedJavaScriptBeforeContentLoaded) {
        controller.injectedJavaScriptBeforeContentLoaded = before;
        sourceChanged = true;
      }
    }
    if (sourceChanged) loadSource(controller);
    // Commands are one-shot and carry a #N suffix so repeating the same action
    // still reads as a new value.
    if (props.command && props.command !== controller.lastCommand) {
      controller.lastCommand = props.command;
      runCommand(controller, props.command);
    }
  }

  // Registration handshake: the host drains this queue when it initializes, and
  // converts later pushes into immediate registrations. Never references Module,
  // so load order relative to the wasm host does not matter.
  window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
  window.__rayactModuleRegistrations.push(function (registry) {
    registry.registerViewFactory('webview', createController);
  });
})();
