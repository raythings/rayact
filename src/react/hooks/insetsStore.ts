import type { KeyboardInsets } from './useKeyboard';
import type { SafeAreaInsets } from './useSafeAreaInsets';

const defaultKeyboard: KeyboardInsets = { visible: false, height: 0, duration: 250 };
const defaultSafeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

let cachedKeyboard: KeyboardInsets = defaultKeyboard;
let cachedSafeArea: SafeAreaInsets = defaultSafeArea;

const insetsListeners = new Set<() => void>();
let listenerInstalled = false;

function readKeyboardRaw(): KeyboardInsets {
  const globalObj = globalThis as { __rayactKeyboardInsets?: Partial<KeyboardInsets> };
  const snapshot = globalObj.__rayactKeyboardInsets;
  if (!snapshot) return defaultKeyboard;
  return {
    visible: !!snapshot.visible,
    height: typeof snapshot.height === 'number' ? snapshot.height : 0,
    duration: typeof snapshot.duration === 'number' ? snapshot.duration : 250,
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
  return a.visible === b.visible && a.height === b.height && a.duration === b.duration;
}

function sameSafeArea(a: SafeAreaInsets, b: SafeAreaInsets) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

export function getKeyboardSnapshot(): KeyboardInsets {
  const next = readKeyboardRaw();
  if (sameKeyboard(next, cachedKeyboard)) return cachedKeyboard;
  cachedKeyboard = next;
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
    getKeyboardSnapshot();
    getSafeAreaSnapshot();
    for (const listener of insetsListeners) listener();
  };
}

export function subscribeInsets(listener: () => void) {
  ensureInsetsListener();
  insetsListeners.add(listener);
  return () => insetsListeners.delete(listener);
}
