import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
const decoder = new TextDecoder();
globalThis.__rayact_invoke = (name, method, buffer = new ArrayBuffer(0)) => {
  assert.equal(name, 'kv');
  const bytes = new Uint8Array(buffer);
  if (method === 'set') {
    const keyLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    values.set(decoder.decode(bytes.subarray(4, 4 + keyLength)), decoder.decode(bytes.subarray(4 + keyLength)));
    return new ArrayBuffer(0);
  }
  if (method === 'get') {
    const value = values.get(decoder.decode(bytes));
    return value === undefined ? new ArrayBuffer(0) : new TextEncoder().encode(value).buffer;
  }
  return new ArrayBuffer(0);
};

const { KV } = await import('../../dist/kv/index.js');

test('KV wrapper matches the built-in module raw-value protocol', () => {
  KV.set('probe', 'kv-ok');
  assert.equal(KV.get('probe'), 'kv-ok');
  assert.equal(KV.get('missing'), undefined);
});
