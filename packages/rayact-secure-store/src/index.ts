/**
 * @rayact/secure-store — expo-secure-store-style async API over the
 * librayact_secure_store native plugin (bus module "secure-store"). Backed by
 * the OS Keychain on macOS and an app-private store elsewhere. Reaches native
 * via the global __rayact_invoke_async, so user code needs no native rebuild.
 */

declare const __rayact_invoke_async: (
  name: string,
  method: string,
  args?: ArrayBufferLike
) => Promise<ArrayBuffer>;

const MODULE = 'secure-store';
const enc = new TextEncoder();
const dec = new TextDecoder();

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Store a value securely under `key`. */
export async function setItemAsync(key: string, value: string): Promise<void> {
  const keyBytes = enc.encode(key);
  const valBytes = enc.encode(value);
  const args = concat([u32le(keyBytes.length), keyBytes, valBytes]);
  await __rayact_invoke_async(MODULE, 'setItem', args.buffer);
}

/** Read a securely stored value, or null when absent. */
export async function getItemAsync(key: string): Promise<string | null> {
  const res = new Uint8Array(
    await __rayact_invoke_async(MODULE, 'getItem', enc.encode(key).buffer)
  );
  if (res.length === 0 || res[0] === 0) return null;
  return dec.decode(res.subarray(1));
}

/** Delete a securely stored value. */
export async function deleteItemAsync(key: string): Promise<void> {
  await __rayact_invoke_async(MODULE, 'deleteItem', enc.encode(key).buffer);
}

export default { setItemAsync, getItemAsync, deleteItemAsync };
