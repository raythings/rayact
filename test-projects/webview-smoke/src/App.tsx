import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Button, TextInput, render } from 'rayact/react';
import { Platform } from 'rayact/shared';
import { WebView, type WebViewHandle } from '@rayact/webview';
import './styles.css';

const INLINE_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;font:16px -apple-system,Roboto,sans-serif;
    background:transparent;color:#fff;
    display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center}
  #card{display:flex;flex-direction:column;gap:14px;align-items:center;
    padding:22px;border:1px solid rgba(255,255,255,.45);border-radius:16px;
    background:rgba(13,71,161,.72);box-shadow:0 8px 28px rgba(0,0,0,.28)}
  button{font-size:18px;padding:12px 20px;border:0;border-radius:10px;background:#fff;color:#0d47a1}
  #echo{opacity:.85;font-size:14px;min-height:20px}
</style></head><body><div id="card">
  <div id="before">document-start script: missing</div>
  <div id="title">HTML source OK</div>
  <button id="ping">postMessage to native</button>
  <div id="echo">waiting for native message…</div>
</div>
<script>
  // The button reports every input stage inside the page itself, so a dead
  // bridge and a dead click are distinguishable at a glance:
  //   label "clicked N"   -> the click reached the page
  //   echo  "sent via …"  -> the bridge call did not throw
  //   echo  "bridge: …"   -> which handler object the page found
  //   red card + message  -> the bridge call threw
  var n = 0;
  var ping = document.getElementById('ping');
  var echo = document.getElementById('echo');
  function bridgeName() {
    if (window.RayactWebView && window.RayactWebView.postMessage) return 'RayactWebView';
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.RayactWebView)
      return 'webkit.messageHandlers';
    return 'none';
  }
  function toNative(msg) {
    var via = bridgeName();
    try {
      if (via === 'RayactWebView') window.RayactWebView.postMessage(msg);
      else if (via === 'webkit.messageHandlers')
        window.webkit.messageHandlers.RayactWebView.postMessage(msg);
      echo.textContent = 'sent via ' + via + ': ' + msg;
    } catch (err) {
      document.getElementById('card').style.background = 'rgba(120,20,20,.85)';
      echo.textContent = 'bridge threw: ' + err;
    }
  }
  ping.addEventListener('mousedown', function () { ping.style.background = '#ffd54f'; });
  ping.addEventListener('mouseup', function () { ping.style.background = '#fff'; });
  ping.onclick = function () {
    n++;
    ping.textContent = 'clicked ' + n + ' (bridge: ' + bridgeName() + ')';
    toNative('ping #' + n);
  };
  window.addEventListener('message', function (e) {
    echo.textContent = 'native → web: ' + e.data;
  });
  window.addEventListener('error', function (e) {
    echo.textContent = 'page error: ' + e.message;
  });
</script></body></html>`;

const REMOTE_URL = 'https://example.com';
const BUTTON_STYLE = {
  backgroundColor: 0x6750a4ff,
  text: { color: 0xffffffff },
};

function App() {
  const ref = useRef<WebViewHandle>(null);
  const [remote, setRemote] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [posts, setPosts] = useState(0);
  const [overlayPresses, setOverlayPresses] = useState(0);
  const [nativeText, setNativeText] = useState('');
  const [textVariant, setTextVariant] =
    useState<'filled' | 'outlined' | 'underline' | 'plain'>('outlined');

  const push = useCallback((line: string) => {
    setLog(prev => [line, ...prev].slice(0, 5));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 0x101014ff, paddingTop: 56, padding: 12, gap: 10 }}>
      <Text style={{ text: { color: 0xffffffff, fontSize: 20 } }}>
        {`@rayact/webview smoke · ${Platform.OS}`}
      </Text>

      <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}>
        {/* Ordinary Rayact content below the real native WebView. */}
        <View style={{
          position: 'absolute', top: 24, left: 24, width: 156, height: 156,
          backgroundColor: 0x2a9d8fff, borderRadius: 24,
        }} />
        <View style={{
          position: 'absolute', bottom: 26, right: 26, width: 190, height: 110,
          backgroundColor: 0xe9c46aff, borderRadius: 24,
        }} />
        <Text style={{
          position: 'absolute', top: 54, left: 52,
          text: { color: 0xffffffff, fontSize: 16 },
        }}>
          Rayact below
        </Text>
        <WebView
          ref={ref}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          source={remote ? { uri: REMOTE_URL } : { html: INLINE_HTML }}
          injectedJavaScriptBeforeContentLoaded="window.__rayactDocumentStart = true; document.addEventListener('DOMContentLoaded', function () { var before = document.getElementById('before'); if (before) before.textContent = 'document-start script: OK'; });"
          injectedJavaScript="document.getElementById('title') && (document.getElementById('title').textContent += ' + injected');"
          onLoadStart={e => push(`loadStart ${e.nativeEvent.url.slice(0, 40)}`)}
          onLoadEnd={e => push(`loadEnd ${e.nativeEvent.url.slice(0, 40)}`)}
          onError={e => push(`error ${e.nativeEvent.description}`)}
          onMessage={e => push(`message "${e.nativeEvent.data}"`)}
          onNavigationStateChange={s => push(`nav back=${s.canGoBack} fwd=${s.canGoForward}`)}
        />
        {/* This must be a Rayact overlay slice above the real native control. */}
        <Button
          style={[BUTTON_STYLE, { position: 'absolute', top: 10, right: 10 }]}
          label={`Rayact overlay ${overlayPresses}`}
          onPress={() => setOverlayPresses(n => n + 1)}
        />
        {/* A second real platform view, with raym3 retaining its M3 chrome. */}
        <TextInput
          accessibilityLabel="Native text input over WebView"
          value={nativeText}
          onChangeText={setNativeText}
          label="Native TextInput"
          placeholder="Type over the WebView"
          variant={textVariant}
          returnKeyType="done"
          // Editing colors come from the stylesheet, not props — the engine
          // resolves the cascade and forwards them to the platform editor.
          className="tinted-field"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12,
            height: 58,
            text: { color: 0xffffffff },
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['filled', 'outlined', 'underline', 'plain'] as const).map(variant => (
          <Button
            key={variant}
            style={{
              ...BUTTON_STYLE,
              backgroundColor: textVariant === variant ? 0x7f67beff : 0x49454fff,
            }}
            label={variant}
            onPress={() => setTextVariant(variant)}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button style={BUTTON_STYLE} label={remote ? 'Load HTML' : 'Load URL'} onPress={() => setRemote(r => !r)} />
        <Button style={BUTTON_STYLE} label="Reload" onPress={() => ref.current?.reload()} />
        <Button
          style={BUTTON_STYLE}
          label="Post"
          onPress={() => {
            const n = posts + 1;
            setPosts(n);
            ref.current?.postMessage(`hello ${n}`);
          }}
        />
        <Button
          style={BUTTON_STYLE}
          label="Inject"
          onPress={() => ref.current?.injectJavaScript("document.body.style.filter='invert(1)';")}
        />
        <Button style={BUTTON_STYLE} label="Back" onPress={() => ref.current?.goBack()} />
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
