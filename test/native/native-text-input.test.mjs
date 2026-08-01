import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('TextInput embeds a generic native editor inside raym3 M3 chrome', () => {
  const component = read('packages/rayact-react/src/components.ts');
  const renderer = read('third_party/raym3/src/v2/TextInput.cpp');
  const props = read('third_party/raym3/include/raym3/v2/View.h');
  const publicTypes = read('packages/rayact-renderer/src/types.ts');

  assert.match(component, /kind: 'rayact\.internal\.text-input'/);
  assert.match(component, /nativeEditor: nativeEditorPlatform/);
  assert.match(component, /preserveFrameworkUnderlay: true/);
  assert.match(component, /React\.createElement\('rayact-text-input', wire, nativeEditor\)/);
  assert.match(publicTypes, /variant\?: 'filled' \| 'outlined' \| 'underline' \| 'plain'/);
  assert.match(props, /bool nativeEditor = false/);
  assert.match(renderer, /if \(ti\.nativeEditor\)\s*return;/);

  // The native editor is no longer mobile-only: web (DOM input) and macOS
  // (NSTextField) supply one through the same platform-view bridge.
  for (const platform of ['ANDROID', 'IOS', 'WEB', 'MACOS']) {
    assert.match(component, new RegExp(`Platform\\.OS === Platform\\.${platform}`));
  }
});

test('every host that composites platform views installs an embedder', () => {
  // The bridge only forwards create/composite once a host registers itself;
  // a host that forgets leaves <ExternalView>, @rayact/webview and the native
  // text editor silently inert (which is what web and desktop used to do).
  const hosts = [
    'native/android/jni_bridge.cpp',
    'native/ios/ios_engine_instance.cpp',
    'native/web/web_platform_views.cpp',
    'native/desktop/mac_platform_views.mm',
  ];
  for (const host of hosts) {
    assert.match(read(host), /rayactSetExternalViewHostCallbacks/, host);
  }
  // Web and macOS render their screens sequentially into one window, so they
  // share a single embedder installed on every screen's RenderContext.
  for (const host of ['native/web/web_platform_views.cpp',
                      'native/desktop/mac_platform_views.mm']) {
    assert.match(read(host), /engineSetExternalViewEmbedder/, host);
  }
  assert.match(
    read('native/desktop/engine_render.cpp'),
    /screenContext\.externalViewEmbedder = g_hostExternalViewEmbedder/,
  );
});

test('hosts that install platform views late replay existing creates', () => {
  // Desktop opens its window after the app has already committed a tree, so
  // without a replay those external views would never reach the host.
  const bridge = read('native/desktop/raym3_bridge.cpp');
  assert.match(bridge, /void rayactReplayExternalViewCreates\(\)/);
  assert.match(bridge, /createPropsJson/);
  assert.match(
    read('native/desktop/mac_platform_views.mm'),
    /rayactReplayExternalViewCreates/,
  );
});

test('M3 geometry: notch primitive, variant insets, plain variant', () => {
  const component = read('packages/rayact-react/src/components.ts');
  const renderer = read('third_party/raym3/src/v2/TextInput.cpp');
  const rendererApi = read('third_party/raym3/include/raym3/rendering/Renderer.h');
  const enums = read('third_party/raym3/include/raym3/types.h');
  const bridge = read('native/desktop/raym3_bridge.cpp');

  // The outlined border is notched around the floating label.
  assert.match(rendererApi, /DrawRoundedRectangleNotched/);
  assert.match(renderer, /DrawRoundedRectangleNotched/);
  // The 20dp above-the-box label band is gone; geometry is variant-aware.
  assert.doesNotMatch(renderer, /inputBounds\.y \+= 20\.0f/);
  assert.match(renderer, /kFilledInputTop = 24\.0f/);
  assert.match(renderer, /kFilledInputBottom = 8\.0f/);
  assert.match(renderer, /kOutlinedTopStrip = 8\.0f/);
  assert.match(renderer, /kNotchPadding = 4\.0f/);
  // Bare TextInput is the RN-parity plain input; the native editor insets
  // mirror the C++ constants per variant.
  assert.match(enums, /TextFieldVariant \{ Filled, Outlined, Underline, Plain \}/);
  assert.match(bridge, /TextFieldVariant::Plain/);
  assert.match(component, /props\.variant \?\? 'plain'/);
  assert.doesNotMatch(component, /contentTop = hasLabel \? 20 : 0/);
  assert.match(component, /contentTop = 24/);
  assert.match(component, /contentTop = 8/);
  assert.match(component, /contentBottom = 8/);
});

test('mobile native editors are transparent, direct hierarchy controls', () => {
  const android = read(
    'apps/android/app/src/main/java/com/rayact/engine/RayactNativeTextInput.kt',
  );
  const androidTemplate = read(
    'packages/template-android/app/src/main/java/com/rayact/engine/RayactNativeTextInput.kt',
  );
  const ios = read('apps/ios/RayactNativeTextInput.swift');
  const iosTemplate = read('packages/template-ios/RayactNativeTextInput.swift');

  assert.equal(androidTemplate, android);
  assert.equal(iosTemplate, ios);
  assert.match(android, /: EditText\(context\)/);
  assert.match(android, /editor\.background = null/);
  assert.doesNotMatch(android, /RayactTextInputChromeDrawable/);
  assert.match(android, /setBackgroundColor\(Color\.TRANSPARENT\)/);
  assert.match(android, /editor\.hint = if \(hasLabel\) "" else placeholder/);
  assert.match(ios, /RayactNativeField: UITextField/);
  assert.match(ios, /RayactNativeTextView: UITextView/);
  assert.match(ios, /backgroundColor = \.clear/);
});

test('native text editor registration and M3 toggles survive generated templates', () => {
  for (const registryPath of [
    'apps/android/app/src/main/java/com/rayact/engine/RayactPlatformRegistry.kt',
    'packages/template-android/app/src/main/java/com/rayact/engine/RayactPlatformRegistry.kt',
  ]) {
    assert.match(read(registryPath), /registerRayactNativeTextInput/);
  }
  for (const registryPath of [
    'apps/ios/RayactPlatformRegistry.swift',
    'packages/template-ios/RayactPlatformRegistry.swift',
  ]) {
    assert.match(read(registryPath), /registerRayactNativeTextInput/);
  }

  const bridge = read('native/desktop/raym3_bridge.cpp');
  const runtime = read('packages/rayact-runtime/src/bridge.ts');
  assert.match(bridge, /textInput\.nativeEditor/);
  assert.match(bridge, /textInput\.drawBackground/);
  assert.match(bridge, /textInput\.drawOutline/);
  assert.match(bridge, /textInput\.drawStateLayer/);
  assert.match(runtime, /'nativeEditor' in props/);
  assert.match(runtime, /'drawBackground' in props/);
});

test('M3 labels rest inside empty fields and the smoke app exposes every variant', () => {
  const renderer = read('third_party/raym3/src/v2/TextInput.cpp');
  const smokeApp = read('test-projects/webview-smoke/src/App.tsx');

  assert.match(
    renderer,
    /float target = \(isFocused \|\| hasContent\) \? 1\.0f : 0\.0f/,
  );
  assert.ok(
    renderer.indexOf('// Paint the label after the container.') >
      renderer.indexOf('ti.variant == TextFieldVariant::Filled'),
    'labels must paint after the filled container background',
  );
  assert.match(
    smokeApp,
    /\(\['filled', 'outlined', 'underline', 'plain'\] as const\)\.map/,
  );
  assert.match(smokeApp, /variant=\{textVariant\}/);
});
