import { transform, transformSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Minify a stylesheet before it reaches the engine.
 *
 * CSS is not debugged the way JS is — the engine parses it into a rule table
 * and there is no CSS inspector on the native targets — so minifying in dev as
 * well as release costs nothing in developer experience and shrinks both the
 * dev-server payload and the bundled app.
 *
 * esbuild is already a dependency of this package (it backs the Vite pipeline),
 * so this adds no new install weight. Its CSS minifier is deliberately
 * conservative: it collapses whitespace and comments, shortens hex colors
 * (`#ffffff` -> `#fff`, which `color_parse.cpp` expands) and drops redundant
 * semicolons. It does not invent syntax the hand-rolled parser in
 * `native/desktop/css_bridge.cpp` cannot read.
 *
 * Failure is never fatal: a stylesheet esbuild rejects is passed through
 * untouched so a syntax quirk can only cost size, never correctness.
 */
export interface MinifyCssResult {
  css: string;
  originalBytes: number;
  minifiedBytes: number;
  /** Set when the input was returned unchanged, with the reason. */
  skipped?: string;
}

/** Escape hatch: `RAYACT_NO_CSS_MINIFY=1` ships stylesheets verbatim. */
function minifyDisabled(): boolean {
  const flag = process.env.RAYACT_NO_CSS_MINIFY;
  return !!flag && flag !== '0' && flag.toLowerCase() !== 'false';
}

export async function minifyCssText(css: string, sourceFile?: string): Promise<MinifyCssResult> {
  const originalBytes = Buffer.byteLength(css, 'utf8');
  if (minifyDisabled()) {
    return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'RAYACT_NO_CSS_MINIFY' };
  }
  if (!css.trim()) {
    return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'empty' };
  }
  try {
    const result = await transform(css, {
      loader: 'css',
      minify: true,
      // Target the oldest syntax level the engine understands. Without this
      // esbuild may lower or rewrite modern color/nesting syntax that
      // ParseCssColor already handles natively (oklch, color-mix, lab).
      target: 'esnext',
      legalComments: 'none',
      sourcefile: sourceFile
    });
    const out = result.code;
    const minifiedBytes = Buffer.byteLength(out, 'utf8');
    // Guard against a pathological result (should not happen, but a minifier
    // that grows the file is a bug we would rather not ship).
    if (minifiedBytes >= originalBytes) {
      return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'no size win' };
    }
    return { css: out, originalBytes, minifiedBytes };
  } catch (error) {
    return {
      css,
      originalBytes,
      minifiedBytes: originalBytes,
      skipped: `esbuild rejected the stylesheet: ${(error as Error)?.message ?? String(error)}`
    };
  }
}

/** Sync variant for call sites that cannot await (Vite's `load` hook). */
export function minifyCssTextSync(css: string, sourceFile?: string): MinifyCssResult {
  const originalBytes = Buffer.byteLength(css, 'utf8');
  if (minifyDisabled()) {
    return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'RAYACT_NO_CSS_MINIFY' };
  }
  if (!css.trim()) {
    return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'empty' };
  }
  try {
    // Statically imported: this package compiles to ESM, where a `require()`
    // call throws ReferenceError. That failure was caught by the handler below
    // and silently returned the stylesheet unminified.
    const out = transformSync(css, {
      loader: 'css',
      minify: true,
      target: 'esnext',
      legalComments: 'none',
      sourcefile: sourceFile
    }).code;
    const minifiedBytes = Buffer.byteLength(out, 'utf8');
    if (minifiedBytes >= originalBytes) {
      return { css, originalBytes, minifiedBytes: originalBytes, skipped: 'no size win' };
    }
    return { css: out, originalBytes, minifiedBytes };
  } catch (error) {
    return {
      css,
      originalBytes,
      minifiedBytes: originalBytes,
      skipped: `esbuild rejected the stylesheet: ${(error as Error)?.message ?? String(error)}`
    };
  }
}

// ─── file-level cache ────────────────────────────────────────────────────────
// Minifying is ~1ms for a 24KB stylesheet, but `rayactCssInlineModule` used to
// re-read and re-minify on *every* module request, so a dev client walking the
// graph paid it repeatedly. Cache by (path, mtime, size): the dev server primes
// this at launch and refreshes it from the file watcher, so a request should
// always be a hit. The mtime/size check is the backstop for anything that
// changes without a watcher event.

interface CachedCss {
  mtimeMs: number;
  size: number;
  result: MinifyCssResult;
}

const cache = new Map<string, CachedCss>();

function statOrNull(file: string): fs.Stats | null {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

/**
 * Minified text for a stylesheet on disk, from cache when the file is unchanged.
 * Returns null only when the file cannot be read.
 */
export function getMinifiedCssFile(file: string): MinifyCssResult | null {
  const key = path.resolve(file);
  const stat = statOrNull(key);
  if (!stat) return null;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.result;
  let text: string;
  try {
    text = fs.readFileSync(key, 'utf8');
  } catch {
    return null;
  }
  const result = minifyCssTextSync(text, key);
  cache.set(key, { mtimeMs: stat.mtimeMs, size: stat.size, result });
  return result;
}

/** Re-minify now, ahead of any request. Called from the dev server's watcher. */
export function refreshMinifiedCssFile(file: string): MinifyCssResult | null {
  cache.delete(path.resolve(file));
  return getMinifiedCssFile(file);
}

export function forgetMinifiedCssFile(file: string): void {
  cache.delete(path.resolve(file));
}

export function isCssFile(file: string): boolean {
  return /\.css$/i.test(file);
}

// `rayact-assets` is deliberately NOT skipped: it is staging output, but it is
// also where projects put stylesheets they fetch at runtime through
// /rayact/raw/ (e.g. a Tailwind-built app.css), and those are exactly the ones
// worth having minified before the first request.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.xcode-derived',
  '.gradle', '.idea', 'Pods', '__pycache__'
]);

/**
 * Find stylesheets worth priming at launch. Deliberately bounded — this runs on
 * the startup path, and a miss only costs one lazy minify later.
 */
export function discoverProjectCssFiles(root: string, limit = 200): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (found.length >= limit || depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && isCssFile(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}

/** Minify every discovered stylesheet up front. Returns what it warmed. */
export function primeCssCache(files: string[]): { primed: number; originalBytes: number; minifiedBytes: number } {
  let primed = 0;
  let originalBytes = 0;
  let minifiedBytes = 0;
  for (const file of files) {
    const result = getMinifiedCssFile(file);
    if (!result) continue;
    primed += 1;
    originalBytes += result.originalBytes;
    minifiedBytes += result.minifiedBytes;
  }
  return { primed, originalBytes, minifiedBytes };
}
