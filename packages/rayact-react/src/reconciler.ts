import type { HostBridge, HostEventName, HostNodeType } from '@rayact/runtime';
import { getDefaultRuntime } from '@rayact/runtime';
import { createContext } from 'react';
import ReactReconcilerModule from 'react-reconciler';
import * as ReconcilerConstants from 'react-reconciler/constants';
import type {
  RayactContainer,
  RayactElementType,
  RayactHostInstance,
  RayactTextInstance
} from './types';
import { SharedValue } from './anim/SharedValue';
import {
  createNodeFast,
  enqueueMutation,
  flushMutations,
  nativeFastPath,
  updateNodeFast,
} from './fastPath';
import {
  allocNodeId,
  binaryEnabled,
  CREATE_PARAM_FILLED,
  CREATE_PARAM_HAS_COLOR,
  CREATE_PARAM_HAS_FILLED,
  CREATE_PARAM_HAS_SIZE,
  emitAppend,
  emitCreate,
  emitCreateParam,
  emitDispose,
  emitInsert,
  emitRemove,
  emitSetRoot,
  emitSetText,
  flushCommands,
  internString,
  styleEncSize,
} from './commandBuffer';
import { TYPE } from './protocol';

// --- host-config profiler (gated by globalThis.__RAYACT_PROF) ---------------
// Splits a commit's wall time into host-config work (these functions) vs React
// core (the rest of commit.end) vs the native flush. createInstance/appendChild
// run in React's render phase, so this also captures mount cost that commit.end
// (commit phase only) cannot see.
const prof = { create: 0, append: 0, remove: 0, insert: 0, update: 0, calls: 0 };
const profNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function profEnter(): number {
  return (globalThis as { __RAYACT_PROF?: boolean }).__RAYACT_PROF ? profNow() : -1;
}
function profExit(key: keyof typeof prof, start: number): void {
  if (start >= 0) {
    prof[key] += profNow() - start;
    prof.calls++;
  }
}
function profFlush(): void {
  if (!(globalThis as { __RAYACT_PROF?: boolean }).__RAYACT_PROF) return;
  // eslint-disable-next-line no-console
  console.log(
    `[prof] create=${prof.create.toFixed(1)} append=${prof.append.toFixed(1)} ` +
    `remove=${prof.remove.toFixed(1)} insert=${prof.insert.toFixed(1)} ` +
    `update=${prof.update.toFixed(1)} calls=${prof.calls}`,
  );
  prof.create = prof.append = prof.remove = prof.insert = prof.update = 0;
  prof.calls = 0;
}
import {
  perfIncCreated,
  perfIncBinaryCreateFallback,
  perfIncDisposed,
  perfIncUpdated,
  perfMarkCommitEnd,
  perfMarkCommitStart,
} from './perfLog';

const ReactReconciler = ReactReconcilerModule as unknown as (config: Record<string, unknown>) => any;

type Child = RayactHostInstance | RayactTextInstance;

// eventProps: properties consumed by the host (event callbacks) and
// therefore stripped from the `updateNode` payload. `onLayout` is a
// special case — the host does not currently wire a layout event back to
// JS, but consumers may pass it; strip it from the payload so the bridge
// doesn't try to apply it as a style/attribute.
const eventProps = [
  'onPress', 'onClick', 'onChangeText', 'onValueChange', 'onScroll', 'onRequestClose',
  'onFocus', 'onBlur', 'onLayout', 'onDragStart', 'onDragMove', 'onDragEnd',
  // TextInput (react-native parity). keyPress/contentSizeChange are accepted and
  // stripped from the payload but not yet fired by the host.
  'onSubmitEditing', 'onEndEditing', 'onSelectionChange', 'onKeyPress', 'onContentSizeChange',
] as const;
const eventPropSet = new Set<string>(eventProps);

function hasEventHandler(props: Record<string, unknown>): boolean {
  for (const prop of eventProps) {
    if (typeof props[prop] === 'function') return true;
  }
  return false;
}

