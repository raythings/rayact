import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyAndroidProjectIdentity,
  applyIosProjectIdentity,
  updateAndroidHostInfrastructure,
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

test('prebuild refreshes Rayact-owned Android host infrastructure in an existing project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-host-update-'));
  const template = path.join(root, 'template');
  const project = path.join(root, 'project');
  const managed = [
    'app/src/main/java/com/rayact/engine/RayactPlatformRegistry.kt',
    'app/src/main/java/com/rayact/engine/RayactPlatformViews.kt',
    'app/src/main/java/com/rayact/engine/RayactMobileNetwork.kt',
    'app/src/main/java/com/rayact/app/DevLauncherActivity.kt',
  ];

  for (const relative of managed) {
    fs.mkdirSync(path.dirname(path.join(template, relative)), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true });
    fs.writeFileSync(path.join(template, relative), `current:${relative}`);
    fs.writeFileSync(path.join(project, relative), `stale:${relative}`);
  }
  const userFile = path.join(project, 'app/src/main/java/com/example/UserActivity.kt');
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  fs.writeFileSync(userFile, 'user-owned');

  updateAndroidHostInfrastructure(template, project);

  for (const relative of managed) {
    assert.equal(fs.readFileSync(path.join(project, relative), 'utf8'), `current:${relative}`);
  }
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user-owned');
});
