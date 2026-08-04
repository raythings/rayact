import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertModuleCompatibility,
  applyLinkingConfiguration,
  copyAndroidPluginArtifacts,
  copyIosPluginArtifacts,
  mergeNativeModules,
  resolveRayactPlugins,
  writeAndroidPlatformAutolinking,
  writeIosPlatformAutolinking
} from '../../dist/prebuild/index.js';

const manifestFixture = (overrides = {}) => ({
  schemaVersion: 1, name: 'sample', package: '@rayact/sample', jsEntry: '.', library: 'rayact_sample',
  platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <6', engineRange: '>=0.0.3 <0.1.0',
  linkage: 'dynamic', permissions: [], configurationSchema: {}, officialDevApp: false, artifacts: [],
  ...overrides,
});

const pluginFixture = {
  name: 'sample', lib: 'rayact_sample', jsPackage: '@rayact/sample', packageDir: '/fixture',
  manifestPath: '/fixture/rayact.module.json', manifest: manifestFixture(),
};

test('Android app template applies the generated autolink script from the project root', () => {
  const templateAppDir = path.resolve('packages/template-android/app');
  const gradle = fs.readFileSync(path.join(templateAppDir, 'build.gradle'), 'utf8');
  const relativeScript = gradle.match(/def rayactAutolink = file\('([^']+)'\)/)?.[1];
  assert.equal(relativeScript, '../rayact-autolink.gradle');
  assert.equal(
    path.resolve(templateAppDir, relativeScript),
    path.resolve('packages/template-android/rayact-autolink.gradle'),
  );
});

test('Android WebView implementation is package-owned and absent from the base template', () => {
  const engineSource = fs.readFileSync(
    path.resolve('packages/template-android/app/src/main/java/com/rayact/engine/RayactPlatformViews.kt'),
    'utf8',
  );
  const packageSource = fs.readFileSync(
    path.resolve('packages/rayact-webview/android/src/main/java/dev/rayact/webview/RayactWebViewRegistration.kt'),
    'utf8',
  );
  const manifest = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-webview/rayact.module.json'),
    'utf8',
  ));

  assert.doesNotMatch(engineSource, /android\.webkit|WebViewHost|RayactWebView/);
  assert.match(engineSource, /RayactPlatformRegistry\.shared\.hasViewFactory/);
  assert.match(packageSource, /android\.webkit\.WebView/);
  assert.match(packageSource, /WebViewCompat\.addDocumentStartJavaScript/);
  assert.match(packageSource, /setBackgroundColor\(Color\.TRANSPARENT\)/);
  assert.equal(
    manifest.android.registrationClass,
    'dev.rayact.webview.RayactWebViewRegistration',
  );
  assert.deepEqual(manifest.android.sourceDirs, ['android/src/main/java']);
  assert.deepEqual(manifest.android.dependencies, ['androidx.webkit:webkit:1.9.0']);
  assert.equal(manifest.android.manifest, 'android/src/main/AndroidManifest.xml');
  assert.match(
    fs.readFileSync(path.resolve('packages/rayact-webview/android/src/main/AndroidManifest.xml'), 'utf8'),
    /android\.permission\.INTERNET/,
  );
  assert.match(
    fs.readFileSync(path.resolve('packages/rayact-webview/android/src/main/AndroidManifest.xml'), 'utf8'),
    /android\.permission\.ACCESS_NETWORK_STATE/,
  );
  const baseManifest = fs.readFileSync(
    path.resolve('packages/template-android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  assert.doesNotMatch(baseManifest, /android\.permission\.INTERNET/);
  assert.doesNotMatch(baseManifest, /android\.permission\.ACCESS_NETWORK_STATE/);
});

test('sensor implementations are package-owned and dev hosts only forward generic system events', () => {
  const androidHost = fs.readFileSync(
    path.resolve('packages/template-android/app/src/main/java/com/rayact/app/DevLauncherActivity.kt'),
    'utf8',
  );
  const androidSensors = fs.readFileSync(
    path.resolve('packages/rayact-sensors/android/src/main/java/dev/rayact/sensors/RayactSensorsRegistration.kt'),
    'utf8',
  );
  const iosHost = fs.readFileSync(
    path.resolve('packages/template-ios/DevLauncherController.swift'),
    'utf8',
  );
  const iosSensors = fs.readFileSync(
    path.resolve('packages/rayact-sensors/ios/RayactSensorsRegistration.swift'),
    'utf8',
  );
  const manifest = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-sensors/rayact.module.json'),
    'utf8',
  ));

  assert.doesNotMatch(androidHost, /SensorManager|DevShakeDetector|android\.hardware/);
  assert.match(androidSensors, /android\.hardware\.SensorManager/);
  assert.doesNotMatch(iosHost, /CoreMotion|CMMotionManager|nativeToggleDevMenu/);
  assert.match(iosHost, /emitSystemEvent\("motionShake"\)/);
  assert.match(iosSensors, /import CoreMotion/);
  assert.equal(
    manifest.android.registrationClass,
    'dev.rayact.sensors.RayactSensorsRegistration',
  );
  assert.equal(manifest.ios.registrationType, 'RayactSensorsRegistration');
});

