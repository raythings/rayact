#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remove = relative => fs.rmSync(path.join(root, relative), { recursive: true, force: true });

for (const relative of [
  'dist', 'build', '.tmp', '.rayact', '.cursor', 'release1', 'release-tarballs',
  'KeyboardAvoidingView', 'tamer-screen', 'native/desktop/build-devtools',
  'apps/android/.gradle', 'apps/android/app/.cxx', 'apps/android/app/build', 'apps/android/build',
  'apps/dev-app/dist', 'apps/dev-app/rayact-assets', 'apps/ios/build', 'apps/web/dist',
  'test-projects/desktop-smoke/.verify', 'test-projects/desktop-smoke/dist',
  'test-projects/desktop-smoke/rayact-assets',
  'test-projects/release-consumer-smoke/android', 'test-projects/release-consumer-smoke/ios',
  'test-projects/release-consumer-smoke/dist-android-check',
  'test-projects/release-consumer-smoke/dist-android-debug-check',
  'test-projects/release-consumer-smoke/dist-desktop-check',
  'test-projects/release-consumer-smoke/dist-ios-check',
  'test-projects/release-consumer-smoke/dist-web-check',
  'test-projects/release-consumer-smoke/rayact-assets',
]) remove(relative);

for (const entry of fs.readdirSync(root)) {
  if (entry.startsWith('build-web')) remove(entry);
  if (/\.(?:js|ts|png|tgz)$/.test(entry) || /^\.tmp-bundler\./.test(entry) ||
      /^Handoff: .*\.md$/.test(entry) || entry === 'window_dump.xml' || entry === '.DS_Store') {
    const target = path.join(root, entry);
    if (fs.statSync(target).isFile()) fs.rmSync(target, { force: true });
  }
}

const removeFinderMetadata = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      fs.rmSync(path.join(directory, entry.name), { force: true });
    } else if (entry.isDirectory() && !['.git', 'node_modules', 'third_party'].includes(entry.name)) {
      removeFinderMetadata(path.join(directory, entry.name));
    }
  }
};
removeFinderMetadata(root);

for (const packageName of ['prebuilt-android-arm64', 'prebuilt-android-x64', 'prebuilt-darwin-arm64', 'prebuilt-darwin-x64', 'prebuilt-linux-x64']) {
  remove(`packages/${packageName}/modules`);
}
for (const [packageName, abi] of [['prebuilt-android-arm64', 'arm64-v8a'], ['prebuilt-android-x64', 'x86_64']]) {
  for (const moduleName of ['mmkv', 'secure_store', 'crash_reporter']) {
    remove(`packages/${packageName}/jni/${abi}/librayact_${moduleName}.so`);
  }
}

for (const entry of fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
  if (entry.isDirectory()) remove(`packages/${entry.name}/dist`);
}
