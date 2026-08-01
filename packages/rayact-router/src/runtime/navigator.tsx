import * as React from 'react';
import { createStackNavigator, type RayactStackNavigationOptions } from '@rayact/navigation';
import { createBottomTabNavigator } from '@rayact/navigation/bottom-tabs';
import { initialRouteNameFor } from '../manifest/tree.js';
import type { RouteNode } from '../manifest/types.js';
import { RouteNodeContext, useRouteNode } from './contexts.js';
import { NotFoundScreen } from './NotFound.js';

// One component pair per navigator flavor, shared by every nesting level —
// each <Navigator> element instance owns its own react-navigation state.
const StackImpl = createStackNavigator();
const TabsImpl = createBottomTabNavigator() as unknown as {
  Navigator: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>;
  Screen: React.ComponentType<Record<string, unknown>>;
};

export interface ScreenOverrideProps {
  name: string;
  options?: Record<string, unknown>;
  initialParams?: Record<string, unknown>;
}

interface QualifiedNavigatorProps {
  children?: React.ReactNode;
  initialRouteName?: string;
  screenOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QualifiedNavigator extends React.FC<QualifiedNavigatorProps> {
  /** Options placeholder inspected during render; renders nothing itself. */
  Screen: React.FC<ScreenOverrideProps>;
}

const componentCache = new WeakMap<RouteNode, React.ComponentType<Record<string, unknown>>>();

function screenComponentFor(node: RouteNode): React.ComponentType<Record<string, unknown>> {
  const cached = componentCache.get(node);
  if (cached) return cached;
  let component: React.ComponentType<Record<string, unknown>>;
  if (node.type === 'layout') {
    component = function RayactLayoutRoute() {
      return <RouteRenderer node={node} />;
    };
  } else {
    component = function RayactRoute() {
      // Read the module during render so React Fast Refresh replacements of
      // the route file are picked up without remounting the screen.
      const mod = node.loadRoute?.();
      const Component = mod?.default ?? (node.type === 'notFound' ? NotFoundScreen : null);
      if (!Component) {
        console.warn(`[rayact-router] Route "${node.contextKey}" has no default export.`);
        return null;
      }
      return (
        <RouteNodeContext.Provider value={node}>
          <Component />
        </RouteNodeContext.Provider>
      );
    };
  }
  componentCache.set(node, component);
  return component;
}

function collectOverrides(children: React.ReactNode): Map<string, ScreenOverrideProps> {
  const overrides = new Map<string, ScreenOverrideProps>();
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const props = child.props as ScreenOverrideProps;
    if (typeof props?.name === 'string') overrides.set(props.name, props);
  });
  return overrides;
}

function ScreenPlaceholder(): null {
  return null;
}

function createQualifiedNavigator(impl: {
  Navigator: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>;
  Screen: React.ComponentType<Record<string, unknown>>;
}): QualifiedNavigator {
  const { Navigator, Screen } = impl;
  const Qualified: QualifiedNavigator = ((props: QualifiedNavigatorProps) => {
    const node = useRouteNode();
    const { children, initialRouteName, ...rest } = props;
    const overrides = collectOverrides(children);
    if (node.children.length === 0) {
      console.warn(
        `[rayact-router] Layout "${node.contextKey || '(root)'}" has no routes; add a sibling route file (e.g. index.tsx).`
      );
      return null;
    }
    return (
      <Navigator {...rest} initialRouteName={initialRouteName ?? initialRouteNameFor(node)}>
        {node.children.map(child => {
          const override = overrides.get(child.routeName);
          return (
            <Screen
              key={child.routeName}
              name={child.routeName}
              component={screenComponentFor(child)}
              options={override?.options}
              initialParams={override?.initialParams}
            />
          );
        })}
      </Navigator>
    );
  }) as QualifiedNavigator;
  Qualified.Screen = ScreenPlaceholder as React.FC<ScreenOverrideProps>;
  return Qualified;
}

/** File-tree-driven stack navigator: screens come from sibling route files. */
export const Stack = createQualifiedNavigator(
  StackImpl as unknown as Parameters<typeof createQualifiedNavigator>[0]
);

/** File-tree-driven bottom-tabs navigator. */
export const Tabs = createQualifiedNavigator(TabsImpl);

export type { RayactStackNavigationOptions };

/**
 * Renders a layout node: its _layout default export, or an implicit default
 * Stack when the directory has no _layout file.
 */
export function RouteRenderer({ node }: { node: RouteNode }): React.ReactElement {
  return (
    <RouteNodeContext.Provider value={node}>
      <LayoutContent node={node} />
    </RouteNodeContext.Provider>
  );
}

function LayoutContent({ node }: { node: RouteNode }): React.ReactElement {
  const mod = node.loadRoute?.();
  const Layout = mod?.default;
  if (mod && !Layout) {
    console.warn(`[rayact-router] Layout "${node.contextKey}" has no default export; using a default Stack.`);
  }
  if (Layout) return <Layout />;
  return <Stack />;
}

/**
 * Navigator-less child rendering: routes stay in the navigation state tree
 * (so URL resolution works through this level) but render with no stack
 * chrome or transition — the embedded StackNavigator branch renders only the
 * focused descriptor.
 */
export function Slot(props: { screenOptions?: Record<string, unknown> }): React.ReactElement {
  return (
    <Stack
      embedded
      screenOptions={{ animation: 'none', ...(props.screenOptions ?? {}) }}
    />
  );
}