test('scanner, image picker, and haptics implementations are package-owned', () => {
  const androidBridge = fs.readFileSync(
    path.resolve('packages/template-android/app/src/main/java/com/rayact/devclient/DevClientBridge.kt'),
    'utf8',
  );
  const iosBridge = fs.readFileSync(
    path.resolve('packages/template-ios/DevClientBridge.swift'),
    'utf8',
  );
  const androidScanner = fs.readFileSync(
    path.resolve('packages/rayact-barcode-scanner/android/src/main/java/dev/rayact/barcodescanner/RayactBarcodeScannerRegistration.kt'),
    'utf8',
  );
  const iosScanner = fs.readFileSync(
    path.resolve('packages/rayact-barcode-scanner/ios/RayactBarcodeScannerRegistration.swift'),
    'utf8',
  );
  const androidImagePicker = fs.readFileSync(
    path.resolve('packages/rayact-image-picker/android/src/main/java/dev/rayact/imagepicker/RayactImagePickerRegistration.kt'),
    'utf8',
  );
  const iosImagePicker = fs.readFileSync(
    path.resolve('packages/rayact-image-picker/ios/RayactImagePickerRegistration.swift'),
    'utf8',
  );
  const hapticsManifest = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-haptics/rayact.module.json'),
    'utf8',
  ));

  assert.doesNotMatch(
    androidBridge,
    /GmsBarcode|startBarcodeScan|pollBarcodeScan|MediaStore\.ACTION_PICK_IMAGES|startImagePicker/,
  );
  assert.doesNotMatch(
    iosBridge,
    /AVFoundation|Vision|QRScanner|startBarcodeScan|pollBarcodeScan|PhotosUI|PHPicker|startImagePicker/,
  );
  assert.match(androidScanner, /GmsBarcodeScanning/);
  assert.match(iosScanner, /import AVFoundation/);
  assert.match(iosScanner, /VNDetectBarcodesRequest/);
  assert.match(androidImagePicker, /MediaStore\.ACTION_PICK_IMAGES/);
  assert.match(iosImagePicker, /PHPickerViewController/);
  assert.equal(
    hapticsManifest.android.registrationClass,
    'dev.rayact.haptics.RayactHapticsRegistration',
  );
  assert.equal(hapticsManifest.ios.registrationType, 'RayactHapticsRegistration');
});

test('clipboard and external linking operations autolink from their packages', () => {
  const clipboard = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-clipboard/rayact.module.json'),
    'utf8',
  ));
  const linking = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-linking/rayact.module.json'),
    'utf8',
  ));
  assert.equal(
    clipboard.android.registrationClass,
    'dev.rayact.clipboard.RayactClipboardRegistration',
  );
  assert.equal(clipboard.ios.registrationType, 'RayactClipboardRegistration');
  assert.equal(
    linking.android.registrationClass,
    'dev.rayact.linking.RayactLinkingRegistration',
  );
  assert.equal(linking.android.manifest, 'android/AndroidManifest.xml');
  assert.equal(linking.ios.registrationType, 'RayactLinkingRegistration');
});

test('module selection precedence supports autolink, configuration, disable, and the legacy warning', () => {
  assert.equal(mergeNativeModules(undefined, [pluginFixture]).length, 1);
  assert.deepEqual(
    mergeNativeModules([{ package: '@rayact/sample', configuration: { namespace: 'profile' } }], [pluginFixture])[0].configuration,
    { namespace: 'profile' },
  );
  assert.deepEqual(mergeNativeModules([{ package: '@rayact/sample', enabled: false }], [pluginFixture]), []);
  const warnings = [];
  const legacy = mergeNativeModules(
    [{ name: 'sample', lib: 'legacy_sample', jsPackage: '@rayact/sample' }],
    [pluginFixture],
    warning => warnings.push(warning),
  );
  assert.equal(legacy[0].lib, 'legacy_sample');
  assert.match(warnings[0], /rayact migrate/);
});

test('platform-only packages preserve autolinking metadata without becoming C ABI requirements', () => {
  const platformPlugin = {
    ...pluginFixture,
    manifest: manifestFixture({ nativeBus: false, android: { dependencies: ['com.example:ui:1.0'] } }),
  };
  const [entry] = mergeNativeModules(undefined, [platformPlugin]);
  assert.equal(entry.nativeBus, false);
  assert.equal(entry.lib, 'rayact_sample');
});

test('module configuration is checked against its package-owned schema', () => {
  const configuredPlugin = {
    ...pluginFixture,
    manifest: manifestFixture({
      configurationSchema: {
        type: 'object', additionalProperties: false, required: ['mode'],
        properties: { mode: { enum: ['local', 'upload'] }, retries: { type: 'integer', minimum: 0, maximum: 5 } },
      },
    }),
  };
  assert.doesNotThrow(() => mergeNativeModules([
    { package: '@rayact/sample', configuration: { mode: 'local', retries: 2 } },
  ], [configuredPlugin]));
  assert.throws(() => mergeNativeModules([
    { package: '@rayact/sample', configuration: { mode: 'remote' } },
  ], [configuredPlugin]), /must be one of/);
  assert.throws(() => mergeNativeModules([
    { package: '@rayact/sample', configuration: { mode: 'local', token: 'nope' } },
  ], [configuredPlugin]), /unknown property/);
});

test('module compatibility rejects actionable ABI and engine mismatches', () => {
  assert.doesNotThrow(() => assertModuleCompatibility(manifestFixture()));
  // Both directions must fail: a module needing a newer ABI than this host, and
  // one pinned to an ABI this host has moved past.
  assert.throws(() => assertModuleCompatibility(manifestFixture({ abiRange: '>=6 <7' })), /ABI mismatch.*regenerate native projects/);
  assert.throws(() => assertModuleCompatibility(manifestFixture({ abiRange: '>=1 <2' })), /ABI mismatch.*regenerate native projects/);
  assert.throws(() => assertModuleCompatibility(manifestFixture({ engineRange: '>=1.0.0 <2.0.0' })), /engine mismatch.*rayact migrate/);
});

