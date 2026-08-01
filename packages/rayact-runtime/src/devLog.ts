/**
 * Dev-time lifecycle chatter that should not reach the app's console.
 *
 * HMR connect/disconnect notices, transport selection and revision polling are
 * useful when debugging the dev client itself, but on a device they land in the
 * same console the developer is using to read their own app's logs, and the
 * dev server already records the same events server-side.
 *
 * Set `globalThis.__RAYACT_DEV_VERBOSE__ = true` (or run the dev server with
 * verbose logging) to get them back. Warnings and errors are never routed
 * through here — a failed HMR update or a dropped socket still logs normally.
 */
export function devVerboseEnabled(globalObject: typeof globalThis | Record<string, unknown>): boolean {
  return !!(globalObject as Record<string, unknown>).__RAYACT_DEV_VERBOSE__;
}

export function devInfo(
  globalObject: typeof globalThis | Record<string, unknown>,
  ...args: unknown[]
): void {
  if (!devVerboseEnabled(globalObject)) return;
  const console = (globalObject as { console?: { info?: (...a: unknown[]) => void } }).console;
  console?.info?.(...args);
}
