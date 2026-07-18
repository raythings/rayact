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
}

export function useKeyboard(): KeyboardInsets {
  return useSyncExternalStore(
    subscribeInsets,
    getKeyboardSnapshot,
    getServerKeyboardSnapshot,
  );
}
