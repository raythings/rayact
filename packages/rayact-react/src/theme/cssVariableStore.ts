import { useSyncExternalStore } from 'react';

import { useColorScheme } from './colorSchemeStore.js';

/**
 * CSS custom properties (`--brand`, `--bg`, …) declared in imported stylesheets,
 * readable and overridable at runtime.
 *
 * Values set here win over the stylesheet's own declarations (including the
 * `@media (prefers-color-scheme)` / `.dark` variants) until they are cleared.
 * Setting a variable re-resolves every mounted node's `className` styles
 * natively and re-renders components subscribed through `useCSSVariable`.
 */

type CSSVariableListener = () => void;

const listeners = new Set<CSSVariableListener>();

/** Bumped on every change so `useSyncExternalStore` sees a new snapshot. */
let version = 0;

type CSSVariableGlobals = {
  __rayactGetCSSVariable?: (name: string) => string | undefined;
  __rayactSetCSSVariable?: (name: string, value: string | null) => void;
  __rayactSetCSSVariables?: (values: Record<string, string | null>) => void;
  __rayactResetCSSVariables?: () => void;
  onCSSVariablesChange?: () => void;
};

function globals(): CSSVariableGlobals {
  return globalThis as CSSVariableGlobals;
}

function emit(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: CSSVariableListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  return version;
}

let storeInitialized = false;

function initCSSVariableStore(): void {
  if (storeInitialized) return;
  storeInitialized = true;
  // The native side calls this after any variable change, including ones made
  // outside this module (e.g. a stylesheet reload).
  globals().onCSSVariablesChange = emit;
}

/**
 * Read a CSS variable's resolved value for the active colour scheme.
 * Chained references (`--surface: var(--bg)`) are resolved to a literal value.
 * Returns `undefined` when the variable is not declared.
 */
export function getCSSVariable(name: string): string | undefined {
  initCSSVariableStore();
  return globals().__rayactGetCSSVariable?.(name);
}

/** Set one CSS variable. Passing `null` clears the override. */
export function setCSSVariable(name: string, value: string | null): void {
  initCSSVariableStore();
  globals().__rayactSetCSSVariable?.(name, value);
  emit();
}

/**
 * Set several CSS variables in one pass — one native restyle instead of one per
 * variable, so prefer this when applying a whole theme.
 */
export function setCSSVariables(values: Record<string, string | null>): void {
  initCSSVariableStore();
  globals().__rayactSetCSSVariables?.(values);
  emit();
}

/** Drop every runtime override, reverting to the stylesheet's own values. */
export function resetCSSVariables(): void {
  initCSSVariableStore();
  globals().__rayactResetCSSVariables?.();
  emit();
}

/**
 * Subscribe to a CSS variable. Re-renders when the variable changes or the
 * colour scheme flips (which can select a different `@media` variant).
 */
export function useCSSVariable(name: string): string | undefined {
  initCSSVariableStore();
  useSyncExternalStore(subscribe, getVersion, () => 0);
  // A colour-scheme flip can select a different @media variant for the same
  // variable, and that path notifies the theme store rather than this one.
  useColorScheme();
  return getCSSVariable(name);
}
