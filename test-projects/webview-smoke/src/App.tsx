import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Button, render } from 'rayact/react';
import { Platform } from 'rayact/shared';
import { WebView, type WebViewHandle } from '@rayact/webview';

const INLINE_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;font:16px -apple-system,Roboto,sans-serif;
    background:linear-gradient(160deg,#0d47a1,#4a148c);color:#fff;
    display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center}
  button{font-size:18px;padding:12px 20px;border:0;border-radius:10px;background:#fff;color:#0d47a1}
  #echo{opacity:.85;font-size:14px;min-height:20px}
</style></head><body>
  <div id="title">HTML source OK</div>
  <button id="ping">postMessage to native</button>
  <div id="echo">waiting for native message…</div>
<script>
  var n = 0;
  function toNative(msg) {
    if (window.RayactWebView && window.RayactWebView.postMessage) window.RayactWebView.postMessage(msg);
    else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.RayactWebView)
      window.webkit.messageHandlers.RayactWebView.postMessage(msg);
  }
  document.getElementById('ping').onclick = function () { n++; toNative('ping #' + n); };
  window.addEventListener('message', function (e) {
    document.getElementById('echo').textContent = 'native → web: ' + e.data;
  });
</script></body></html>`;

const REMOTE_URL = 'https://example.com';

function App() {
  const ref = useRef<WebViewHandle>(null);
  const [remote, setRemote] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [posts, setPosts] = useState(0);

  const push = useCallback((line: string) => {
    setLog(prev => [line, ...prev].slice(0, 5));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 0x101014ff, paddingTop: 56, padding: 12, gap: 10 }}>
      <Text style={{ text: { color: 0xffffffff, fontSize: 20 } }}>
        {`@rayact/webview smoke · ${Platform.OS}`}
      </Text>

      {/* Magenta backing plate: if the platform view never composites, this shows through. */}
      <View style={{ flex: 1, backgroundColor: 0xff00ffff, borderRadius: 8, overflow: 'hidden' }}>
        <WebView
          ref={ref}
          style={{ flex: 1 }}
          source={remote ? { uri: REMOTE_URL } : { html: INLINE_HTML }}
          injectedJavaScript="document.getElementById('title') && (document.getElementById('title').textContent += ' + injected');"
          onLoadStart={e => push(`loadStart ${e.nativeEvent.url.slice(0, 40)}`)}
          onLoadEnd={e => push(`loadEnd ${e.nativeEvent.url.slice(0, 40)}`)}
          onError={e => push(`error ${e.nativeEvent.description}`)}
          onMessage={e => push(`message "${e.nativeEvent.data}"`)}
          onNavigationStateChange={s => push(`nav back=${s.canGoBack} fwd=${s.canGoForward}`)}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button label={remote ? 'Load HTML' : 'Load URL'} onPress={() => setRemote(r => !r)} />
        <Button label="Reload" onPress={() => ref.current?.reload()} />
        <Button
          label="Post"
          onPress={() => {
            const n = posts + 1;
            setPosts(n);
            ref.current?.postMessage(`hello ${n}`);
          }}
        />
        <Button
          label="Inject"
          onPress={() => ref.current?.injectJavaScript("document.body.style.filter='invert(1)';")}
        />
        <Button label="Back" onPress={() => ref.current?.goBack()} />
      </View>

      <View style={{ minHeight: 110, gap: 2 }}>
        <Text style={{ text: { color: 0x8bc34aff, fontSize: 13 } }}>
          {log.length ? 'events (newest first):' : 'no events yet — platform view may be missing'}
        </Text>
        {log.map((line, i) => (
          <Text key={`${i}-${line}`} style={{ text: { color: 0xbbbbbbff, fontSize: 12 } }}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(480, 900, 'webview-smoke');
}

render(<App />);