test('Android custom module libraries are copied into generated clients', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-android-plugin-'));
  const androidDir = path.join(root, 'android');
  const packageDir = path.join(root, 'sample');
  const library = path.join(packageDir, 'android/arm64-v8a/librayact_sample.so');
  fs.mkdirSync(path.dirname(library), { recursive: true });
  fs.writeFileSync(library, 'fixture');
  const sha256 = crypto.createHash('sha256').update('fixture').digest('hex');

  copyAndroidPluginArtifacts(androidDir, [{
    name: 'sample', lib: 'rayact_sample', jsPackage: '@rayact/sample', packageDir,
    manifestPath: path.join(packageDir, 'rayact.module.json'),
    manifest: {
      schemaVersion: 1, name: 'sample', package: '@rayact/sample', jsEntry: '.', library: 'rayact_sample',
      platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <6', engineRange: '>=0.0.3 <0.1.0',
      linkage: 'dynamic', permissions: [], configurationSchema: {}, officialDevApp: false,
      artifacts: [{ platform: 'android', architecture: 'arm64', path: 'android/arm64-v8a/librayact_sample.so', sha256 }]
    }
  }]);

  assert.ok(fs.existsSync(path.join(
    androidDir, 'app/src/main/jniLibs/arm64-v8a/librayact_sample.so'
  )));
});

test('installed native module packages are discovered without monorepo scanning', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-plugin-'));
  const packageDir = path.join(root, 'node_modules/@rayact/sample');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture', dependencies: { '@rayact/sample': '1.0.0' }
  }));
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: '@rayact/sample',
    exports: { './package.json': './package.json' },
    rayact: { manifest: './rayact.module.json' }
  }));
  fs.writeFileSync(path.join(packageDir, 'rayact.module.json'), JSON.stringify({
    schemaVersion: 1, name: 'sample', package: '@rayact/sample', jsEntry: '.', library: 'rayact_sample',
    platforms: ['android', 'ios', 'darwin'], architectures: ['arm64'], abiRange: '>=1 <6', engineRange: '>=0.0.3 <0.1.0',
    linkage: 'dynamic', permissions: [], configurationSchema: {}, officialDevApp: false, artifacts: []
  }));

  const plugins = resolveRayactPlugins(root);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].name, 'sample');
  assert.deepEqual(plugins[0].manifest.platforms, ['android', 'ios', 'darwin']);
});

test('module manifests reject artifacts for undeclared platforms', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-plugin-platform-'));
  const packageDir = path.join(root, 'node_modules/@rayact/sample');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture', dependencies: { '@rayact/sample': '1.0.0' }
  }));
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: '@rayact/sample', exports: { './package.json': './package.json' }, rayact: { manifest: './rayact.module.json' }
  }));
  fs.writeFileSync(path.join(packageDir, 'rayact.module.json'), JSON.stringify(manifestFixture({
    artifacts: [{ platform: 'ios', architecture: 'arm64', path: 'ios/Sample.xcframework', sha256: 'a'.repeat(64) }],
  })));
  assert.throws(() => resolveRayactPlugins(root), /artifact platform is not declared/);
});

test('iOS custom module XCFrameworks are copied and linked into generated clients', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-ios-plugin-'));
  const iosDir = path.join(root, 'ios');
  const packageDir = path.join(root, 'sample');
  const framework = path.join(packageDir, 'ios/Sample.xcframework');
  fs.mkdirSync(framework, { recursive: true });
  fs.writeFileSync(path.join(framework, 'Info.plist'), 'fixture');
  const sha256 = crypto.createHash('sha256').update('f:Info.plist\0').update('fixture').digest('hex');
  fs.mkdirSync(iosDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, 'project.yml'), 'dependencies:\n    # RAYACT_AUTOLINKED_MODULES\n');

  copyIosPluginArtifacts(iosDir, [{
    name: 'sample', lib: 'rayact_sample', jsPackage: '@rayact/sample', packageDir,
    manifestPath: path.join(packageDir, 'rayact.module.json'),
    manifest: {
      schemaVersion: 1, name: 'sample', package: '@rayact/sample', jsEntry: '.', library: 'rayact_sample',
      platforms: ['ios'], architectures: ['arm64'], abiRange: '>=1 <6', engineRange: '>=0.0.3 <0.1.0',
      linkage: 'framework', permissions: [], configurationSchema: {}, officialDevApp: false,
      artifacts: [{ platform: 'ios', architecture: 'arm64', path: 'ios/Sample.xcframework', sha256 }]
    }
  }]);

  assert.ok(fs.existsSync(path.join(iosDir, 'Frameworks/Modules/Sample.xcframework/Info.plist')));
  assert.match(fs.readFileSync(path.join(iosDir, 'project.yml'), 'utf8'), /Frameworks\/Modules\/Sample\.xcframework/);
});

test('platform autolinking emits only selected Android package wiring', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-platform-android-'));
  const androidDir = path.join(root, 'android');
  const packageDir = path.join(root, 'sample');
  fs.mkdirSync(path.join(androidDir, 'app/src/main/java'), { recursive: true });
  fs.mkdirSync(path.join(packageDir, 'android/src/main/java'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'android/AndroidManifest.xml'), [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<uses-permission android:name="android.permission.CAMERA"/>',
    '<application><meta-data android:name="sample" android:value="true"/></application>',
    '</manifest>',
  ].join(''));
  const plugin = {
    ...pluginFixture,
    packageDir,
    manifest: manifestFixture({
      platforms: ['android'],
      android: {
        registrationClass: 'dev.rayact.sample.SampleRegistration',
        dependencies: ['com.example:sample:1.0.0'],
        manifest: 'android/AndroidManifest.xml',
        sourceDirs: ['android/src/main/java'],
      },
    }),
  };

  writeAndroidPlatformAutolinking(androidDir, [plugin]);
  assert.match(fs.readFileSync(path.join(androidDir, 'rayact-autolink.gradle'), 'utf8'), /com\.example:sample:1\.0\.0/);
  assert.match(fs.readFileSync(path.join(androidDir, 'app/src/main/java/com/rayact/generated/RayactGeneratedModules.kt'), 'utf8'), /SampleRegistration/);
  assert.match(fs.readFileSync(path.join(androidDir, 'rayact-autolink-manifest/src/main/AndroidManifest.xml'), 'utf8'), /android\.permission\.CAMERA/);

  writeAndroidPlatformAutolinking(androidDir, []);
  assert.doesNotMatch(fs.readFileSync(path.join(androidDir, 'rayact-autolink.gradle'), 'utf8'), /sample/i);
  assert.doesNotMatch(fs.readFileSync(path.join(androidDir, 'rayact-autolink-manifest/src/main/AndroidManifest.xml'), 'utf8'), /CAMERA/);
});

