import type { HostBridge, HostNodeType } from '@rayact/runtime';
import { getDefaultRuntime } from '@rayact/runtime';
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

const eventProps = ['onPress', 'onClick'] as const;

function normalizeType(type: RayactElementType | string): HostNodeType {
  const normalized = String(type).toLowerCase().replace(/^rayact-/, '');
  if (normalized === 'root' || normalized === 'view' || normalized === 'text' || normalized === 'button' || normalized === 'image' || normalized === 'icon') {
    return normalized;
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
      bridge.setEventHandler(instance.node, prop === 'onClick' ? 'click' : 'press', handler as () => void);
    }
  }
}

function updateEvents(instance: RayactHostInstance, oldProps: Record<string, unknown>, newProps: Record<string, unknown>): void {
  const bridge = getDefaultRuntime().bridge;
  for (const prop of eventProps) {
    if (oldProps[prop] !== newProps[prop]) {
      const handler = newProps[prop];
      bridge.setEventHandler(instance.node, prop === 'onClick' ? 'click' : 'press', typeof handler === 'function' ? handler as () => void : null);
    }
  }
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

export const RayactReconciler = __reconcilerGlobal.__RAYACT_RECONCILER__ ?? (__reconcilerGlobal.__RAYACT_RECONCILER__ = ReactReconciler({
  now: Date.now,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: false,
  supportsMicrotasks: true,
  scheduleMicrotask: typeof queueMicrotask === 'function' ? queueMicrotask : (fn: () => void) => Promise.resolve().then(fn),
  getCurrentEventPriority: () => ReconcilerConstants.DefaultEventPriority,
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
  prepareUpdate: (_instance: RayactHostInstance, _type: RayactElementType, oldProps: Record<string, unknown>, newProps: Record<string, unknown>) => diffProps(oldProps, newProps),
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

  commitUpdate(instance: RayactHostInstance, updatePayload: Record<string, unknown>, _type: RayactElementType, oldProps: Record<string, unknown>, newProps: Record<string, unknown>) {
    instance.props = newProps;
    getDefaultRuntime().bridge.updateNode(instance.node, updatePayload);
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
  shouldDeprioritizeSubtree: () => false
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