const hostNodeTypes = new Set<string>([
  'root',
  'view',
  'text',
  'button',
  'image',
  'icon',
  'textInput',
  'scrollView',
  'modal',
  'externalView',
  'safeArea',
  'statusBar',
  'activityIndicator',
  'appBar',
  'badge',
  'banner',
  'bottomAppBar',
  'bottomSheet',
  'dataTable',
  'dockedToolbar',
  'floatingToolbar',
  'buttonGroup',
  'card',
  'carousel',
  'checkbox',
  'chip',
  'datePicker',
  'dialog',
  'divider',
  'extendedFab',
  'fab',
  'fabMenu',
  'iconButton',
  'list',
  'loadingIndicator',
  'menu',
  'menuItem',
  'navigationBar',
  'navigationBarItem',
  'navigationDrawer',
  'navigationRail',
  'progressIndicator',
  'radioButton',
  'rangeSlider',
  'search',
  'searchBar',
  'segmentedButton',
  'sideSheet',
  'slider',
  'snackbar',
  'splitButton',
  'switch',
  'tabs',
  'textField',
  'timePicker',
  'toolbar',
  'tooltip',
  'popover'
]);

// Memoized: the regex/lowercase normalization is pure and ran per createInstance
// (a top mount cost in QuickJS). There are only a handful of distinct type
// strings, so cache them.
const normalizeCache = new Map<string, HostNodeType>();
function normalizeType(type: RayactElementType | string): HostNodeType {
  const key = String(type);
  const cached = normalizeCache.get(key);
  if (cached !== undefined) return cached;
  const raw = key.replace(/^rayact-/, '');
  const normalized = raw.toLowerCase().replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  if (!hostNodeTypes.has(normalized)) {
    throw new Error(`Unknown Rayact element type: ${type}`);
  }
  normalizeCache.set(key, normalized as HostNodeType);
  return normalized as HostNodeType;
}

function isText(instance: Child): instance is RayactTextInstance {
  return instance.kind === 'text';
}

const sharedBinaryCreateProps = new Set<string>([
  'style', 'children', 'key', 'ref',
  ...eventProps,
]);

