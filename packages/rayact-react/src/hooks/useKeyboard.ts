import { useSyncExternalStore } from 'react';
import {
  getKeyboardSnapshot,
  getServerKeyboardSnapshot,
  subscribeInsets,
} from './insetsStore.js';

export interface KeyboardInsets {
  visible: boolean;
  height: number;
  duration: number;
  /** 0..1 progress of the current keyboard-frame transition. */
  progress: number;
}

export function useKeyboard(): KeyboardInsets {
  return useSyncExternalStore(
    subscribeInsets,
    getKeyboardSnapshot,
    getServerKeyboardSnapshot,
  );
}
