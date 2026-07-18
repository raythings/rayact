import test from 'node:test';
import assert from 'node:assert/strict';

import { getDiagnosticsSnapshot } from '../../dist/dev-client/diagnostics.js';

test('diagnostics expose scheduler metrics and explicit availability reasons', () => {
  const snapshot = getDiagnosticsSnapshot({
    __rayactGetFrameDiagnostics: () => ({
      frameTimeMs: 16.7, rollingFrameTimeMs: 17, fps: 58.8,
      targetRefreshRate: 60, droppedFrames: 2, jankyFrames: 3, sampleFrames: 120,
    }),
    __RAYACT_REVISION__: 7,
    __RAYACT_HMR_ACTIVE__: true,
    __RAYACT_MODE__: 'development',
    __RAYACT_ENGINE_VERSION__: '1.2.3',
    __rayactPlatform: { os: 'web' },
  });

  assert.equal(snapshot.frame.sampleFrames, 120);
  assert.equal(snapshot.bundleRevision, 7);
  assert.equal(snapshot.platform, 'web');
  assert.equal(snapshot.cpu.available, false);
  assert.match(snapshot.cpu.reason, /not supported/);
  assert.equal(snapshot.gpu.available, false);
});
