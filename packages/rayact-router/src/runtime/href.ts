import { parseDynamicSegment } from '../manifest/parse.js';

/**
 * A navigation target: '/profile/42?tab=posts' or
 * { pathname: '/profile/[id]', params: { id: 42, tab: 'posts' } }.
 */
export type Href = string | { pathname: string; params?: Record<string, unknown> };

/**
 * Resolve an Href to a concrete path string. Dynamic pathname segments are
 * interpolated from params; leftover params become the query string.
 */
export function resolveHref(href: Href): string {
  if (typeof href === 'string') return normalizePath(href);
  const params = { ...(href.params ?? {}) };
  const segments = normalizePath(href.pathname)
    .split('/')
    .map(segment => {
      const dynamic = parseDynamicSegment(segment);
      if (!dynamic) return segment;
      const value = params[dynamic.name];
      delete params[dynamic.name];
      if (value === undefined || value === null) return segment;
      return dynamic.deep
        ? (Array.isArray(value) ? value : [value]).map(part => encodeURIComponent(String(part))).join('/')
        : encodeURIComponent(String(value));
    });
  const query = buildQueryString(params);
  return segments.join('/') + query;
}

function normalizePath(path: string): string {
  let normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
