import type { RayactAsset, RayactGlobal } from './types.js';
import { isRayactAsset } from './assets.js';

export type FontSource = string | RayactAsset | Uint8Array | ArrayBuffer;
export interface FontOptions {
  /** Unicode code points to rasterize. Omit to use Rayact's default glyph set. */
  codepoints?: number[];
}

async function resolveBytesOrPath(source: FontSource): Promise<string | Uint8Array> {
  if (typeof source === 'string') return source; // treated as a native filesystem path
  if (isRayactAsset(source)) return source.bytes();
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return source;
}

function getGlobal(): RayactGlobal {
  return globalThis as RayactGlobal;
}

/**
 * Register a custom font family, loadable from a bundled asset, raw bytes, or
 * a native filesystem path. Reference `name` in `style.text.fontFamily`.
 */
export async function loadFont(name: string, source: FontSource, options?: FontOptions): Promise<void> {
  const g = getGlobal();
  if (typeof g.loadFont !== 'function') {
    throw new Error('loadFont: native bridge is missing loadFont() — is the engine up to date?');
  }
  const resolved = await resolveBytesOrPath(source);
  g.loadFont(name, resolved, options);
}

export interface IconSetVariants {
  outlined?: FontSource;
  filled?: FontSource;
  /** Single-style icon fonts (e.g. a custom brand icon font) that don't distinguish fill. */
  regular?: FontSource;
}

/**
 * Register a named icon set: a name -> codepoint table plus one or more font
 * variants ("outlined"/"filled"/"regular"). Use with `<Icon name="x" set="mySet" />`.
 * Calling this for the built-in "material" set merges additively into the
 * default table instead of replacing it.
 */
export async function loadIcons(
  setName: string,
  nameToCodepoint: Record<string, number>,
  variants: IconSetVariants
): Promise<void> {
  const g = getGlobal();
  if (typeof g.loadIcons !== 'function') {
    throw new Error('loadIcons: native bridge is missing loadIcons() — is the engine up to date?');
  }
  const resolvedVariants: Record<string, string | Uint8Array> = {};
  for (const [style, src] of Object.entries(variants)) {
    if (src !== undefined) resolvedVariants[style] = await resolveBytesOrPath(src);
  }
  g.loadIcons(setName, nameToCodepoint, resolvedVariants);
}

/**
 * Register a custom fallback emoji font (CBDT/CBLC). Only used when no OS
 * emoji rasterizer is available (Linux/Windows/web) — never overrides a
 * platform's native emoji rendering (Android, macOS/iOS). Resolves to which
 * backend ends up active.
 */
export async function loadEmoji(source: FontSource): Promise<'os' | 'bundled' | 'none'> {
  const g = getGlobal();
  if (typeof g.loadEmoji !== 'function') {
    throw new Error('loadEmoji: native bridge is missing loadEmoji() — is the engine up to date?');
  }
  const resolved = await resolveBytesOrPath(source);
  return g.loadEmoji(resolved);
}
