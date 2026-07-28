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
  platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <3', engineRange: '>=0.0.3 <0.1.0',
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
  assert.equal(
    manifest.android.registrationClass,
    'dev.rayact.webview.RayactWebViewRegistration',
  );
  assert.deepEqual(manifest.android.sourceDirs, ['android/src/main/java']);
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
  assert.throws(() => assertModuleCompatibility(manifestFixture({ abiRange: '>=3 <4' })), /ABI mismatch.*regenerate native projects/);
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
      platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <3', engineRange: '>=0.0.3 <0.1.0',
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
    platforms: ['android', 'ios', 'darwin'], architectures: ['arm64'], abiRange: '>=1 <3', engineRange: '>=0.0.3 <0.1.0',
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
      platforms: ['ios'], architectures: ['arm64'], abiRange: '>=1 <3', engineRange: '>=0.0.3 <0.1.0',
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
  assert.ok(fs.existsSync(path.join(iosDir, 'Autolinked/sample/Sources/Sample.swift')));
  assert.match(fs.readFileSync(path.join(iosDir, 'Autolinked/RayactGeneratedModules.swift'), 'utf8'), /SampleRegistration/);
  assert.match(fs.readFileSync(path.join(iosDir, 'project.yml'), 'utf8'), /AVFoundation\.framework/);
  assert.match(fs.readFileSync(path.join(iosDir, 'Info.plist'), 'utf8'), /NSCameraUsageDescription/);
});

test('linking and module plist values are inserted at the root and preserve existing schemes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-linking-ios-'));
  const plist = `<?xml version="1.0"?><plist><dict>
    <key>CFBundleURLTypes</key><array><dict>
      <key>CFBundleURLName</key><string>rayact</string>
      <key>CFBundleURLSchemes</key><array><string>rayact</string></array>
    </dict></array>
    <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  </dict></plist>`;
  fs.writeFileSync(path.join(root, 'Info.plist'), plist);
  fs.writeFileSync(path.join(root, 'Info-Release.plist'), plist);
  applyLinkingConfiguration(null, root, ['codesitter']);
  const output = fs.readFileSync(path.join(root, 'Info.plist'), 'utf8');
  assert.match(output, /<string>rayact<\/string>/);
  assert.match(output, /<string>codesitter<\/string>/);
  const atsEnd = output.indexOf('</dict>', output.indexOf('<key>NSAppTransportSecurity</key>'));
  assert.ok(output.indexOf('<string>codesitter</string>') < output.indexOf('<key>NSAppTransportSecurity</key>'));
  assert.doesNotMatch(output.slice(output.indexOf('<key>NSAppTransportSecurity</key>'), atsEnd), /codesitter/);
});
