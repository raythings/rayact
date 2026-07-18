import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeReleaseWebHtml } from '../../dist/cli/commands/build.js';

test('release Web sanitizer removes minified development bootstrap code', () => {
  const input = '<script>var rayactDevMatch=(location.search||"").match(/[?&]dev=([^&]+)/),rayactDevBase="";var Module={preRun:[function(){if(rayactDevBase)return addRunDependency("rayact-dev-prefetch");addRunDependency("rayact-app-bundle")}],__rayactPrefetchCache:new Map,__rayactActiveRevision:null,__rayactSetLoading:function(){}};</script>';
  const output = sanitizeReleaseWebHtml(input);
  assert.doesNotMatch(output, /rayactDevBase|__rayactPrefetchCache|rayact-dev-prefetch|\?dev=/);
  assert.match(output, /rayact-app-bundle/);
});

test('release Web sanitizer fails closed when the host contract changes', () => {
  assert.throws(
    () => sanitizeReleaseWebHtml('<script>const rayactDevBase = "still-present";</script>'),
    /development bootstrap markers/
  );
});
