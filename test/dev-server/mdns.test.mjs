import test from 'node:test';
import assert from 'node:assert/strict';
import { createMdnsErrorReporter } from '../../dist/dev-server/mdns.js';

test('mDNS errors are deduplicated and periodically summarized', () => {
  const warnings = [];
  let timestamp = 1_000;
  const report = createMdnsErrorReporter(
    message => warnings.push(message),
    () => timestamp
  );

  const unreachable = new Error('send EHOSTUNREACH 224.0.0.251:5353');
  report(unreachable);
  report(unreachable);
  report(unreachable);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /EHOSTUNREACH/);

  timestamp += 60_000;
  report(unreachable);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /2 identical errors suppressed/);
});

test('a different mDNS error is reported immediately', () => {
  const warnings = [];
  const report = createMdnsErrorReporter(message => warnings.push(message), () => 1_000);

  report(new Error('first error'));
  report(new Error('second error'));

  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /second error/);
});
