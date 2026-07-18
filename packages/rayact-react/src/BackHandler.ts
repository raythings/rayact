// BackHandler — React Native-compatible hardware-back API on rayact.
//
// The native Android host delivers "hardwareBackPress" events into the
// engine's JS pump (see nativeOnBackPressed in jni_bridge.cpp + the
// drain below). Listeners are stored newest-first; the first one that
// returns `true` consumes the event. If none handle it, the host falls
// back to finishing the Activity (so the OS back gesture at the root
// still works).
//
// Usage:
//   const sub = BackHandler.addEventListener('hardwareBackPress', () => {
//     if (canGoBack) { navigation.goBack(); return true; }
//     return false;
//   });
//   // later:
//   sub.remove();

import { useEffect, useRef } from 'react';

type HardwareBackPressListener = () => boolean;
type Subscription = { remove(): void };

const listeners: HardwareBackPressListener[] = [];

declare const __rayactHostExitApp: (() => void) | undefined;

type GlobalBackHooks = typeof globalThis & {
  __rayactHandleNavigationBackPress?: () => boolean;
};

const BackHandler = {
  addEventListener(
    _eventName: 'hardwareBackPress',
    cb: HardwareBackPressListener,
  ): Subscription {
    listeners.unshift(cb);
    let removed = false;
    return {
      remove() {
        if (removed) return;
        removed = true;
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  },
  exitApp(): void {
    if (typeof __rayactHostExitApp === 'function') {
      __rayactHostExitApp();
    }
  },
};

/**
 * Drain pending hardware-back events. Called by the engine's JS pump
 * (jni_bridge.cpp pumps `g_pendingBackPress` into here on the render
 * thread under g_engineMutex). Returns true if some listener consumed
 * the press; the host only falls back to finishing the Activity when
 * this returns false.
 *
 * Exposed as a global so the C++ side can call it without owning a
 * reference to this module.
 */
function drainBackPresses(): boolean {
  const navigationBack = (globalThis as GlobalBackHooks).__rayactHandleNavigationBackPress;
  if (typeof navigationBack === 'function') {
    try {
      if (navigationBack()) return true;
    } catch (err) {
      const msg = err && (err as { message?: string }).message;
      // eslint-disable-next-line no-console
      console.warn('[BackHandler] navigation listener threw:', msg ?? err);
    }
  }

  for (const l of listeners) {
    try {
      if (l()) return true;
    } catch (err) {
      // A buggy listener must not stop the chain — log and continue.
      const msg = err && (err as { message?: string }).message;
      // eslint-disable-next-line no-console
      console.warn('[BackHandler] listener threw:', msg ?? err);
    }
  }
  return false;
}

(globalThis as unknown as { __rayactDrainBackPress?: () => boolean }).__rayactDrainBackPress =
  drainBackPresses;

/**
 * React hook for components that want to register a hardware-back listener
 * for their lifetime. The subscription is removed automatically on unmount.
 *
 *   useBackHandler(() => {
 *     if (someCondition) { navigation.goBack(); return true; }
 *     return false;
 *   });
 */
export function useBackHandler(handler: () => boolean): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => ref.current());
    return () => sub.remove();
  }, []);
}

export { BackHandler };
export type { Subscription as BackHandlerSubscription };
