#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const packageMappings = [
  ['rayact-shared', 'shared'],
  ['rayact-runtime', 'runtime'],
  ['rayact-renderer', 'renderer'],
  ['rayact-react', 'react'],
  ['rayact-navigation', 'navigation'],
  ['rayact-worklets', 'worklets'],
  ['rayact-dev-client', 'dev-client'],
  ['rayact-dev-server', 'dev-server'],
  ['rayact-prebuild', 'prebuild'],
  ['rayact-cli', 'cli'],
  ['rayact-mmkv', 'mmkv'],
  ['rayact-secure-store', 'secure-store'],
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const [pkg, target] of packageMappings) {
  fs.cpSync(path.join(root, 'packages', pkg, 'dist'), path.join(dist, target), { recursive: true });
}
for (const builtIn of ['crypto', 'kv', 'worker']) {
  fs.cpSync(
    path.join(root, 'packages/rayact/dist', builtIn),
    path.join(dist, builtIn),
    { recursive: true },
  );
}
for (const [source, target] of [
  ['schema', 'schema'],
  ['packages/template-android', 'templates/android'],
  ['packages/template-ios', 'templates/ios'],
  ['packages/create-rayact-app/dist', 'create-rayact-app/dist'],
]) {
  fs.cpSync(path.join(root, source), path.join(dist, target), { recursive: true });
}
fs.mkdirSync(path.join(dist, 'types'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'packages/rayact-shared/src/rayact-globals.d.ts'),
  path.join(dist, 'types/rayact.d.ts'),
);
