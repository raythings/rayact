declare const __rayact_invoke: (
  name: string,
  method: string,
  args?: ArrayBufferLike
) => ArrayBuffer;

const enc = new TextEncoder();
const dec = new TextDecoder();
const invoke = (method: string, bytes = new Uint8Array()) =>
  new Uint8Array(__rayact_invoke('kv', method, bytes.buffer));

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
