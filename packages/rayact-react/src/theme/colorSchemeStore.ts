import { useSyncExternalStore } from 'react';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

type ColorSchemeListener = () => void;

let isDark = true;
let preference: ColorSchemePreference = 'system';
const listeners = new Set<ColorSchemeListener>();

function readInitialIsDark(): boolean {
  const g = globalThis as {
    __rayactGetColorScheme?: () => { isDark?: boolean };
  };
  if (typeof g.__rayactGetColorScheme === 'function') {
    try {
      const scheme = g.__rayactGetColorScheme();
      if (typeof scheme?.isDark === 'boolean') return scheme.isDark;
    } catch {
      // use default
    }
  }
  return true;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: ColorSchemeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return isDark;
}

function getServerSnapshot(): boolean {
  return true;
}

function getPreferenceSnapshot(): ColorSchemePreference {
  return preference;
}

let storeInitialized = false;

export function initColorSchemeStore(): void {
  if (storeInitialized) return;
  storeInitialized = true;
  isDark = readInitialIsDark();
  preference = 'system';

  const g = globalThis as {
    onColorSchemeChange?: (dark: boolean) => void;
  };
  g.onColorSchemeChange = (dark: boolean) => {
    if (isDark !== dark) {
      isDark = dark;
      emit();
    }
  };
}

export function useColorScheme(): boolean {
  initColorSchemeStore();
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useColorSchemePreference(): ColorSchemePreference {
  initColorSchemeStore();
  return useSyncExternalStore(subscribe, getPreferenceSnapshot, () => 'system' as ColorSchemePreference);
}

export function getColorSchemeSnapshot(): boolean {
  initColorSchemeStore();
  return isDark;
}

export function getColorSchemePreferenceSnapshot(): ColorSchemePreference {
  initColorSchemeStore();
  return preference;
}

export function setColorSchemePreference(next: ColorSchemePreference): void {
  initColorSchemeStore();
  preference = next;
  const g = globalThis as {
    __rayactSetColorScheme?: (mode: ColorSchemePreference) => void;
  };
  g.__rayactSetColorScheme?.(next);
  emit();
}

export function cycleColorSchemePreference(): ColorSchemePreference {
  initColorSchemeStore();
  const order: ColorSchemePreference[] = ['system', 'light', 'dark'];
  const idx = order.indexOf(preference);
  const next = order[(idx + 1) % order.length];
  setColorSchemePreference(next);
  return next;
}
