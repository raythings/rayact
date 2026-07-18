import test from 'node:test';
import assert from 'node:assert/strict';

test('0.0.x storage compatibility shims re-export the standalone packages', async () => {
  const [mmkvShim, mmkv, secureStoreShim, secureStore] = await Promise.all([
    import('../../packages/rayact/dist/mmkv.js'),
    import('../../packages/rayact-mmkv/dist/index.js'),
    import('../../packages/rayact/dist/secure-store.js'),
    import('../../packages/rayact-secure-store/dist/index.js'),
  ]);
  assert.equal(mmkvShim.createMMKV, mmkv.createMMKV);
  assert.equal(mmkvShim.default, mmkv.default);
  assert.equal(secureStoreShim.setItemAsync, secureStore.setItemAsync);
  assert.equal(secureStoreShim.default, secureStore.default);
});
