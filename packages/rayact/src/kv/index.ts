import { invokeSync } from '@rayact/shared';

const enc = new TextEncoder();
const dec = new TextDecoder();
// invokeSync uses the shared-slab fast path when the host provides it (no arg
// copy, no result ArrayBuffer allocation). Results are decoded immediately, so
// the view-until-next-invoke contract is satisfied.
const invoke = (method: string, bytes = new Uint8Array()) => invokeSync('kv', method, bytes);

export const KV = {
  set(key: string, value: string): void {
    const keyBytes = enc.encode(key);
    const valueBytes = enc.encode(value);
    const input = new Uint8Array(4 + keyBytes.length + valueBytes.length);
    new DataView(input.buffer).setUint32(0, keyBytes.length, true);
    input.set(keyBytes, 4);
    input.set(valueBytes, 4 + keyBytes.length);
    invoke('set', input);
  },
  get(key: string): string | undefined {
    const result = invoke('get', enc.encode(key));
    return !result.length ? undefined : dec.decode(result);
  },
  delete(key: string): void { invoke('delete', enc.encode(key)); },
  has(key: string): boolean {
    const result = invoke('has', enc.encode(key));
    return result[0] === 1;
  },
  clear(): void { invoke('clear'); }
};
