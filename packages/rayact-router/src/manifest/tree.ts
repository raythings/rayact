import {
  collectDynamicSegments,
  compareRouteNames,
  isRouteFile,
  parseRouteFile,
  type ParsedRouteFile,
} from './parse.js';
import type { RouteContext, RouteModule, RouteNode } from './types.js';

/**
 * Build the nested RouteNode tree from the flat virtual:rayact-routes context.
 *
 * Every directory that has a _layout.tsx becomes a nesting level; files in
 * directories without one are hoisted into the nearest ancestor layout under a
 * slash-joined route name ('profile/[id]') — Expo Router semantics. The root
 * always has a layout node (implicit default Stack when app/_layout.tsx is
 * missing).
 */
export function buildRouteTree(ctx: RouteContext): RouteNode {
  const files = Object.keys(ctx)
    .filter(isRouteFile)
    .sort()
    .map(parseRouteFile);

  const layoutsByDir = new Map<string, ParsedRouteFile>();
  for (const file of files) {
    if (file.type === 'layout') layoutsByDir.set(file.dir.join('/'), file);
  }

  const nodesByDir = new Map<string, RouteNode>();
  const makeLayoutNode = (dirKey: string): RouteNode => {
    const existing = nodesByDir.get(dirKey);
    if (existing) return existing;
    const file = layoutsByDir.get(dirKey);
    const node: RouteNode = {
      routeName: '',
      contextKey: file?.contextKey ?? '',
      type: 'layout',
      dynamic: [],
      children: [],
      loadRoute: file ? () => loadModule(ctx, file.contextKey) : null,
    };
    nodesByDir.set(dirKey, node);
    return node;
  };

  const root = makeLayoutNode('');

  /** Deepest ancestor dir (or the dir itself) that has a layout. Root always qualifies. */
  const nearestLayoutDir = (dir: string[]): string => {
    for (let i = dir.length; i >= 0; i--) {
      const key = dir.slice(0, i).join('/');
      if (key === '' || layoutsByDir.has(key)) return key;
    }
    return '';
  };

  // Attach explicit non-root layouts to their nearest ancestor layout.
  const layoutDirs = [...layoutsByDir.keys()].filter(key => key !== '').sort();
  for (const dirKey of layoutDirs) {
    const dir = dirKey.split('/');
    const parentKey = nearestLayoutDir(dir.slice(0, -1));
    const parent = makeLayoutNode(parentKey);
    const node = makeLayoutNode(dirKey);
    node.routeName = relativeRouteName(parentKey, dirKey);
    node.dynamic = collectDynamicSegments(node.routeName);
    parent.children.push(node);
  }

  // Attach route/not-found leaves.
  for (const file of files) {
    if (file.type === 'layout') continue;
    const parentKey = nearestLayoutDir(file.dir);
    const parent = makeLayoutNode(parentKey);
    const fullName = [...file.dir, file.base].join('/');
    const routeName = relativeRouteName(parentKey, fullName);
    parent.children.push({
      routeName,
      contextKey: file.contextKey,
      type: file.type === 'notFound' ? 'notFound' : 'route',
      dynamic: collectDynamicSegments(routeName),
      children: [],
      loadRoute: () => loadModule(ctx, file.contextKey),
    });
  }

  for (const node of nodesByDir.values()) {
    node.children.sort((a, b) => compareRouteNames(a.routeName, b.routeName));
  }
  return root;
}

function relativeRouteName(parentDirKey: string, fullKey: string): string {
  return parentDirKey === '' ? fullKey : fullKey.slice(parentDirKey.length + 1);
}

function loadModule(ctx: RouteContext, contextKey: string): RouteModule {
  const mod = ctx[contextKey];
  if (!mod) throw new Error(`Route module missing from manifest: ${contextKey}`);
  return mod;
}

/** Depth-first search for a node by its slash-joined route-name chain. */
export function findNode(root: RouteNode, names: string[]): RouteNode | null {
  let node: RouteNode | null = root;
  for (const name of names) {
    node = node?.children.find(child => child.routeName === name) ?? null;
    if (!node) return null;
  }
  return node;
}

/**
 * The route the navigator should start on when nothing else selects one:
 * layout unstable_settings.initialRouteName wins, else first non-not-found
 * child in precedence order (index sorts first).
 */
export function initialRouteNameFor(node: RouteNode): string | undefined {
  const configured = node.loadRoute?.()?.unstable_settings?.initialRouteName;
  if (typeof configured === 'string' && node.children.some(c => c.routeName === configured)) {
    return configured;
  }
  return node.children.find(child => child.type !== 'notFound')?.routeName;
}