test('platform autolinking copies iOS sources and contributes frameworks and plist values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-platform-ios-'));
  const iosDir = path.join(root, 'ios');
  const packageDir = path.join(root, 'sample');
  fs.mkdirSync(path.join(packageDir, 'ios'), { recursive: true });
  fs.mkdirSync(iosDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'ios/Sample.swift'), 'final class Sample {}');
  fs.writeFileSync(path.join(iosDir, 'project.yml'), '    # RAYACT_AUTOLINKED_PLATFORM_DEPENDENCIES\n');
  const plist = '<?xml version="1.0"?><plist><dict></dict></plist>';
  fs.writeFileSync(path.join(iosDir, 'Info.plist'), plist);
  fs.writeFileSync(path.join(iosDir, 'Info-Release.plist'), plist);
  const plugin = {
    ...pluginFixture,
    packageDir,
    manifest: manifestFixture({
      platforms: ['ios'],
      ios: {
        sources: ['ios/Sample.swift'],
        registrationType: 'SampleRegistration',
        frameworks: ['AVFoundation'],
        infoPlist: { NSCameraUsageDescription: 'Scan QR codes' },
      },
    }),
  };

  writeIosPlatformAutolinking(iosDir, [plugin]);
  writeIosPlatformAutolinking(iosDir, [plugin]);
  assert.ok(fs.existsSync(path.join(iosDir, 'Autolinked/sample/Sources/Sample.swift')));
  assert.match(fs.readFileSync(path.join(iosDir, 'Autolinked/RayactGeneratedModules.swift'), 'utf8'), /SampleRegistration/);
  const project = fs.readFileSync(path.join(iosDir, 'project.yml'), 'utf8');
  assert.match(project, /AVFoundation\.framework/);
  assert.equal((project.match(/AVFoundation\.framework/g) ?? []).length, 1);
  const info = fs.readFileSync(path.join(iosDir, 'Info.plist'), 'utf8');
  assert.match(info, /NSCameraUsageDescription/);
  assert.equal((info.match(/NSCameraUsageDescription/g) ?? []).length, 1);
});

test('linking and module plist values are inserted at the root and preserve existing schemes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-linking-ios-'));
  const androidMain = path.join(root, 'android/app/src/main');
  fs.mkdirSync(androidMain, { recursive: true });
  fs.writeFileSync(
    path.join(androidMain, 'AndroidManifest.xml'),
    '<manifest><application><activity><!-- RAYACT_LINKING_INTENT_FILTERS --></activity></application></manifest>',
  );
  const plist = `<?xml version="1.0"?><plist><dict>
    <key>CFBundleURLTypes</key><array><dict>
      <key>CFBundleURLName</key><string>rayact</string>
      <key>CFBundleURLSchemes</key><array><string>rayact</string></array>
    </dict></array>
    <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  </dict></plist>`;
  fs.writeFileSync(path.join(root, 'Info.plist'), plist);
  fs.writeFileSync(path.join(root, 'Info-Release.plist'), plist);
  applyLinkingConfiguration(path.join(root, 'android'), root, ['codesitter']);
  applyLinkingConfiguration(path.join(root, 'android'), root, ['codesitter']);
  const android = fs.readFileSync(path.join(androidMain, 'AndroidManifest.xml'), 'utf8');
  assert.equal((android.match(/android:scheme="codesitter"/g) ?? []).length, 1);
  const output = fs.readFileSync(path.join(root, 'Info.plist'), 'utf8');
  assert.match(output, /<string>rayact<\/string>/);
  assert.match(output, /<string>codesitter<\/string>/);
  assert.equal((output.match(/<string>codesitter<\/string>/g) ?? []).length, 2);
  const atsEnd = output.indexOf('</dict>', output.indexOf('<key>NSAppTransportSecurity</key>'));
  assert.ok(output.indexOf('<string>codesitter</string>') < output.indexOf('<key>NSAppTransportSecurity</key>'));
  assert.doesNotMatch(output.slice(output.indexOf('<key>NSAppTransportSecurity</key>'), atsEnd), /codesitter/);
});

