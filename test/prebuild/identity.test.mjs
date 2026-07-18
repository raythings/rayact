import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyAndroidProjectIdentity,
  applyIosProjectIdentity,
} from '../../packages/rayact-prebuild/dist/prebuild.js';

test('prebuild reapplies Android packageName and appName to an existing project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-identity-'));
  const app = path.join(root, 'app');
  const manifestDir = path.join(app, 'src/main');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(app, 'build.gradle'), "android { defaultConfig { applicationId 'com.old.client' } }\n");
  fs.writeFileSync(path.join(manifestDir, 'AndroidManifest.xml'), '<application android:label="Old &amp; Client"><activity android:name=".DevLauncherActivity" /></application>\n');

  applyAndroidProjectIdentity(root, 'com.nanofuxion.termapp', 'Term & App');

  assert.match(fs.readFileSync(path.join(app, 'build.gradle'), 'utf8'), /applicationId 'com\.nanofuxion\.termapp'/);
  assert.match(fs.readFileSync(path.join(manifestDir, 'AndroidManifest.xml'), 'utf8'), /android:label="Term &amp; App"/);
  assert.match(fs.readFileSync(path.join(manifestDir, 'AndroidManifest.xml'), 'utf8'), /android:name="com\.rayact\.app\.DevLauncherActivity"/);
});

test('prebuild applies the configured iOS bundle id and display name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-ios-identity-'));
  fs.writeFileSync(path.join(root, 'project.yml'), 'name: RayactIOS\nPRODUCT_BUNDLE_IDENTIFIER: com.rayact.app\n');
  fs.writeFileSync(path.join(root, 'Info.plist'), '<key>CFBundleDisplayName</key><string>__RAYACT_APP_NAME__</string>\n');
  fs.writeFileSync(path.join(root, 'Info-Release.plist'), '<key>CFBundleDisplayName</key><string>__RAYACT_APP_NAME__</string>\n');

  applyIosProjectIdentity(root, 'com.nanofuxion.termapp', 'Term & App');

  assert.match(fs.readFileSync(path.join(root, 'project.yml'), 'utf8'), /name: TermApp/);
  assert.match(fs.readFileSync(path.join(root, 'project.yml'), 'utf8'), /com\.nanofuxion\.termapp/);
  assert.match(fs.readFileSync(path.join(root, 'Info.plist'), 'utf8'), /<string>Term &amp; App<\/string>/);
  assert.match(fs.readFileSync(path.join(root, 'Info-Release.plist'), 'utf8'), /<string>Term &amp; App<\/string>/);
});