function hasOnlyProps(props: Record<string, unknown>, allowed: Set<string>): boolean {
  for (const key in props) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

const viewBinaryProps = sharedBinaryCreateProps;
const buttonBinaryProps = new Set([...sharedBinaryCreateProps, 'label', 'text', 'title']);
const imageBinaryProps = new Set([...sharedBinaryCreateProps, 'source', 'src']);
const iconBinaryProps = new Set([...sharedBinaryCreateProps, 'name', 'icon', 'size', 'color', 'variant', 'filled']);
const textInputBinaryProps = new Set([...sharedBinaryCreateProps, 'value', 'defaultValue']);

function primitiveString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function labelFromProps(props: Record<string, unknown>): string {
  return primitiveString(props.label)
    ?? primitiveString(props.text)
    ?? primitiveString(props.title)
    ?? primitiveString(props.children)
    ?? '';
}

function sourceFromProps(props: Record<string, unknown>): string | undefined {
  return primitiveString(props.source) ?? primitiveString(props.src);
}

function iconNameFromProps(props: Record<string, unknown>): string | undefined {
  return primitiveString(props.name) ?? primitiveString(props.icon);
}

function binaryTypeId(type: HostNodeType): number | undefined {
  switch (type) {
    case 'view':
    case 'root':
      return TYPE.VIEW;
    case 'text':
      return TYPE.TEXT;
    case 'button':
      return TYPE.BUTTON;
    case 'image':
      return TYPE.IMAGE;
    case 'icon':
      return TYPE.ICON;
    case 'scrollView':
      return TYPE.SCROLL_VIEW;
    case 'textInput':
      return TYPE.TEXT_INPUT;
    case 'safeArea':
      return TYPE.SAFE_AREA;
    case 'statusBar':
      return TYPE.STATUS_BAR;
    default:
      return undefined;
  }
}

function getBridge(parent: RayactHostInstance | RayactContainer): HostBridge {
  return parent.kind === 'container' ? parent.bridge : getDefaultRuntime().bridge;
}

function textFromChildren(instance: RayactHostInstance): string | undefined {
  if (instance.type !== 'text' && instance.type !== 'button') return undefined;
  let text = '';
  for (const child of instance.children) {
    if (isText(child)) text += child.text;
  }
  return text || undefined;
}

function syncTextContent(instance: RayactHostInstance): void {
  const text = textFromChildren(instance);
  if (text === undefined) return;
  if (binaryEnabled() && (instance.type === 'text' || instance.type === 'button')) {
    emitSetText(instance.node.id, internString(text));
    return;
  }
  if (nativeFastPath.batch && (instance.type === 'text' || instance.type === 'button')) {
    enqueueMutation({ op: 'setText', nodeId: instance.node.id, text });
    return;
  }
  getDefaultRuntime().bridge.updateNode(instance.node, { children: text });
}

function attachEvents(instance: RayactHostInstance, props: Record<string, unknown>): void {
  const bridge = getDefaultRuntime().bridge;
  for (const prop of eventProps) {
    const handler = props[prop];
    if (typeof handler === 'function') {
      bridge.setEventHandler(instance.node, eventNameForProp(prop), handler as () => void);
    }
  }
}

function updateEvents(instance: RayactHostInstance, oldProps: Record<string, unknown>, newProps: Record<string, unknown>): void {
  const bridge = getDefaultRuntime().bridge;
  for (const prop of eventProps) {
    if (oldProps[prop] !== newProps[prop]) {
      const handler = newProps[prop];
      bridge.setEventHandler(instance.node, eventNameForProp(prop), typeof handler === 'function' ? handler as () => void : null);
    }
  }
}

function eventNameForProp(prop: typeof eventProps[number]): HostEventName {
  if (prop === 'onClick') return 'click';
  if (prop === 'onChangeText') return 'changeText';
  if (prop === 'onValueChange') return 'changeValue';
  if (prop === 'onScroll') return 'scroll';
  if (prop === 'onRequestClose') return 'requestClose';
  if (prop === 'onFocus') return 'focus';
  if (prop === 'onBlur') return 'blur';
  if (prop === 'onSubmitEditing') return 'submitEditing';
  if (prop === 'onEndEditing') return 'endEditing';
  if (prop === 'onSelectionChange') return 'selectionChange';
  if (prop === 'onKeyPress') return 'keyPress';
  if (prop === 'onContentSizeChange') return 'contentSizeChange';
  if (prop === 'onDragStart') return 'dragStart';
  if (prop === 'onDragMove') return 'dragMove';
  if (prop === 'onDragEnd') return 'dragEnd';
  if (prop === 'onLayout') return 'layout';
  return 'press';
}

function appendChild(parent: RayactHostInstance | RayactContainer, child: Child): void {
  const __p = profEnter();
  try {
    child.parent = parent;
    parent.children.push(child);

    if (isText(child)) {
      if (parent.kind === 'instance') syncTextContent(parent);
      return;
    }

    const parentNode = parent.kind === 'container' ? parent.rootNode : parent.node;
    if (binaryEnabled()) {
      emitAppend(parentNode.id, child.node.id);
      return;
    }
    if (nativeFastPath.batch) {
      enqueueMutation({ op: 'appendChild', parentId: parentNode.id, childId: child.node.id });
      return;
    }
    getBridge(parent).appendChild(parentNode, child.node);
  } finally {
    profExit('append', __p);
  }
}

function disposeSubtreeNative(instance: RayactHostInstance): void {
  for (const grandchild of instance.children) {
    if (isText(grandchild)) continue;
    disposeSubtreeNative(grandchild);
  }
  if (binaryEnabled()) {
    emitDispose(instance.node.id);
    perfIncDisposed();
    return;
  }
  if (nativeFastPath.batch) {
    enqueueMutation({ op: 'disposeNode', nodeId: instance.node.id });
    perfIncDisposed();
    return;
  }
  getDefaultRuntime().bridge.disposeNode(instance.node);
  perfIncDisposed();
}

function disposeSubtree(instance: RayactHostInstance): void {
  disposeSubtreeNative(instance);
}

function removeChild(parent: RayactHostInstance | RayactContainer, child: Child): void {
  const __p = profEnter();
  try {
    const index = parent.children.indexOf(child);
    if (index !== -1) parent.children.splice(index, 1);
    child.parent = undefined;

    if (isText(child)) {
      if (parent.kind === 'instance') syncTextContent(parent);
      return;
    }

    const parentNode = parent.kind === 'container' ? parent.rootNode : parent.node;
    if (binaryEnabled()) {
      emitRemove(parentNode.id, child.node.id);
    } else if (nativeFastPath.batch) {
      enqueueMutation({ op: 'removeChild', parentId: parentNode.id, childId: child.node.id });
    } else {
      getBridge(parent).removeChild(parentNode, child.node);
    }
    disposeSubtree(child);
  } finally {
    profExit('remove', __p);
  }
}

function insertBefore(parent: RayactHostInstance | RayactContainer, child: Child, beforeChild: Child): void {
  const __p = profEnter();
  try {
    const existingIndex = parent.children.indexOf(child);
    if (existingIndex !== -1) parent.children.splice(existingIndex, 1);

    const beforeIndex = parent.children.indexOf(beforeChild);
    if (beforeIndex === -1) {
      appendChild(parent, child);
      return;
    }

    child.parent = parent;
    parent.children.splice(beforeIndex, 0, child);

    if (isText(child) || isText(beforeChild)) {
      if (parent.kind === 'instance') syncTextContent(parent);
      return;
    }

    const parentNode = parent.kind === 'container' ? parent.rootNode : parent.node;
    if (binaryEnabled()) {
      emitInsert(parentNode.id, child.node.id, beforeChild.node.id);
      return;
    }
    if (nativeFastPath.batch) {
      enqueueMutation({
        op: 'insertBefore',
        parentId: parentNode.id,
        childId: child.node.id,
        beforeChildId: beforeChild.node.id,
      });
      return;
    }
    getBridge(parent).insertBefore(parentNode, child.node, beforeChild.node);
  } finally {
    profExit('insert', __p);
  }
}

function styleValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!styleValueEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Allocation-free: no Object.keys()/filter() arrays (this runs per commitUpdate
  // for every re-rendered node — a top update cost in QuickJS). A key missing in
  // b reads as undefined → styleValueEqual(av, undefined) is false; a final count
  // compare catches keys present in b but not a.
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  let aCount = 0;
  for (const key in aObj) {
    const av = aObj[key];
    if (av === undefined) continue;
    aCount++;
    if (!styleValueEqual(av, bObj[key])) return false;
  }
  let bCount = 0;
  for (const key in bObj) {
    if (bObj[key] !== undefined) bCount++;
  }
  return aCount === bCount;
}

function diffProps(oldProps: Record<string, unknown>, newProps: Record<string, unknown>): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  let changed = false;

  for (const key in newProps) {
    if (key === 'children') continue;
    // Strip host-only / event-only props — they must not be forwarded as
    // native style/attribute updates.
    if (eventPropSet.has(key)) continue;
    if (key === 'style') {
      if (!styleValueEqual(oldProps.style, newProps.style)) {
        payload.style = newProps.style;
        changed = true;
      }
      continue;
    }
    if (oldProps[key] !== newProps[key]) {
      payload[key] = newProps[key];
      changed = true;
    }
  }

  for (const key in oldProps) {
    if (key === 'children' || key === 'style' || eventPropSet.has(key)) continue;
    if (!(key in newProps)) {
      payload[key] = undefined;
      changed = true;
    }
  }

  if (
    oldProps.className !== newProps.className &&
    !Object.prototype.hasOwnProperty.call(payload, 'style') &&
    newProps.style !== undefined
  ) {
    payload.style = newProps.style;
    changed = true;
  }

  return changed || oldProps.children !== newProps.children ? payload : null;
}