test('module manifests only claim platforms they actually implement', () => {
  const read = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));

  // A platform claim is a promise the module works there, and `assertModuleSupport`
  // fails a build when a claim is missing — so every claim needs backing evidence:
  // a registration class/type, a shipped artifact, or a browser script. Checked as
  // a rule rather than per-module expectations so new modules are covered too.
  const evidence = {
    android: (m) => !!m.android?.registrationClass || m.artifacts.some((a) => a.platform === 'android'),
    ios: (m) => !!m.ios?.registrationType || m.artifacts.some((a) => a.platform === 'ios'),
    web: (m) => !!m.web?.script || m.artifacts.some((a) => a.platform === 'web'),
    darwin: (m) => m.artifacts.some((a) => a.platform === 'darwin') || m.name === 'webview',
    linux: (m) => m.artifacts.some((a) => a.platform === 'linux'),
    windows: (m) => m.artifacts.some((a) => a.platform === 'windows'),
  };

  // Claims the ENGINE currently backs rather than the package. Each is a known
  // violation of "implementations live in their package", kept explicit so it
  // stays visible instead of quietly widening the rule:
  //   crash-reporter/web engine global __rayactRecordCrash
  //   clipboard/desktop  engine globals __rayactClipboardRead/Write
  //   linking/desktop    no desktop implementation at all (a gap, not a backend)
  //   image-picker/desktop  ditto
  // Extracting these is follow-up work; see docs/native-modules.md.
  const engineBacked = new Set([
    'crash-reporter:web',
    'clipboard:darwin', 'clipboard:linux', 'clipboard:windows',
    'linking:darwin', 'linking:linux', 'linking:windows',
    'image-picker:darwin', 'image-picker:linux', 'image-picker:windows',
  ]);

  for (const manifestPath of fs.readdirSync(path.resolve('packages'))
    .map((dir) => path.resolve('packages', dir, 'rayact.module.json'))
    .filter((file) => fs.existsSync(file))) {
    const manifest = read(manifestPath);
    for (const platform of manifest.platforms) {
      const check = evidence[platform];
      if (!check) continue;   // unknown platform names are someone else's problem
      if (engineBacked.has(`${manifest.name}:${platform}`)) continue;
      assert.ok(
        check(manifest),
        `${manifest.package} claims ${platform} with no implementation backing it`,
      );
    }
    // A module that ships its own web code targets wasm32; the engine-backed
    // exceptions above contribute none, so they carry no wasm32 claim either.
    if (manifest.web?.script) {
      assert.ok(
        manifest.architectures.includes('wasm32'),
        `${manifest.package} claims web without wasm32`,
      );
    }
  }

  // first-party-modules.json mirrors the manifests; drift there silently changes
  // what the dev app and release set advertise.
  const firstParty = read('packages/first-party-modules.json');
  const catalogNames = new Set(firstParty.modules.map((entry) => entry.name));
  for (const manifestPath of fs.readdirSync(path.resolve('packages'))
    .map((dir) => path.resolve('packages', dir, 'rayact.module.json'))
    .filter((file) => fs.existsSync(file))) {
    const manifest = read(manifestPath);
    if (manifest.officialDevApp) {
      assert.ok(catalogNames.has(manifest.name), `${manifest.name}: missing from first-party-modules.json`);
    }
  }
  for (const entry of firstParty.modules) {
    const manifestPath = path.resolve('packages', `rayact-${entry.name}`, 'rayact.module.json');
    if (!fs.existsSync(manifestPath)) continue;
    assert.deepEqual(
      [...entry.platforms].sort(),
      [...read(manifestPath).platforms].sort(),
      `${entry.name}: first-party-modules.json platforms differ from its manifest`,
    );
  }
});

test('desktop and web hosts open their own window when the app never calls initRaylib', () => {
  // Mobile hosts always own surface creation, and no scaffolded app calls
  // initRaylib — so desktop and web must not sit waiting for one. This is what
  // made every new project render nothing on those two targets.
  const engineJs = fs.readFileSync(path.resolve('native/desktop/engine_js.cpp'), 'utf8');
  assert.match(engineJs, /bool engineEnsureHostWindow\(int fallbackWidth, int fallbackHeight\)/);

  const desktopMain = fs.readFileSync(path.resolve('native/desktop/main.cpp'), 'utf8');
  assert.match(desktopMain, /engineEnsureHostWindow\(\)/);

  const webMain = fs.readFileSync(path.resolve('native/web/main_web.cpp'), 'utf8');
  assert.match(webMain, /engineEnsureHostWindow\(cssW, cssH\)/);

  // Emscripten defines none of the host macros, so Platform.OS fell through to
  // the user agent and a web build on a Mac reported "macos".
  const platform = fs.readFileSync(path.resolve('native/desktop/platform.cpp'), 'utf8');
  assert.match(platform, /defined\(__EMSCRIPTEN__\)[\s\S]*?return "web"/);
});

