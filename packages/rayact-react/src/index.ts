import type React from 'react';
import { getDefaultRuntime } from '@rayact/runtime';
import { createHostContainer, RayactReconciler } from './reconciler';
import type { RayactContainer, RayactRoot } from './types';

export type {
  BaseProps,
  ButtonProps,
  IconProps,
  ImageProps,
  RayactContainer,
  RayactRoot,
  TextProps
} from './types';

export { Button, Icon, Image, Text, View } from './components';
export { RayactReconciler };
export { createRuntime, getDefaultRuntime } from '@rayact/runtime';

interface StoredRoot {
  container: RayactContainer;
  publicRoot: RayactRoot;
}

type GlobalWithRoot = typeof globalThis & {
  __rayactReactRoot?: StoredRoot;
};

function disposeExistingDevRoot(): void {
  const globalObject = globalThis as GlobalWithRoot;
  if (!globalObject.__rayactReactRoot) return;
  // React Fast Refresh keeps the fiber root alive across hot reloads —
  // only tear down on the very first bundle load.
  if ((globalThis as Record<string, unknown>).__RAYACT_HMR_ACTIVE__) return;

  try {
    globalObject.__rayactReactRoot.publicRoot.unmount();
  } catch (error) {
    getDefaultRuntime().reportError(error);
  } finally {
    delete globalObject.__rayactReactRoot;
  }
}

disposeExistingDevRoot();

function createFiberRoot(container: RayactContainer): unknown {
  return RayactReconciler.createContainer(
    container,
    ReconcilerRootTag.LegacyRoot,
    null,
    false,
    null,
    '',
    getDefaultRuntime().reportError,
    getDefaultRuntime().reportError,
    getDefaultRuntime().reportError,
    null
  );
}

const ReconcilerRootTag = {
  LegacyRoot: 0
};

export function createRoot(container: RayactContainer = createHostContainer()): RayactRoot {
  const fiberRoot = createFiberRoot(container);
  const publicRoot: RayactRoot = {
    container,
    render(element: React.ReactNode) {
      RayactReconciler.updateContainer(element, fiberRoot, null, undefined);
    },
    unmount() {
      RayactReconciler.updateContainer(null, fiberRoot, null, () => {
        container.bridge.setRoot(null);
        container.bridge.disposeNode(container.rootNode);
      });
    }
  };

  return publicRoot;
}

export function getOrCreateRoot(): RayactRoot {
  const globalObject = globalThis as GlobalWithRoot;
  if (!globalObject.__rayactReactRoot) {
    const container = createHostContainer();
    const publicRoot = createRoot(container);
    globalObject.__rayactReactRoot = {
      container,
      publicRoot
    };
  }
  return globalObject.__rayactReactRoot.publicRoot;
}

export function render(element: React.ReactNode): RayactRoot {
  // On hot reloads React Fast Refresh calls performReactRefresh() (in the bundle
  // footer) which re-renders changed components in-place. Calling root.render()
  // here would create a reconciler update with the new function references
  // BEFORE Refresh patches the fiber types, causing React to unmount+remount
  // and lose component state. Skip the render and let Refresh drive updates.
  if ((globalThis as Record<string, unknown>).__RAYACT_HMR_ACTIVE__) {
    return getOrCreateRoot();
  }
  const root = getOrCreateRoot();
  root.render(element);
  return root;
}
