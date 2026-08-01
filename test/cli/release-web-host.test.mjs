// Guards for scripts/sanitize-release-web-host.mjs.
//
// The sanitizer replaces the shell's entire preRun with a hand-maintained release
// version, because the shell's own is built around the dev server and every marker
// of that has to be gone from a shipped host. The cost of that wholesale replace is
// silent drift: a behaviour added to shell.html's preRun simply vanishes from
// release builds, with no error anywhere. It has happened twice — native web module
// staging and app-assets.json staging both shipped broken this way — so each
// behaviour the release preRun must carry is asserted here, against the sanitizer
// source, next to a mirror-check that shell.html still has its dev-flavoured twin.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sanitizer = fs.readFileSync(
  path.join(root, 'scripts/sanitize-release-web-host.mjs'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'apps/web/shell.html'), 'utf8');

test('release preRun stages native web modules into MEMFS', () => {
  // Fetch-only: the host dlopens from /rayact-modules during boot. A dlopen here
  // would run before runtimeInitialized and corrupt the heap (web_plugin_loader.cpp).
  for (const source of [sanitizer, shell]) {
    assert.match(source, /__rayactWebModules/);
    assert.match(source, /\/rayact-modules/);
    assert.match(source, /rayact-modules['"]?\)/); // the run dependency gate
    assert.doesNotMatch(source, /_rayactWebLoadModule/);
  }
});

test('release preRun stages the app bundle and its runtime assets', () => {
  assert.match(sanitizer, /app\.qjsbc/);
  assert.match(sanitizer, /app-assets\.json/);   // was silently dropped once
  assert.match(sanitizer, /rayact-app-assets/);
});

test('sanitized output must not contain development bootstrap markers', () => {
  // The sanitizer's own guard list — losing it would let dev markers ship.
  for (const marker of ['rayactDevBase', '__rayactPrefetchCache', '/rayact/manifest.json']) {
    assert.ok(sanitizer.includes(`'${marker}'`), `forbidden-marker list lost ${marker}`);
  }
});
