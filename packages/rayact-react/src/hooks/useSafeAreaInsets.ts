import { useSyncExternalStore } from 'react';
import {
  getSafeAreaSnapshot,
  getServerSafeAreaSnapshot,
  subscribeInsets,
} from './insetsStore.js';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function useSafeAreaInsets(): SafeAreaInsets {
  return useSyncExternalStore(
    subscribeInsets,
    getSafeAreaSnapshot,
    getServerSafeAreaSnapshot,
  );
}
