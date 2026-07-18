export type ReloadState = 'idle' | 'fetching' | 'restarting' | 'running' | 'failed';

let state: ReloadState = 'idle';
const listeners = new Set<(state: ReloadState) => void>();

export function getReloadState(): ReloadState {
  return state;
}

export function subscribeReloadState(listener: (state: ReloadState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @internal Host integrations use this to publish the stable lifecycle. */
export function setReloadState(next: ReloadState): void {
  if (state === next) return;
  state = next;
  for (const listener of [...listeners]) listener(state);
}