test('the host never resizes its window after creating it', () => {
  // Design rule, not a workaround: the host can always pick its final size
  // before InitWindow, so it should — no host-sized window flashing up and
  // immediately resizing. (Historically SetWindowSize also failed to resize
  // the Metal drawable; that is fixed in the rlmt platform's
  // FramebufferSizeCallback, but the rule stands on its own.)
  const engineJs = fs.readFileSync(path.resolve('native/desktop/engine_js.cpp'), 'utf8');
  const host = engineJs.slice(engineJs.indexOf('bool engineEnsureHostWindow('));
  const body = host
    .slice(0, host.indexOf('\n}\n'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))   // the rule is named in a comment
    .join('\n');
  assert.ok(!/SetWindowSize\(/.test(body),
    'engineEnsureHostWindow must not call SetWindowSize');

  // Dev loads fetch over HTTP, so the app needs a much longer budget to call
  // initRaylib itself than a release bundle whose JS already ran.
  const main = fs.readFileSync(path.resolve('native/desktop/main.cpp'), 'utf8');
  assert.match(main, /windowGraceMs = devMode \? 5000 : 250/);
});

test('the web host is resolved from a local build, and staleness is reported', () => {
  // Building from a project directory inside the engine repo used to miss
  // ./build-web/bin and silently fall back to the downloaded prebuilt, so local
  // web-host changes never reached the output — the app booted fine and simply
  // lacked them. And `cmake --build build-web --target rayact` does not produce
  // the rayact_release.* trio that a release build actually stages.
  const source = fs.readFileSync(
    path.resolve('packages/rayact-prebuild/src/prebuiltHost.ts'), 'utf8');
  assert.match(source, /function findLocalWebHost/);
  assert.match(source, /findLocalWebHost\(process\.cwd\(\)\)/);
  assert.match(source, /function warnIfWebHostStale/);
  assert.match(source, /build-web-release-host\.sh/);
});

test('tooling dependencies do not leak native modules into consumer builds', () => {
  // Every project reaches the dev launcher via rayact -> @rayact/cli ->
  // @rayact/dev-server -> @rayact/dev-client, and the launcher legitimately
  // depends on native modules for its own UI (QR scanner, shake detection).
  // Without the tooling boundary those became every app's modules, and a web
  // build failed the platform check on modules the app never imports.
  const resolved = resolveRayactPlugins(path.resolve('test-projects/webview-smoke'));
  const names = resolved.map((plugin) => plugin.name);
  assert.ok(names.includes('webview'), `expected webview in ${names}`);
  assert.ok(!names.includes('sensors'), `sensors leaked via tooling deps: ${names}`);
  assert.ok(!names.includes('barcode-scanner'), `barcode-scanner leaked via tooling deps: ${names}`);
});

test('desktop module artifacts are grouped under desktop/<platform>-<arch>', () => {
  // One folder per module holds every desktop build, so linux-x64 / windows-x64
  // land as siblings of darwin-* instead of accumulating at the package root.
  for (const name of ['rayact-mmkv', 'rayact-secure-store', 'rayact-crash-reporter',
                      'rayact-svg', 'rayact-webview']) {
    const dir = path.resolve('packages', name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'rayact.module.json'), 'utf8'));
    const desktop = manifest.artifacts.filter(
      (a) => ['darwin', 'linux', 'windows'].includes(a.platform));
    assert.ok(desktop.length > 0, `${name} declares no desktop artifacts`);
    for (const artifact of desktop) {
      assert.match(artifact.path, /^desktop\/(darwin|linux|windows)-/,
        `${name}: ${artifact.path} is not under desktop/`);
      assert.ok(fs.existsSync(path.join(dir, artifact.path)),
        `${name}: missing ${artifact.path}`);
    }
    // Stale root-level arch dirs would ship dead weight and confuse the updater.
    for (const stale of fs.readdirSync(dir)) {
      assert.doesNotMatch(stale, /^(darwin|linux|windows)-/,
        `${name}: ${stale} should have moved under desktop/`);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.ok(pkg.files.includes('desktop'), `${name}: package.json files omits desktop`);
  }
});

test('desktop and web WebView implementations are package-owned', () => {
  // Same rule the Android test above enforces, now for the two hosts that used
  // to embed the implementation: the engine must know nothing about WKWebView or
  // iframes, and @rayact/webview must carry both.
  const macHost = fs.readFileSync(path.resolve('native/desktop/mac_platform_views.mm'), 'utf8');
  const desktopCmake = fs.readFileSync(path.resolve('native/desktop/CMakeLists.txt'), 'utf8');
  const shell = fs.readFileSync(path.resolve('apps/web/shell.html'), 'utf8');

  // API usage, not the word "WebKit": a couple of comments legitimately explain
  // WebKit's event/first-responder behaviour in generic host code.
  assert.doesNotMatch(macHost, /WKWebView|WKWebViewConfiguration|RayactMacWebView|loadHTMLString/);
  assert.doesNotMatch(desktopCmake, /-framework WebKit/);
  assert.doesNotMatch(shell, /srcdoc|WEBVIEW_SHIM|createElement\('iframe'\)/);
  // The text editor is a core component and stays in both hosts.
  assert.match(macHost, /RayactMacTextEditor/);
  assert.match(shell, /rayact\.internal\.text-input/);
  // Both hosts dispatch through a registry instead of hardcoded kinds.
  assert.match(macHost, /moduleViewsFindFactory/);
  assert.match(shell, /registerViewFactory/);

  const plugin = fs.readFileSync(
    path.resolve('packages/rayact-webview/native/webview_plugin.mm'), 'utf8');
  const web = fs.readFileSync(
    path.resolve('packages/rayact-webview/web/register.js'), 'utf8');
  assert.match(plugin, /WKWebView/);
  assert.match(plugin, /register_view_factory\("webview"/);
  assert.match(web, /registerViewFactory\('webview'/);
  // Module scripts must never touch Module: they may load before or after the
  // wasm host, so registration goes through the queue the host drains.
  assert.doesNotMatch(web, /\bModule\./);

  const manifest = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-webview/rayact.module.json'), 'utf8'));
  assert.equal(manifest.web.script, 'web/register.js');
  assert.match(manifest.abiRange, /^>=3 /);   // register_view_factory is ABI 3
});

test('web modules declare a script and never reach for Module', () => {
  // The web peer of the Android/iOS registration classes. A module script is a
  // plain <script> whose load order relative to the wasm host is not guaranteed,
  // so it must register through the queue rather than touching Module.
  const webModules = ['rayact-webview', 'rayact-sensors', 'rayact-haptics', 'rayact-linking'];
  for (const name of webModules) {
    const dir = path.resolve('packages', name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'rayact.module.json'), 'utf8'));
    assert.ok(manifest.platforms.includes('web'), `${name}: platforms omits web`);
    assert.ok(manifest.web?.script, `${name}: no web.script`);
    const script = path.join(dir, manifest.web.script);
    assert.ok(fs.existsSync(script), `${name}: missing ${manifest.web.script}`);

    const source = fs.readFileSync(script, 'utf8');
    assert.doesNotMatch(source, /\bModule\./, `${name}: web script touches Module`);
    assert.match(source, /__rayactModuleRegistrations/, `${name}: does not register`);
    assert.match(source, /registerModule|registerViewFactory/, `${name}: registers nothing`);

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.ok(pkg.files.includes('web'), `${name}: package.json files omits web`);
  }
});

