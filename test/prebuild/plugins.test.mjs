import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertModuleCompatibility,
  copyAndroidPluginArtifacts,
  copyIosPluginArtifacts,
  mergeNativeModules,
  resolveRayactPlugins
} from '../../dist/prebuild/index.js';

const manifestFixture = (overrides = {}) => ({
  schemaVersion: 1, name: 'sample', package: '@rayact/sample', jsEntry: '.', library: 'rayact_sample',
  platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <2', engineRange: '>=0.0.3 <0.1.0',
  linkage: 'dynamic', permissions: [], configurationSchema: {}, officialDevApp: false, artifacts: [],
  ...overrides,
});

const pluginFixture = {
  name: 'sample', lib: 'rayact_sample', jsPackage: '@rayact/sample', packageDir: '/fixture',
  manifestPath: '/fixture/rayact.module.json', manifest: manifestFixture(),
};

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
  assert.throws(() => assertModuleCompatibility(manifestFixture({ abiRange: '>=2 <3' })), /ABI mismatch.*regenerate native projects/);
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
      platforms: ['android'], architectures: ['arm64'], abiRange: '>=1 <2', engineRange: '>=0.0.3 <0.1.0',
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
    platforms: ['android', 'ios', 'darwin'], architectures: ['arm64'], abiRange: '>=1 <2', engineRange: '>=0.0.3 <0.1.0',
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
      platforms: ['ios'], architectures: ['arm64'], abiRange: '>=1 <2', engineRange: '>=0.0.3 <0.1.0',
      linkage: 'framework', permissions: [], configurationSchema: {}, officialDevApp: false,
      artifacts: [{ platform: 'ios', architecture: 'arm64', path: 'ios/Sample.xcframework', sha256 }]
    }
  }]);

  assert.ok(fs.existsSync(path.join(iosDir, 'Frameworks/Modules/Sample.xcframework/Info.plist')));
  assert.match(fs.readFileSync(path.join(iosDir, 'project.yml'), 'utf8'), /Frameworks\/Modules\/Sample\.xcframework/);
});
