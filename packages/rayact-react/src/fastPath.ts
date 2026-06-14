import type { HostNode, HostNodeType } from '@rayact/runtime';
import { perfLogBatch } from './perfLog';

export type RayactMutationOp =
  | { op: 'appendChild'; parentId: number; childId: number }
  | { op: 'removeChild'; parentId: number; childId: number }
  | { op: 'insertBefore'; parentId: number; childId: number; beforeChildId: number }
  | { op: 'disposeNode'; nodeId: number }
  | { op: 'setRoot'; nodeId: number }
  | { op: 'setText'; nodeId: number; text: string }
  | { op: 'setValue'; nodeId: number; value: string }
  | { op: 'setStyle'; nodeId: number; style: Record<string, unknown> }
  | { op: 'setMaterialProps'; nodeId: number; component: string; props: Record<string, unknown> };

type FastPathGlobals = typeof globalThis & {
  /** Opt-in: experimental native fast path (default off — bridge is faster for most workloads). */
  __RAYACT_USE_FAST_PATH?: boolean;
  __rayactCreateNodeFast?: (type: string, props: Record<string, unknown>) => number;
  __rayactUpdateNodeFast?: (
    nodeId: number,
    type: string,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>
  ) => boolean;
  __rayactBatchMutations?: (ops: RayactMutationOp[]) => void;
  __rayactRegisterAnimatedNode?: (nodeId: number, initialStyle?: Record<string, number>) => void;
};

function fastPathEnabled(): boolean {
  return (globalThis as FastPathGlobals).__RAYACT_USE_FAST_PATH === true;
}

const OFFSETS: Record<string, number> = {
  translateX: 0,
  translateY: 1,
  scale: 2,
  opacity: 3,
  rotation: 4,
};

function animatedStyleSnapshot(style: Record<string, unknown>): Record<string, number> {
  const animated: Record<string, number> = {};
  for (const key of Object.keys(OFFSETS)) {
    const value = style[key];
    if (typeof value === 'number') animated[key] = value;
  }
  return animated;
}

export const nativeFastPath = {
  get enabled() {
    return fastPathEnabled();
  },
  get createNode() {
    return fastPathEnabled() && typeof (globalThis as FastPathGlobals).__rayactCreateNodeFast === 'function';
  },
  get updateNode() {
    return fastPathEnabled() && typeof (globalThis as FastPathGlobals).__rayactUpdateNodeFast === 'function';
  },
  get batch() {
    return fastPathEnabled() && typeof (globalThis as FastPathGlobals).__rayactBatchMutations === 'function';
  },
};

const mutationQueue: RayactMutationOp[] = [];

export function enqueueMutation(op: RayactMutationOp): void {
  if (nativeFastPath.batch) {
    mutationQueue.push(op);
  }
}

export function flushMutations(): void {
  if (!nativeFastPath.batch || mutationQueue.length === 0) return;
  const host = globalThis as FastPathGlobals;
  const ops = mutationQueue.splice(0, mutationQueue.length);
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  host.__rayactBatchMutations!(ops);
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  perfLogBatch(end - start, ops.length);
}

export function createNodeFast(type: HostNodeType, props: Record<string, unknown>): HostNode | null {
  const host = globalThis as FastPathGlobals;
  if (!nativeFastPath.createNode) return null;
  const id = host.__rayactCreateNodeFast!(type, props);
  if (typeof id !== 'number') return null;
  const animated = animatedStyleSnapshot(
    flattenStyleForAnimated(props.style, true),
  );
  if (Object.keys(animated).length > 0 && typeof host.__rayactRegisterAnimatedNode === 'function') {
    host.__rayactRegisterAnimatedNode(id, animated);
  }
  return { id, type };
}

export function updateNodeFast(
  nodeId: number,
  type: HostNodeType,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): boolean {
  const host = globalThis as FastPathGlobals;
  if (!nativeFastPath.updateNode) return false;
  try {
    return host.__rayactUpdateNodeFast!(nodeId, type, oldProps, newProps) === true;
  } catch {
    return false;
  }
}

function flattenStyleForAnimated(style: unknown, isCreate: boolean): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(s => flattenStyleForAnimated(s, isCreate)));
  }
  if (typeof style !== 'object') return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (value == null) continue;
    if (typeof value === 'object' && value !== null && 'value' in value && isCreate) {
      result[key] = (value as { value: unknown }).value;
    } else if (OFFSETS[key] !== undefined && typeof value === 'number') {
      result[key] = value;
    } else if (key !== 'transform') {
      result[key] = value;
    }
  }
  return result;
}