test('web module staging keeps sibling assets reachable', () => {
  // The script's whole directory is staged, so a module can fetch its own .wasm
  // or worker by relative URL — app-assets.json cannot serve those (it targets
  // the wasm filesystem, not HTTP). Dev must use the same URL shape as release
  // or a module would only work in one of them.
  const build = fs.readFileSync(path.resolve('packages/rayact-cli/src/commands/build.ts'), 'utf8');
  assert.match(build, /fs\.cp\(path\.dirname\(source\)/);
  assert.match(build, /modules\/\$\{plugin\.name\}\/\$\{path\.basename\(script\)\}/);
  // emcc minifies the shell, so the engine tag is unquoted: a literal match
  // would silently fall back to appending after the engine.
  assert.match(build, /src=\["'\]\?rayact\\\.js/);

  const server = fs.readFileSync(path.resolve('packages/rayact-dev-server/src/server.ts'), 'utf8');
  assert.match(server, /rayact\\\/modules\\\/\(\[\^\/\]\+\)\\\/\(\.\+\)/);
  assert.match(server, /application\/wasm/);
  assert.match(server, /startsWith\(root \+ path\.sep\)/);   // no traversal out of the module dir
});

test('native web modules ship a dlopen-able side-module artifact', () => {
  // Web dlopens modules exactly as desktop does: the artifact is an Emscripten
  // SIDE_MODULE at web/wasm32/rayact_<name>.wasm, built by build-web-module-artifacts.sh
  // from the manifest's own `web.sources`. Source and artifact live together in
  // web/, the way ios/ holds both the Swift registration and the xcframework.
  const svg = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-svg/rayact.module.json'), 'utf8'));
  assert.ok(svg.platforms.includes('web'));
  assert.ok(Array.isArray(svg.web?.sources) && svg.web.sources.length > 0);
  for (const source of svg.web.sources) {
    assert.ok(fs.existsSync(path.resolve(source)), `missing web source ${source}`);
  }
  const artifact = svg.artifacts.find((a) => a.platform === 'web');
  assert.ok(artifact, 'no web artifact declared');
  assert.equal(artifact.architecture, 'wasm32');
  assert.ok(fs.existsSync(path.resolve('packages/rayact-svg', artifact.path)),
    `missing web artifact ${artifact.path}`);

  // The entry is the same rayact_module_register every dlopen'd module exports on
  // every platform. Its registration file is C++, so it lives in native/ with the
  // shared implementation — platform folders hold platform-language bindings and
  // build output only, which for web means web/ contains just wasm32/ artifacts.
  // (svg_plugin.cpp yields the symbol under RAYACT_WEB to avoid defining it twice.)
  const entry = fs.readFileSync(path.resolve('packages/rayact-svg/native/web_register.cpp'), 'utf8');
  assert.match(entry, /rayact_module_register/);
  assert.ok(svg.web.sources.some((s) => s.includes('/native/web_register.cpp')));
  assert.ok(!fs.readdirSync(path.resolve('packages/rayact-svg/web'))
    .some((f) => /\.(c|cc|cpp|h|hpp)$/.test(f)), 'source code in the web/ platform folder');

  // The side module carries its OWN raysvg (the host deliberately has none) and
  // reaches the renderer through the ABI's GPU shim, so both must be in sources
  // and the shim define must be on for this build alone — nativeDefines already
  // has it for the desktop dylib, web.defines carries it here.
  assert.ok(svg.web.sources.some((s) => s.endsWith('raysvg.cpp')));
  assert.ok(svg.web.sources.some((s) => s.endsWith('raylib_gpu_shim.cpp')));
  assert.ok(svg.web.defines?.includes('RAYACT_SVG_USE_GPU_SHIM=1'));

  // Host side of the contract: a real MAIN_MODULE (compile-time flag — link-time
  // alone loses __stack_pointer and every dlopen LinkErrors), -O2 (wasm-opt at -O3
  // strips that export), and the curated runtime surface.
  const webCmake = fs.readFileSync(path.resolve('apps/web/CMakeLists.txt'), 'utf8');
  assert.match(webCmake, /add_compile_options\(-sMAIN_MODULE=2\)/);
  assert.match(webCmake, /module_sdk_exports\.txt/);
  assert.match(webCmake, /-O3.*-O2|REPLACE "-O3" "-O2"/);

  // Loader: boot-time (preRun dlopen corrupts the heap — getMemory bump-allocates
  // before runtimeInitialized), RTLD_LOCAL (global merges the module's weak-symbol
  // copies into the host), never fatal.
  const loader = fs.readFileSync(path.resolve('native/web/web_plugin_loader.cpp'), 'utf8');
  assert.match(loader, /RTLD_NOW \| RTLD_LOCAL/);
  assert.match(loader, /emscripten_dlopen/);
  const mainWeb = fs.readFileSync(path.resolve('native/web/main_web.cpp'), 'utf8');
  assert.match(mainWeb, /webLoadModules/);
});

test('the web module SDK surface stays inside the built host', () => {
  // module_sdk_exports.txt is an ABI contract: every symbol a side module may
  // import from the host. The build script verifies modules against the BUILT
  // host (a listed symbol emcc dropped anyway is the failure mode that shipped
  // __assert_fail); this guards the cheap half — the checked-in artifact's
  // imports are covered by the checked-in list, so a regression in either shows
  // up without an emsdk on the machine running the tests.
  const surface = new Set(fs.readFileSync(
    path.resolve('native/web/module_sdk_exports.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  const svgManifest = JSON.parse(fs.readFileSync(
    path.resolve('packages/rayact-svg/rayact.module.json'), 'utf8'));
  const webArtifact = svgManifest.artifacts.find((a) => a.platform === 'web');
  const wasm = fs.readFileSync(path.resolve('packages/rayact-svg', webArtifact.path));
  const module = new WebAssembly.Module(wasm);
  const exported = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
  const loaderProvided = new Set(['__memory_base', '__table_base', '__stack_pointer']);
  const missing = WebAssembly.Module.imports(module)
    .filter((i) =>
      (i.kind === 'function' && i.module === 'env') ||
      (i.kind === 'global' && (i.module === 'GOT.mem' || i.module === 'GOT.func')))
    .map((i) => i.name)
    .filter((name) => !exported.has(name) && !loaderProvided.has(name) && !surface.has(name));
  assert.deepEqual(missing, [], `imports outside the declared SDK surface: ${missing.join(', ')}`);
});

test('KV reports a missing key as an empty payload, not a failing return code', () => {
  // The module bus turns any non-zero rc into a thrown JS error, so `get` must
  // encode absence in the payload — the JS wrapper reads an empty result as
  // undefined. Returning -1 here made the documented
  // `KV.get(key): string | undefined` throw on every absent key, on every
  // platform, which only surfaced once web actually persisted anything to read
  // back. @rayact/mmkv's plugin encodes absence the same way (a presence byte).
  const source = fs.readFileSync(path.resolve('native/desktop/async_storage.cpp'), 'utf8');
  const getHandler = source.slice(source.indexOf('if (m == "get")'));
  const body = getHandler.slice(0, getHandler.indexOf('if (m == "set")'));
  assert.doesNotMatch(body, /return\s+-1\s*;/, 'kv get must not report a miss as rc -1');
  assert.match(body, /getString\(key, v\)/);

  const wrapper = fs.readFileSync(path.resolve('packages/rayact/src/kv/index.ts'), 'utf8');
  assert.match(wrapper, /!result\.length \? undefined/);
});

test('web key/value storage persists to localStorage rather than the ephemeral FS', () => {
  // rayactDataDir() resolves outside the IDBFS mount on web, so anything written
  // through the C filesystem is silently dropped when the tab closes. KV and
  // @rayact/mmkv therefore write through to localStorage on every mutation.
  const kv = fs.readFileSync(path.resolve('native/desktop/kv_store.cpp'), 'utf8');
  assert.match(kv, /rayactWebLocalStorageSet/);
  assert.match(kv, /#ifdef RAYACT_WEB/);
  // No flush thread on web, so a deferred write is a lost write.
  assert.match(kv, /flushThread_ = std::thread/);
  assert.match(kv.slice(kv.indexOf('void init(')), /#ifndef RAYACT_WEB/);

  const mmkv = fs.readFileSync(
    path.resolve('packages/rayact-mmkv/native/web_register.cpp'), 'utf8');
  assert.match(mmkv, /rayactWebLocalStorageSet/);
  // The obfuscation lives in the host bridge so KV and mmkv share one
  // implementation; the module must not carry its own copy.
  assert.doesNotMatch(mmkv, /keystream|mulberry|fnv1a/i);

  const bridge = fs.readFileSync(path.resolve('native/web/web_local_storage.cpp'), 'utf8');
  assert.match(bridge, /keystream/);
  // setValue(..., 'i32') rounds the address down to a 4-byte boundary, which
  // silently corrupted these packed records; lengths must be written bytewise.
  const keysFn = bridge.slice(bridge.indexOf('KeysWithPrefix'));
  assert.doesNotMatch(keysFn.slice(0, keysFn.indexOf('RandomBytes')), /setValue\(ptr \+ off/);
});

test('module component registration survives the dev-flow dual runtime instance', () => {
  // In dev the runtime exists twice: the bootstrap bundle carries one copy (whose
  // createNode consults the module-node registry) and the dev module graph fetches
  // another (which is what a component's registerNativeComponent reaches). The
  // registry must therefore live on globalThis, or registration lands in the wrong
  // instance and every module component fails with "Unsupported Rayact host node
  // type" — only under the dev server, and only for registry-based components
  // (@rayact/svg was the first; webview uses the built-in externalView kind and
  // mmkv never touches nodes, which is how the hole stayed invisible).
  const bridge = fs.readFileSync(path.resolve('packages/rayact-runtime/src/bridge.ts'), 'utf8');
  assert.match(bridge, /__rayactModuleNodeHandlers/);
  assert.doesNotMatch(bridge, /const moduleNodeHandlers = new Map</);
});

test('project-staged modules take precedence over the user data directory', () => {
  // loadPlugins dedupes by filename, so scan order is precedence. The data dir
  // accumulates whatever any previous app installed; RAYACT_MODULE_PATH is the
  // project's own staged copy and must win, or a months-stale dylib in ~/Library
  // silently shadows the freshly built one and rejects the host by ABI.
  const loader = fs.readFileSync(path.resolve('native/desktop/plugin_loader.cpp'), 'utf8');
  const body = loader.slice(loader.indexOf('void loadPlugins('));
  const dataDirScan = body.indexOf('rayactDataDir()');
  const envScan = body.indexOf('RAYACT_MODULE_PATH');
  assert.ok(envScan >= 0 && dataDirScan >= 0, 'both scan sites exist');
  assert.ok(envScan < dataDirScan, 'RAYACT_MODULE_PATH must be scanned before the data dir');
  // Android has no stderr in logcat; plugin diagnostics must go through the
  // platform logger or load failures are invisible on the one platform without
  // a terminal.
  assert.match(loader, /__android_log_vprint/);
});
