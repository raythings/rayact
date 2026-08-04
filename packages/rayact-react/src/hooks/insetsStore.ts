import type { KeyboardInsets } from './useKeyboard.js';
import type { SafeAreaInsets } from './useSafeAreaInsets.js';

const defaultKeyboard: KeyboardInsets = { visible: false, height: 0, duration: 250, progress: 1 };
const defaultSafeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

let cachedKeyboard: KeyboardInsets = defaultKeyboard;
let cachedSafeArea: SafeAreaInsets = defaultSafeArea;

const insetsListeners = new Set<() => void>();
let listenerInstalled = false;
let keyboardFrame: number | null = null;

function readKeyboardRaw(): KeyboardInsets {
  const globalObj = globalThis as { __rayactKeyboardInsets?: Partial<KeyboardInsets> };
  const snapshot = globalObj.__rayactKeyboardInsets;
  if (!snapshot) return defaultKeyboard;
  return {
    visible: !!snapshot.visible,
    height: typeof snapshot.height === 'number' ? snapshot.height : 0,
    duration: typeof snapshot.duration === 'number' ? snapshot.duration : 250,
    progress: typeof snapshot.progress === 'number' ? snapshot.progress : 1,
  };
}

function readSafeAreaRaw(): SafeAreaInsets {
  const globalObj = globalThis as { __rayactSafeAreaInsets?: Partial<SafeAreaInsets> };
  const snapshot = globalObj.__rayactSafeAreaInsets;
  if (!snapshot) return defaultSafeArea;
  return {
    top: typeof snapshot.top === 'number' ? snapshot.top : 0,
    right: typeof snapshot.right === 'number' ? snapshot.right : 0,
    bottom: typeof snapshot.bottom === 'number' ? snapshot.bottom : 0,
    left: typeof snapshot.left === 'number' ? snapshot.left : 0,
  };
}

function sameKeyboard(a: KeyboardInsets, b: KeyboardInsets) {
  return a.visible === b.visible && a.height === b.height && a.duration === b.duration && a.progress === b.progress;
}

function sameSafeArea(a: SafeAreaInsets, b: SafeAreaInsets) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

export function getKeyboardSnapshot(): KeyboardInsets {
  if (!listenerInstalled) {
    const initial = readKeyboardRaw();
    const next = { ...initial, progress: 1 };
    if (!sameKeyboard(next, cachedKeyboard)) cachedKeyboard = next;
  }
  return cachedKeyboard;
}

export function getSafeAreaSnapshot(): SafeAreaInsets {
  const next = readSafeAreaRaw();
  if (sameSafeArea(next, cachedSafeArea)) return cachedSafeArea;
  cachedSafeArea = next;
  return cachedSafeArea;
}

export function getServerKeyboardSnapshot(): KeyboardInsets {
  return defaultKeyboard;
}

export function getServerSafeAreaSnapshot(): SafeAreaInsets {
  return defaultSafeArea;
}

export function ensureInsetsListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  const globalObj = globalThis as { __rayactOnKeyboardInsetsChange?: () => void };
  globalObj.__rayactOnKeyboardInsetsChange = () => {
    const next = readKeyboardRaw();
    getSafeAreaSnapshot();
    if (keyboardFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(keyboardFrame);
      keyboardFrame = null;
    }
    const from = cachedKeyboard.height;
    const duration = Math.max(0, next.duration);
    const notify = () => {
      for (const listener of insetsListeners) listener();
    };
    if (duration === 0 || typeof requestAnimationFrame !== 'function' || from === next.height) {
      cachedKeyboard = { ...next, progress: 1 };
      notify();
      return;
    }
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    cachedKeyboard = { ...next, height: from, progress: 0 };
    notify();
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      // UIKit and WindowInsetsAnimation default curves are both visually
      // approximated by smoothstep when a host does not publish per-frame data.
      const eased = progress * progress * (3 - 2 * progress);
      cachedKeyboard = {
        ...next,
        height: from + (next.height - from) * eased,
        progress,
      };
      notify();
      keyboardFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    keyboardFrame = requestAnimationFrame(step);
  };
}

export function subscribeInsets(listener: () => void) {
  ensureInsetsListener();
  insetsListeners.add(listener);
  return () => insetsListeners.delete(listener);
}
