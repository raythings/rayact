import type { DynamicSegment } from './types.js';

/** A single app/ file classified by its filename conventions. */
export interface ParsedRouteFile {
  contextKey: string;
  /** Directory segments above the file, e.g. ['(tabs)', 'profile']. */
  dir: string[];
  /** File base name without extension: 'index', '_layout', '[id]', '+not-found'. */
  base: string;
  type: 'route' | 'layout' | 'notFound';
}

const ROUTE_FILE_RE = /\.[cm]?[jt]sx?$/;

/** True when a manifest key names a routable file (extension + not ignored). */
export function isRouteFile(contextKey: string): boolean {
  if (!ROUTE_FILE_RE.test(contextKey)) return false;
  const parts = normalizeContextKey(contextKey).split('/');
  return parts.every(part => part !== '' && !part.startsWith('.')) &&
    !parts.some(part => part === '__tests__' || part === 'node_modules');
}

function normalizeContextKey(contextKey: string): string {
  return contextKey.replace(/^\.\//, '').replace(/\\/g, '/');
}

export function parseRouteFile(contextKey: string): ParsedRouteFile {
  const withoutExt = normalizeContextKey(contextKey).replace(ROUTE_FILE_RE, '');
  const parts = withoutExt.split('/');
  const base = parts[parts.length - 1];
  const dir = parts.slice(0, -1);
  const type: ParsedRouteFile['type'] =
    base === '_layout' ? 'layout' : base === '+not-found' ? 'notFound' : 'route';
  return { contextKey, dir, base, type };
}

export function isGroupSegment(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')') && segment.length > 2;
}

/** [id] → {name:'id', deep:false}; [...rest] → {name:'rest', deep:true}; else null. */
export function parseDynamicSegment(segment: string): DynamicSegment | null {
  if (!(segment.startsWith('[') && segment.endsWith(']') && segment.length > 2)) return null;
  const inner = segment.slice(1, -1);
  if (inner.startsWith('...')) {
    const name = inner.slice(3);
    return name ? { name, deep: true } : null;
  }
  return { name: inner, deep: false };
}

/** Dynamic params contributed by a slash-joined route name, in order. */
export function collectDynamicSegments(routeName: string): DynamicSegment[] {
  const dynamic: DynamicSegment[] = [];
  for (const segment of routeName.split('/')) {
    const parsed = parseDynamicSegment(segment);
    if (parsed) dynamic.push(parsed);
  }
  return dynamic;
}

/**
 * URL path contribution of one route-name segment:
 * groups and 'index' vanish, [id] → ':id', [...rest] → '*', static stays.
 * '+not-found' also maps to '*' (it matches anything at its level).
 */
export function segmentToPathPart(segment: string): string | null {
  if (isGroupSegment(segment)) return null;
  if (segment === 'index') return null;
  if (segment === '+not-found') return '*';
  const dynamic = parseDynamicSegment(segment);
  if (dynamic) return dynamic.deep ? '*' : `:${dynamic.name}`;
  return segment;
}

/** react-navigation `path` pattern for a slash-joined route name. */
export function routeNameToPath(routeName: string): string {
  return routeName
    .split('/')
    .map(segmentToPathPart)
    .filter((part): part is string => part !== null)
    .join('/');
}

/**
 * Child ordering inside a navigator: index first, then static (incl. groups)
 * alphabetically, then dynamic, then catch-all, then +not-found last.
 */
export function routePrecedence(routeName: string): number {
  const segments = routeName.split('/');
  const base = segments[segments.length - 1];
  if (base === '+not-found') return 4;
  let rank = 0;
  for (const segment of segments) {
    const dynamic = parseDynamicSegment(segment);
    if (dynamic?.deep) return 3;
    if (dynamic) rank = Math.max(rank, 2);
  }
  if (segments.length === 1 && base === 'index') return -1;
  return rank === 0 ? 0 : rank;
}

export function compareRouteNames(a: string, b: string): number {
  const byPrecedence = routePrecedence(a) - routePrecedence(b);
  if (byPrecedence !== 0) return byPrecedence;
  return a.localeCompare(b);
}
