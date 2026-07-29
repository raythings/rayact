import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdbDevices, parseAdbForwards } from '../../dist/dev-server/adb.js';

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

test('parseAdbDevices keeps only online devices', () => {
  assert.deepEqual(parseAdbDevices([
    'List of devices attached',
    '1C231FDEE004NA         device usb:2-1.2 product:raven model:Pixel_6_Pro',
    'emulator-5554          device',
    'ZY227KPT8H             offline',
    'RF8M902ABCD            unauthorized',
    ''
  ].join('\n')), ['1C231FDEE004NA', 'emulator-5554']);
});

test('parseAdbDevices returns nothing when no device is attached', () => {
  assert.deepEqual(parseAdbDevices('List of devices attached\n\n'), []);
});
