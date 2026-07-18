import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdbForwards } from '../../dist/dev-server/adb.js';

test('parseAdbForwards preserves serial and exact local/remote endpoints', () => {
  assert.deepEqual(parseAdbForwards([
    'device-a tcp:9229 tcp:9229',
    'device-b tcp:8081 tcp:8081',
    'device-c localabstract:webview_devtools_remote_1 localabstract:webview_devtools_remote_1',
    ''
  ].join('\n')), [
    { serial: 'device-a', local: 'tcp:9229', remote: 'tcp:9229' },
    { serial: 'device-b', local: 'tcp:8081', remote: 'tcp:8081' },
    { serial: 'device-c', local: 'localabstract:webview_devtools_remote_1', remote: 'localabstract:webview_devtools_remote_1' }
  ]);
});
