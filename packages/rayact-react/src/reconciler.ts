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

const ReactReconciler = ReactReconcilerModule as unknown as (config: Record<string, unknown>) => any;

type Child = RayactHostInstance | RayactTextInstance;

const eventProps = ['onPress', 'onClick', 'onChangeText', 'onValueChange', 'onScroll', 'onRequestClose'] as const;

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
  'safeArea',
  'statusBar',
  'activityIndicator',
  'avoidKeyboard',
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
  'loadingIndicator',
  'menu',
  'navigationBar',
  'navigationBarItem',
  'navigationDrawer',
  'navigationRail',
  'progressIndicator',
  'radioButton',
  'searchBar',
  'segmentedButton',
  'sideSheet',
  'slider',
  'snackbar',
  'splitButton',
  'switch',
  'tabs',
  'toolbar',
  'tooltip'
]);

function normalizeType(type: RayactElementType | string): HostNodeType {
  const raw = String(type).replace(/^rayact-/, '');
  const normalized = raw.toLowerCase().replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  if (hostNodeTypes.has(normalized)) {
    return normalized as HostNodeType;
  }
  throw new Error(`Unknown Rayact element type: ${type}`);
}

function isText(instance: Child): instance is RayactTextInstance {
  return instance.kind === 'text';
}

function getBridge(parent: RayactHostInstance | RayactContainer): HostBridge {
  return parent.kind === 'container' ? parent.bridge : getDefaultRuntime().bridge;
}

function textFromChildren(instance: RayactHostInstance): string | undefined {
  if (instance.type !== 'text' && instance.type !== 'button') return undefined;
  const text = instance.children.filter(isText).map(child => child.text).join('');
  return text || undefined;
}

function syncTextContent(instance: RayactHostInstance): void {
  const text = textFromChildren(instance);
  if (text !== undefined) {
    getDefaultRuntime().bridge.updateNode(instance.node, { children: text });
  }
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
  return 'press';
}

function appendChild(parent: RayactHostInstance | RayactContainer, child: Child): void {
  child.parent = parent;
  parent.children.push(child);

  if (isText(child)) {
    if (parent.kind === 'instance') syncTextContent(parent);
    return;
  }

  getBridge(parent).appendChild(parent.kind === 'container' ? parent.rootNode : parent.node, child.node);
}

function removeChild(parent: RayactHostInstance | RayactContainer, child: Child): void {
  const index = parent.children.indexOf(child);
  if (index !== -1) parent.children.splice(index, 1);
  child.parent = undefined;

  if (isText(child)) {
    if (parent.kind === 'instance') syncTextContent(parent);
    return;
  }

  getBridge(parent).removeChild(parent.kind === 'container' ? parent.rootNode : parent.node, child.node);
  getBridge(parent).disposeNode(child.node);
}

function insertBefore(parent: RayactHostInstance | RayactContainer, child: Child, beforeChild: Child): void {
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

  getBridge(parent).insertBefore(parent.kind === 'container' ? parent.rootNode : parent.node, child.node, beforeChild.node);
}

function diffProps(oldProps: Record<string, unknown>, newProps: Record<string, unknown>): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

  for (const key of keys) {
    if (key === 'children') continue;
    if (oldProps[key] !== newProps[key]) {
      payload[key] = newProps[key];
    }
  }

  return Object.keys(payload).length > 0 || oldProps.children !== newProps.children ? payload : null;
}

export function createHostContainer(): RayactContainer {
  const runtime = getDefaultRuntime();
  const rootNode = runtime.bridge.createNode('root', { style: { flexGrow: 1 } });
  runtime.bridge.setRoot(rootNode);
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
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  shouldSetTextContent: () => false,
  clearContainer: (container: RayactContainer) => {
    for (const child of [...container.children]) {
      removeChild(container, child);
    }
    return false;
  },

  createInstance(type: RayactElementType, props: Record<string, unknown>) {
    const normalizedType = normalizeType(type);
    const node = getDefaultRuntime().bridge.createNode(normalizedType, props);
    const instance: RayactHostInstance = {
      kind: 'instance',
      type: normalizedType,
      node,
      props,
      children: []
    };
    attachEvents(instance, props);
    return instance;
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
    instance.props = newProps;
    const payload = diffProps(oldProps, newProps);
    if (payload) getDefaultRuntime().bridge.updateNode(instance.node, payload);
    updateEvents(instance, oldProps, newProps);
    syncTextContent(instance);
  },

  commitTextUpdate(textInstance: RayactTextInstance, _oldText: string, newText: string) {
    textInstance.text = newText;
    if (textInstance.parent?.kind === 'instance') {
      syncTextContent(textInstance.parent);
    }
  },

  commitMount: () => {},
  hideInstance: (instance: RayactHostInstance) => getDefaultRuntime().bridge.updateNode(instance.node, { display: 'none' }),
  hideTextInstance: () => {},
  unhideInstance: (instance: RayactHostInstance, props: Record<string, unknown>) => getDefaultRuntime().bridge.updateNode(instance.node, props),
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
