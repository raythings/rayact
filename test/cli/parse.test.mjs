import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCli } from '../../dist/cli/parse.js';

test('run --desktop dispatches to run with desktop platform', () => {
  const f = parseCli(['run', '--desktop']);
  assert.equal(f.command, 'run');
  assert.equal(f.desktopApp, true);
});

test('run:android sets subcommand + android platform', () => {
  const f = parseCli(['run:android']);
  assert.equal(f.command, 'run');
  assert.equal(f.subcommand, 'android');
  assert.equal(f.platform, 'android');
});

test('run android (space form) sets android platform', () => {
  const f = parseCli(['run', 'android']);
  assert.equal(f.command, 'run');
  assert.equal(f.platform, 'android');
});

test('build --android --install sets android + install', () => {
  const f = parseCli(['build', '--android', '--install']);
  assert.equal(f.command, 'build');
  assert.equal(f.android, true);
  assert.equal(f.platform, 'android');
  assert.equal(f.install, true);
});

test('target flags set platform', () => {
  assert.equal(parseCli(['dev', '--web']).platform, 'web');
  assert.equal(parseCli(['dev', '--ios']).platform, 'ios');
  assert.equal(parseCli(['dev', '--desktop']).platform, 'desktop');
});

test('run --android --dev keeps dev flag', () => {
  const f = parseCli(['run', '--android', '--dev']);
  assert.equal(f.android, true);
  assert.equal(f.dev, true);
});

test('--release sets release mode + debug off', () => {
  const f = parseCli(['build', '--release']);
  assert.equal(f.mode, 'release');
  assert.equal(f.debug, false);
});

test('prebuild --force enables native project replacement', () => {
  const f = parseCli(['prebuild', '--force']);
  assert.equal(f.command, 'prebuild');
  assert.equal(f.force, true);
});

test('no args => help command', () => {
  assert.equal(parseCli([]).command, 'help');
});

test('unknown flag throws', () => {
  assert.throws(() => parseCli(['build', '--nope']), /Unknown flag/);
});

test('unknown run target throws', () => {
  assert.throws(() => parseCli(['run:toaster']), /Unknown run target/);
});
