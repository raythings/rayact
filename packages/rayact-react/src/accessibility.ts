import { useSyncExternalStore } from 'react';

type AccessibilityGlobal = typeof globalThis & {
  __rayactSetAccessibilityFocus?: (nodeId: number) => void;
  __rayactGetReducedMotion?: () => boolean;
  __rayactSubscribeReducedMotion?: (listener: (reduced: boolean) => void) => (() => void) | void;
  matchMedia?: (query: string) => {
    matches: boolean;
    addEventListener?(type: 'change', listener: () => void): void;
    removeEventListener?(type: 'change', listener: () => void): void;
  };
};

type AccessibilityTarget = number | { id?: number; node?: { id?: number } } | null;

export function setAccessibilityFocus(target: AccessibilityTarget): void {
  const nodeId = typeof target === 'number' ? target : target?.node?.id ?? target?.id;
  if (typeof nodeId !== 'number') throw new TypeError('setAccessibilityFocus requires a mounted Rayact node or node id');
  const host = globalThis as AccessibilityGlobal;
  if (typeof host.__rayactSetAccessibilityFocus !== 'function') {
    throw new Error('Programmatic accessibility focus is not supported by this host');
  }
  host.__rayactSetAccessibilityFocus(nodeId);
}

const media = () => (globalThis as AccessibilityGlobal).matchMedia?.('(prefers-reduced-motion: reduce)');
const getReducedMotion = () => {
  const host = globalThis as AccessibilityGlobal;
  return host.__rayactGetReducedMotion?.() ?? media()?.matches ?? false;
};
const subscribeReducedMotion = (listener: () => void) => {
  const host = globalThis as AccessibilityGlobal;
  const nativeUnsubscribe = host.__rayactSubscribeReducedMotion?.(() => listener());
  if (typeof nativeUnsubscribe === 'function') return nativeUnsubscribe;
  const query = media();
  query?.addEventListener?.('change', listener);
  return () => query?.removeEventListener?.('change', listener);
};

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}