function scanAndBindSharedValues(nodeId: number, style: unknown) {
  if (!style) return;
  if (Array.isArray(style)) {
    for (const item of style) {
      scanAndBindSharedValues(nodeId, item);
    }
    return;
  }
  if (typeof style === 'object') {
    for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
      if (key === 'transform' && Array.isArray(value)) {
        for (const transformEntry of value) {
          if (transformEntry && typeof transformEntry === 'object') {
            for (const [tKey, tValue] of Object.entries(transformEntry)) {
              if (tValue && typeof (tValue as any).bindToNode === 'function') {
                (tValue as any).bindToNode(nodeId, tKey);
              }
            }
          }
        }
      } else if (value && typeof (value as any).bindToNode === 'function') {
        (value as any).bindToNode(nodeId, key);
      }
    }
  }
}

function tryCreateBinaryNode(
  normalizedType: HostNodeType,
  props: Record<string, unknown>,
): { id: number; type: HostNodeType } | null {
  if (!binaryEnabled()) return null;
  if (hasEventHandler(props)) {
    perfIncBinaryCreateFallback(normalizedType, 'event-handler');
    return null;
  }
  const typeId = binaryTypeId(normalizedType);
  if (typeId === undefined) {
    perfIncBinaryCreateFallback(normalizedType, 'unsupported-type');
    return null;
  }

  const styleBytes = styleEncSize(props.style);
  if (styleBytes < 0) {
    perfIncBinaryCreateFallback(normalizedType, 'unsupported-style');
    return null;
  }

  const id = allocNodeId();
  switch (normalizedType) {
    case 'view':
    case 'root':
    case 'text': {
      if (!hasOnlyProps(props, viewBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      emitCreate(id, typeId, props.style as Record<string, unknown> | undefined, styleBytes);
      return { id, type: normalizedType };
    }
    case 'button': {
      if (!hasOnlyProps(props, buttonBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      emitCreateParam(id, typeId, internString(labelFromProps(props)), props.style as Record<string, unknown> | undefined, {}, styleBytes);
      return { id, type: normalizedType };
    }
    case 'image': {
      if (!hasOnlyProps(props, imageBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      const source = sourceFromProps(props);
      if (source === undefined) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-source');
        return null;
      }
      emitCreateParam(id, typeId, internString(source), props.style as Record<string, unknown> | undefined, {}, styleBytes);
      return { id, type: normalizedType };
    }
    case 'icon': {
      if (!hasOnlyProps(props, iconBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      const name = iconNameFromProps(props);
      if (name === undefined) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-name');
        return null;
      }
      let flags = 0;
      let size = 0;
      let color = 0;
      let variantId = 0;
      if (typeof props.size === 'number') {
        flags |= CREATE_PARAM_HAS_SIZE;
        size = props.size;
      }
      if (typeof props.color === 'number') {
        flags |= CREATE_PARAM_HAS_COLOR;
        color = props.color;
      } else if (props.color !== undefined) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-color');
        return null;
      }
      if (typeof props.variant === 'string') {
        variantId = internString(props.variant);
      }
      if (typeof props.filled === 'boolean') {
        flags |= CREATE_PARAM_HAS_FILLED;
        if (props.filled) flags |= CREATE_PARAM_FILLED;
      }
      emitCreateParam(id, typeId, internString(name), props.style as Record<string, unknown> | undefined, { flags, size, color, variantId }, styleBytes);
      return { id, type: normalizedType };
    }
    case 'scrollView':
    case 'safeArea':
    case 'statusBar': {
      if (!hasOnlyProps(props, viewBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      emitCreate(id, typeId, props.style as Record<string, unknown> | undefined, styleBytes);
      return { id, type: normalizedType };
    }
    case 'textInput': {
      if (!hasOnlyProps(props, textInputBinaryProps)) {
        perfIncBinaryCreateFallback(normalizedType, 'unsupported-props');
        return null;
      }
      const value = primitiveString(props.value) ?? primitiveString(props.defaultValue) ?? '';
      emitCreateParam(id, typeId, internString(value), props.style as Record<string, unknown> | undefined, {}, styleBytes);
      return { id, type: normalizedType };
    }
    default:
      perfIncBinaryCreateFallback(normalizedType, 'unhandled-type');
      return null;
  }
}

export function createHostContainer(): RayactContainer {
  const runtime = getDefaultRuntime();
  if (binaryEnabled()) {
    // Batch-create the root too, so it gets a JS-owned dense id like every other
    // binary node (no sync createNode at a rebased-high native id).
    const id = allocNodeId();
    emitCreate(id, TYPE.VIEW, { flexGrow: 1 });
    emitSetRoot(id);
    return {
      kind: 'container',
      rootNode: { id, type: 'root' },
      bridge: runtime.bridge,
      runtime,
      children: []
    };
  }
  const rootNode = runtime.bridge.createNode('root', { style: { flexGrow: 1 } });
  if (nativeFastPath.batch) {
    enqueueMutation({ op: 'setRoot', nodeId: rootNode.id });
  } else {
    runtime.bridge.setRoot(rootNode);
  }
  return {
    kind: 'container',
    rootNode,
    bridge: runtime.bridge,
    runtime,
    children: []
  };
}

type GlobalWithReconciler = typeof globalThis & {
  __RAYACT_RECONCILER__?: ReturnType<typeof ReactReconciler>;
  __RAYACT_DEVTOOLS_INJECTED__?: boolean;
};

const __reconcilerGlobal = globalThis as GlobalWithReconciler;

// React 19 / react-reconciler 0.31: event priority is managed by the host via a
// stored "current update priority" (replaces 0.29's getCurrentEventPriority),
// and forms/transitions require a host transition context.
const NoEventPriority = (ReconcilerConstants as { NoEventPriority?: number }).NoEventPriority ?? 0;
let currentUpdatePriority: number = NoEventPriority;
const HostTransitionContext = createContext<unknown>(null);

export const RayactReconciler = __reconcilerGlobal.__RAYACT_RECONCILER__ ?? (__reconcilerGlobal.__RAYACT_RECONCILER__ = ReactReconciler({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: false,
  supportsMicrotasks: true,
  scheduleMicrotask: typeof queueMicrotask === 'function' ? queueMicrotask : (fn: () => void) => Promise.resolve().then(fn),
  setCurrentUpdatePriority: (newPriority: number) => { currentUpdatePriority = newPriority; },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => currentUpdatePriority || ReconcilerConstants.DefaultEventPriority,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  preparePortalMount: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  detachDeletedInstance: () => {},

  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (instance: RayactHostInstance) => instance,
  prepareForCommit: () => {
    perfMarkCommitStart();
    return null;
  },
  resetAfterCommit: () => {
    // Binary structural stream first (no-op when empty/disabled), then the
    // legacy object-batch (no-op unless the fast path is enabled).
    flushCommands();
    flushMutations();
    perfMarkCommitEnd();
    profFlush();
  },
  shouldSetTextContent: () => false,
  clearContainer: (container: RayactContainer) => {
    for (const child of [...container.children]) {
      removeChild(container, child);
    }
    return false;
  },

  createInstance(type: RayactElementType, props: Record<string, unknown>) {
    const __p = profEnter();
    try {
      const normalizedType = normalizeType(type);
      const node = tryCreateBinaryNode(normalizedType, props)
        ?? createNodeFast(normalizedType, props)
        ?? getDefaultRuntime().bridge.createNode(normalizedType, props);
      perfIncCreated();
      const instance: RayactHostInstance = {
        kind: 'instance',
        type: normalizedType,
        node,
        props,
        children: []
      };
      attachEvents(instance, props);
      scanAndBindSharedValues(node.id, props.style);
      return instance;
    } finally {
      profExit('create', __p);
    }
  },

  createTextInstance(text: string): RayactTextInstance {
    return { kind: 'text', text };
  },

  appendInitialChild(parent: RayactHostInstance, child: Child) {
    appendChild(parent, child);
  },

  finalizeInitialChildren: () => false,
  resetTextContent: (instance: RayactHostInstance) => {
    if (instance.type === 'text' || instance.type === 'button') {
      getDefaultRuntime().bridge.updateNode(instance.node, { children: '' });
    }
  },

  appendChild,
  appendChildToContainer: appendChild,
  removeChild,
  removeChildFromContainer: removeChild,
  insertBefore,
  insertInContainerBefore: insertBefore,

  // 0.31: prepareUpdate is gone — commitUpdate receives (instance, type,
  // prevProps, nextProps, handle) and computes the diff itself.
  commitUpdate(instance: RayactHostInstance, _type: RayactElementType, oldProps: Record<string, unknown>, newProps: Record<string, unknown>) {
    const __p = profEnter();
    try {
      instance.props = newProps;
      const payload = diffProps(oldProps, newProps);
      if (payload) {
        const handled = nativeFastPath.updateNode
          ? updateNodeFast(instance.node.id, instance.type, oldProps, newProps)
          : false;
        if (!handled) {
          getDefaultRuntime().bridge.updateNode(instance.node, payload);
        }
      }
      perfIncUpdated();
      updateEvents(instance, oldProps, newProps);
      syncTextContent(instance);
      if (oldProps.style !== newProps.style) {
        scanAndBindSharedValues(instance.node.id, newProps.style);
      }
    } finally {
      profExit('update', __p);
    }
  },

  commitTextUpdate(textInstance: RayactTextInstance, _oldText: string, newText: string) {
    textInstance.text = newText;
    if (textInstance.parent?.kind === 'instance') {
      syncTextContent(textInstance.parent);
    }
  },

  commitMount: () => {},
  hideInstance: (instance: RayactHostInstance) => {
    if (nativeFastPath.batch) {
      enqueueMutation({ op: 'setStyle', nodeId: instance.node.id, style: { display: 'none' } });
      return;
    }
    getDefaultRuntime().bridge.updateNode(instance.node, { display: 'none' });
  },
  hideTextInstance: () => {},
  unhideInstance: (instance: RayactHostInstance, props: Record<string, unknown>) => {
    if (nativeFastPath.batch && props.style) {
      enqueueMutation({ op: 'setStyle', nodeId: instance.node.id, style: props.style as Record<string, unknown> });
      return;
    }
    getDefaultRuntime().bridge.updateNode(instance.node, props);
  },
  unhideTextInstance: () => {},

  // --- react-reconciler 0.31 required additions ---
  // Timeouts (used by Suspense retry scheduling).
  scheduleTimeout: (fn: (...args: unknown[]) => void, delay?: number) => setTimeout(fn, delay),
  cancelTimeout: (id: number) => clearTimeout(id),
  noTimeout: -1,

  // Suspense commit gating — we never suspend the host on commit.
  maySuspendCommit: () => false,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,

  // Transitions / forms (no host-level transition or <form> action support).
  shouldAttemptEagerTransition: () => false,
  requestPostPaintCallback: () => {},
  resetFormInstance: () => {},
  NotPendingTransition: null,
  HostTransitionContext,

  // Event timing (devtools/profiler hints).
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1
}));

if (!__reconcilerGlobal.__RAYACT_DEVTOOLS_INJECTED__) {
  __reconcilerGlobal.__RAYACT_DEVTOOLS_INJECTED__ = true;
  RayactReconciler.injectIntoDevTools?.({
    bundleType: 1,
    version: '0.1.0',
    rendererPackageName: '@rayact/react',
    findHostInstanceByFiber: RayactReconciler.findHostInstance
  });
}
