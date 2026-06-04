// @rayact/navigation — run the REAL react-navigation on rayact, with
// engine-driven transitions and an RN-compatible BackHandler.
//
// react-navigation cleanly separates routing logic (routers, navigation state,
// params, history, linking) — all in the platform-agnostic @react-navigation/
// core + /routers packages (zero react-native imports) — from the *view* layer.
// Built-in navigators (native-stack, stack) ship views bound to
// react-native-screens / RN primitives, which we don't have. So instead of
// re-implementing navigation, we use the documented custom-navigator API
// (useNavigationBuilder + StackRouter) and render screens with rayact's own
// <View>. This reuses 100% of react-navigation's logic.
//
// Per-route transitions are driven from JS via useSpring + the existing raym3
// transform style props. The transition container is a real <View> that fills
// the stack with the app's opaque backgroundColor — no transparent
// SurfaceView compositing required; the upper card simply slides over the
// lower surface, which has been rendered the whole time underneath.
//
// Backend split (Platform.OS), mirroring react-navigation's own .tsx/.native:
//   - desktop/web: layered <View> stack in the single tree (focused on top).
//   - android: each route gets its own engine screen (independent React
//     subtree, mounted via createRoot + setCurrentScreen). The host manages
//     the EGL surfaces via __rayactHostRequestNewSurface/ReleaseSurface.
//
// Per-screen render gating: the SceneView drives g_screenStack via
// __rayactEngineSetScreenStack, so a 20-deep stack only renders the focused
// surface + the one directly below it (the one that would be revealed by a
// back). All other surfaces stay mounted (state preserved) but skip layout/
// draw entirely. Driven by `progress === 1` for the focused screen (pop
// covered screens) and `isClosing` flag (re-push the revealed screen on pop
// start).

import * as React from 'react';
import {
  BaseNavigationContainer,
  createNavigatorFactory,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type ParamListBase,
  type StackNavigationState,
  type Descriptor,
} from '@react-navigation/core';
import {
  StackRouter,
  type StackRouterOptions,
  type StackActionHelpers,
} from '@react-navigation/routers';
import {
  View,
  createRoot,
  type RayactRoot,
  BackHandler,
  useSpring,
  useTheme,
} from '@rayact/react';
import { Platform } from '@rayact/shared';

declare const __rayactHostRequestNewSurface: (() => number) | undefined;
declare const __rayactHostReleaseTopSurface: (() => void) | undefined;
declare const __rayactHostGetRootSurfaceId: (() => number) | undefined;
declare const __rayactEnginePushScreen: ((id: number) => void) | undefined;
declare const __rayactEngineSetScreenStack:
  | ((ids: number[]) => void)
  | undefined;
declare function setCurrentScreen(id: number): void;
declare function getRenderWidth(): number;
declare function getRenderHeight(): number;

const isAndroid = Platform.OS === Platform.ANDROID;

// ─── per-screen options ───────────────────────────────────────────────────

export type StackAnimation =
  | 'slide_from_right'
  | 'fade'
  | 'slide_from_bottom'
  | 'scale'
  | 'none';

export type RayactStackNavigationOptions = {
  /** Hide this screen's container without unmounting (keeps component state). */
  detachInactiveScreens?: boolean;
  /** Default 'slide_from_right' — mirrors react-navigation's stackAnimation. */
  animation?: StackAnimation;
  /** Default 280ms — mirrors react-navigation's transitionDuration. */
  animationDuration?: number;
};

type StackNavigationConfig = {
  /** Keep non-focused screens mounted (default true) so their state survives. */
  keepMounted?: boolean;
  /** Navigator-level default animation. Cascades to per-screen if not set. */
  animation?: StackAnimation;
  /** Navigator-level default duration. */
  animationDuration?: number;
};

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  StackNavigationState<ParamListBase>,
  RayactStackNavigationOptions,
  Record<string, never>,
  unknown
> &
  StackRouterOptions &
  StackNavigationConfig;

// ─── interpolators (mirror CardStyleInterpolators in spirit, minimal) ─────

type Style = Record<string, unknown>;
type Interpolator = (progress: number, layout: LayoutSize) => Style;
type LayoutSize = { width: number; height: number };

const slideFromRight: Interpolator = (p, l) => ({
  transform: [{ translateX: (1 - p) * l.width }],
});
const slideFromBottom: Interpolator = (p, l) => ({
  transform: [{ translateY: (1 - p) * l.height }],
});
const fade: Interpolator = (p) => ({ opacity: p });
const scale: Interpolator = (p) => ({
  transform: [{ scale: 0.9 + 0.1 * p }],
  opacity: p,
});
const noneInterpolator: Interpolator = () => ({});

const interpolators: Record<StackAnimation, Interpolator> = {
  slide_from_right: slideFromRight,
  slide_from_bottom: slideFromBottom,
  fade,
  scale,
  none: noneInterpolator,
};

// ─── shared absolute fill (used by SceneView) ──────────────────────────────

const fill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

// ─── Android per-surface backend ──────────────────────────────────────────

type MountedScreen = {
  surfaceId: number;
  root: RayactRoot;
  render: () => React.ReactNode;
};

// ─── SceneView: per-route transition container ────────────────────────────

type DescriptorWithKey = Descriptor<
  RayactStackNavigationOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

type SceneViewProps = {
  descriptor: DescriptorWithKey;
  isFocused: boolean;
  isClosing: boolean;
  defaultAnimation: StackAnimation;
  defaultDuration: number;
  bgColor: number;
  /**
   * The surfaceId of the screen directly below this one in the focused
   * chain (state.index - 1), if any. Used to re-push the revealed screen
   * into the engine stack on exit start.
   */
  revealedSurfaceId: number;
  /**
   * When this scene's enter animation settles at progress=1, the engine
   * stack is trimmed to [focused, thisRouteBelow]. Pass that route's
   * surfaceId so the SceneView can issue a single
   * __rayactEngineSetScreenStack call at settle time.
   */
  belowSurfaceId: number;
  surfaceId: number;
  onExitSettled: (key: string) => void;
};

function SceneView({
  descriptor,
  isFocused,
  isClosing,
  defaultAnimation,
  defaultDuration,
  bgColor,
  revealedSurfaceId,
  belowSurfaceId,
  surfaceId,
  onExitSettled,
}: SceneViewProps) {
  const opts = (descriptor.options ?? {}) as RayactStackNavigationOptions;
  const animation = opts.animation ?? defaultAnimation;
  const duration = opts.animationDuration ?? defaultDuration;
  const target = isClosing ? 0 : 1;
  const interp = interpolators[animation] ?? slideFromRight;

  // Pre-settled: skip the animation entirely when the initial value already
  // matches the target. This avoids spurious onSettled calls on the very
  // first mount (a route that was just pushed starts at progress=0 but its
  // initial render with no animation should still settle cleanly on the
  // next frame, which useSpring does).
  const progress = useSpring(target, { duration });

  const [layout, setLayout] = React.useState<LayoutSize>({
    width: typeof getRenderWidth === 'function' ? getRenderWidth() : 0,
    height: typeof getRenderHeight === 'function' ? getRenderHeight() : 0,
  });
  const onLayout = React.useCallback(
    (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setLayout((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    },
    [],
  );

  const onSettled = React.useCallback(
    (v: number) => {
      if (v === 1 && isFocused) {
        // Enter settled. Trim the engine stack to just the focused + the
        // route directly below it. Anything deeper is fully covered by the
        // upper card and doesn't need to be in the engine's draw list.
        // On desktop (no engine stack) this is a no-op.
        if (typeof __rayactEngineSetScreenStack === 'function') {
          const ids: number[] = [];
          if (belowSurfaceId > 0) ids.push(belowSurfaceId);
          // The focused surface is already in the stack; re-state to be safe
          // (engineSetScreenStack is idempotent).
          const sid = surfaceId > 0
            ? surfaceId
            : (descriptor.route.params as { surfaceId?: number } | undefined)?.surfaceId;
          if (typeof sid === 'number' && sid > 0) ids.push(sid);
          __rayactEngineSetScreenStack(ids);
        }
      } else if (v === 0 && isClosing) {
        // Exit settled. Defer the surface release to the navigator.
        onExitSettled(descriptor.route.key);
      }
    },
    [isFocused, isClosing, belowSurfaceId, surfaceId, onExitSettled, descriptor.route.key, descriptor.route.params],
  );

  // The settled callback needs to fire whenever progress reaches the target.
  // We re-derive it from `progress` (the latest rAF-driven value).
  React.useEffect(() => {
    if (target === 1 && progress >= 0.999 && isFocused) onSettled(1);
    else if (target === 0 && progress <= 0.001 && isClosing) onSettled(0);
  }, [progress, target, isFocused, isClosing, onSettled]);

  // On exit start, push the revealed (lower) surface back into the engine
  // stack so it starts rendering before the upper card animates away. The
  // upper card is still at progress=1 (fully covering) when this fires, so
  // the first frame of the lower surface's render is hidden — no flash.
  React.useEffect(() => {
    if (
      isClosing &&
      revealedSurfaceId > 0 &&
      typeof __rayactEnginePushScreen === 'function'
    ) {
      __rayactEnginePushScreen(revealedSurfaceId);
    }
  }, [isClosing, revealedSurfaceId]);

  return (
    <View
      onLayout={onLayout}
      style={[fill, { backgroundColor: bgColor }, interp(progress, layout)]}
    >
      {descriptor.render()}
    </View>
  );
}

// ─── default back listener (RN-compatible) ────────────────────────────────

function DefaultBackHandler({
  navigation,
  state,
}: {
  navigation: StackActionHelpers<ParamListBase>;
  state: StackNavigationState<ParamListBase>;
}) {
  React.useEffect(() => {
    const globalObject = globalThis as typeof globalThis & {
      __rayactHandleNavigationBackPress?: () => boolean;
    };
    const handler = () => {
      if (state.routes.length > 1) {
        navigation.pop();
        return true;
      }
      return false;
    };
    globalObject.__rayactHandleNavigationBackPress = handler;
    return () => {
      if (globalObject.__rayactHandleNavigationBackPress === handler) {
        delete globalObject.__rayactHandleNavigationBackPress;
      }
    };
  }, [navigation, state.routes.length]);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.routes.length > 1) {
        navigation.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [navigation, state.routes.length]);
  return null;
}

// ─── the navigator ───────────────────────────────────────────────────────

function StackNavigator({
  id,
  initialRouteName,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  keepMounted = true,
  animation: defaultAnimation = 'slide_from_right',
  animationDuration: defaultDuration = 280,
  ...rest
}: Props) {
  const forceUpdate = React.useReducer((x) => x + 1, 0)[1];

  const { state, describe, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      StackNavigationState<ParamListBase>,
      StackRouterOptions,
      StackActionHelpers<ParamListBase>,
      RayactStackNavigationOptions,
      Record<string, never>
    >(StackRouter, {
      id,
      initialRouteName,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
    });

  if (isAndroid) {
    (globalThis as typeof globalThis & {
      __rayactHandleNavigationBackPress?: () => boolean;
    }).__rayactHandleNavigationBackPress = () => {
      if (state.routes.length > 1) {
        navigation.pop();
        return true;
      }
      return false;
    };
  }

  // ── Android per-surface backend ─────────────────────────────────────
  const mountedRef = React.useRef<Map<string, MountedScreen>>(new Map());
  const [, force] = React.useReducer((x) => x + 1, 0);

  // closingKeys: routes that have been removed from state.routes but whose
  // exit animation is still playing. Mirrors react-navigation's
  // `closingRouteKeys` (StackRouter exposes a similar concept internally;
  // we track it here because the engine-side render-gating needs it).
  const closingKeysRef = React.useRef<Set<string>>(new Set());
  // Snapshots of descriptors for closing routes — needed so the closing
  // SceneView can keep rendering after the route leaves state.routes.
  const closingDescriptorsRef = React.useRef<
    Map<string, DescriptorWithKey>
  >(new Map());

  // Theme + app config (background color) for the opaque card fill.
  const theme = useTheme();
  const bgColor =
    ((globalThis as { __rayactConfig?: { backgroundColor?: number } })
      .__rayactConfig?.backgroundColor ??
      (typeof theme.surface === 'number' ? theme.surface : 0x000000ff)) >>> 0;

  // On every state change, reconcile: which routes are added, which removed.
  // The removed routes become "closing" (animating out); their surfaces stay
  // mounted until the animation settles.
  React.useEffect(() => {
    if (!isAndroid) return;
    const current = new Set(state.routes.map((r) => r.key));
    const rootSurfaceId = __rayactHostGetRootSurfaceId?.() ?? 0;

    // Routes that just left state.routes: move to closingKeys. We keep
    // their React trees mounted (and their Fragment-free SceneView)
    // running the exit animation.
    for (const [key, m] of Array.from(mountedRef.current.entries())) {
      if (!current.has(key)) {
        if (!closingKeysRef.current.has(key)) {
          closingKeysRef.current.add(key);
          closingDescriptorsRef.current.set(key, descriptors[key]);
        }
      }
    }

    // Routes that re-entered state.routes (cancelled pop): unmark closing.
    for (const key of Array.from(closingKeysRef.current)) {
      if (current.has(key)) {
        closingKeysRef.current.delete(key);
        closingDescriptorsRef.current.delete(key);
      }
    }

    // Mount new routes.
    for (const route of state.routes) {
      if (mountedRef.current.has(route.key)) {
        // Re-render existing (params may have changed).
        const m = mountedRef.current.get(route.key)!;
        setCurrentScreen(m.surfaceId);
        (route as { params?: Record<string, unknown> }).params = {
          ...(route.params ?? {}),
          surfaceId: m.surfaceId,
        };
        m.root.render(
          React.createElement(AndroidSceneViewRoot, {
            routeKey: route.key,
            descriptors,
            state,
            closingKeys: closingKeysRef.current,
            closingDescriptors: closingDescriptorsRef.current,
            defaultAnimation,
            defaultDuration,
            bgColor,
            belowSurfaceId: surfaceIdBelow(route.key, state, mountedRef.current),
            revealedSurfaceId: surfaceIdBelow(
              route.key,
              state,
              mountedRef.current,
            ),
            surfaceId: m.surfaceId,
            onExitSettled: (key) => {
              if (closingKeysRef.current.has(key)) {
                closingKeysRef.current.delete(key);
                closingDescriptorsRef.current.delete(key);
              }
              const closing = mountedRef.current.get(key);
              if (closing && closing.surfaceId !== rootSurfaceId) {
                try {
                  setCurrentScreen(closing.surfaceId);
                  closing.root.unmount();
                } catch {}
                try {
                  __rayactHostReleaseTopSurface?.();
                } catch {}
              }
              mountedRef.current.delete(key);
              forceUpdate();
            },
          }),
        );
        continue;
      }
      // Allocate a surface: root surface for the initial route, fresh
      // surface for subsequent ones.
      const alreadyMounted = mountedRef.current.size;
      let sid = 0;
      if (alreadyMounted === 0 && rootSurfaceId > 0) {
        sid = rootSurfaceId;
      } else {
        sid = __rayactHostRequestNewSurface?.() ?? 0;
        if (sid <= 0) {
          // The layered backend on desktop also reaches this branch when
          // alreadyMounted > 0; the navigator's desktop path renders
          // SceneViews in the main tree, so a failed surface allocation is
          // not an error there.
          continue;
        }
      }
      // Bind the screen BEFORE creating the root: createRoot() →
      // createHostContainer() calls the native setRootNode immediately, so
      // it must run while THIS surface is the current screen. Otherwise
      // the new route's root node is registered on whatever screen
      // happened to be current.
      setCurrentScreen(sid);
      const root = createRoot();
      const render = () => descriptors[route.key].render();
      // Stash the surfaceId on the route's params so SceneView can read it.
      (route as { params?: Record<string, unknown> }).params = {
        ...(route.params ?? {}),
        surfaceId: sid,
      };
      mountedRef.current.set(route.key, { surfaceId: sid, root, render });
      // Mount the SceneView as the sub-root's content. Each surface is its
      // own React tree, and within it we only need the SceneView for THIS
      // route (not all routes — other routes have their own surfaces).
      root.render(
        React.createElement(AndroidSceneViewRoot, {
          routeKey: route.key,
          descriptors,
          state,
          closingKeys: closingKeysRef.current,
          closingDescriptors: closingDescriptorsRef.current,
          defaultAnimation,
          defaultDuration,
          bgColor,
          belowSurfaceId: surfaceIdBelow(route.key, state, mountedRef.current),
          revealedSurfaceId: surfaceIdBelow(
            // When the focused route is THIS one and another screen is being
            // pushed, the "revealed on exit" surface is THIS one (the one
            // about to be revealed when something above pops).
            route.key,
            state,
            mountedRef.current,
          ),
          surfaceId: sid,
          onExitSettled: (key) => {
            // Release the surface: unmount its React tree and ask the host
            // to pop the fragment. The engine stack trim and surface
            // teardown are then driven by the host path.
            if (closingKeysRef.current.has(key)) {
              closingKeysRef.current.delete(key);
              closingDescriptorsRef.current.delete(key);
            }
            const m = mountedRef.current.get(key);
            if (m && m.surfaceId !== rootSurfaceId) {
              try {
                setCurrentScreen(m.surfaceId);
                m.root.unmount();
              } catch {}
              try {
                __rayactHostReleaseTopSurface?.();
              } catch {}
            }
            mountedRef.current.delete(key);
            forceUpdate();
          },
        }),
      );
    }
  }, [
    state.routes,
    state.index,
    descriptors,
    defaultAnimation,
    defaultDuration,
    bgColor,
    forceUpdate,
  ]);

  // On unmount, unmount every still-mounted sub-root and clear closing state.
  React.useEffect(() => {
    return () => {
      for (const [, m] of mountedRef.current) {
        try {
          m.root.unmount();
        } catch {}
      }
      mountedRef.current.clear();
      closingKeysRef.current.clear();
      closingDescriptorsRef.current.clear();
    };
  }, []);

  if (isAndroid) {
    // The Android backend renders nothing in the main React tree — each
    // screen has its own engine surface, drawn by the native render loop.
    // We just need a placeholder for NavigationContent + the default back
    // listener.
    return (
      <NavigationContent>
        <DefaultBackHandler navigation={navigation} state={state} />
        <View style={fill} />
      </NavigationContent>
    );
  }

  // ── Desktop / web layered backend ───────────────────────────────────
  // Render the focused route + the one directly below (the one that would
  // be revealed by a back) + any closing routes (animating out). All other
  // mounted routes are kept in mountedRef (state preserved) but rendered
  // with display:'none' so raym3 skips their subtree.
  const lastIndex = state.index;
  const belowIndex = lastIndex - 1;
  const visibleKeys = new Set<string>();
  if (lastIndex >= 0) visibleKeys.add(state.routes[lastIndex].key);
  if (belowIndex >= 0) visibleKeys.add(state.routes[belowIndex].key);
  for (const k of closingKeysRef.current) visibleKeys.add(k);
  // closingDescriptorsRef also tracks the route's surfaceId-free
  // descriptor for rendering after the route leaves state.routes.

  return (
    <NavigationContent>
      <DefaultBackHandler navigation={navigation} state={state} />
      <View style={{ flex: 1 }}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key] as DescriptorWithKey;
          const isFocused = index === lastIndex;
          const isClosing = closingKeysRef.current.has(route.key);
          // Non-visible, non-closing routes: mount but don't render content.
          // Keeps React state alive (keepMounted semantics) while skipping
          // raym3 layout + draw.
          const isVisible = visibleKeys.has(route.key) || (keepMounted && false);
          if (!isFocused && !isClosing && !isVisible) {
            return null;
          }
          // Stash the routeIndex so SceneView can identify itself.
          (route as { params?: Record<string, unknown> }).params = {
            ...(route.params ?? {}),
            surfaceId: 0, // desktop: no engine surface
          };
          return (
            <SceneView
              key={route.key}
              descriptor={descriptor}
              isFocused={isFocused}
              isClosing={isClosing}
              defaultAnimation={defaultAnimation}
              defaultDuration={defaultDuration}
              bgColor={bgColor}
              revealedSurfaceId={0}
              belowSurfaceId={0}
              surfaceId={0}
              onExitSettled={(key) => {
                if (closingKeysRef.current.has(key)) {
                  closingKeysRef.current.delete(key);
                  closingDescriptorsRef.current.delete(key);
                }
                forceUpdate();
              }}
            />
          );
        })}
        {Array.from(closingDescriptorsRef.current.entries()).map(
          ([key, descriptor]) => {
            if (state.routes.find((r) => r.key === key)) return null;
            return (
              <SceneView
                key={`closing-${key}`}
                descriptor={descriptor}
                isFocused={false}
                isClosing={true}
                defaultAnimation={defaultAnimation}
                defaultDuration={defaultDuration}
                bgColor={bgColor}
                revealedSurfaceId={0}
                belowSurfaceId={0}
                surfaceId={0}
                onExitSettled={(k) => {
                  if (closingKeysRef.current.has(k)) {
                    closingKeysRef.current.delete(k);
                    closingDescriptorsRef.current.delete(k);
                  }
                  forceUpdate();
                }}
              />
            );
          },
        )}
      </View>
    </NavigationContent>
  );
}

// ─── Android sub-root wrapper ─────────────────────────────────────────────
//
// Each surface has its own React root, and within that root we only render
// the SceneView for the surface's own route (and any closing route that was
// launched from this surface). The full-stack is shared across surfaces, but
// each surface only draws its own tree; the engine's render loop composites
// the surfaces in z-order.

type AndroidSceneViewRootProps = {
  routeKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptors: Record<string, any>;
  state: StackNavigationState<ParamListBase>;
  closingKeys: Set<string>;
  closingDescriptors: Map<string, DescriptorWithKey>;
  defaultAnimation: StackAnimation;
  defaultDuration: number;
  bgColor: number;
  belowSurfaceId: number;
  revealedSurfaceId: number;
  surfaceId: number;
  onExitSettled: (key: string) => void;
};

function AndroidSceneViewRoot(props: AndroidSceneViewRootProps) {
  const { routeKey, descriptors, state, closingKeys, closingDescriptors, onExitSettled, defaultAnimation, defaultDuration, bgColor } = props;
  const thisRoute = state.routes.find((r) => r.key === routeKey);
  if (!thisRoute) return null;
  const descriptor = descriptors[routeKey] as DescriptorWithKey;
  return (
    <View style={fill}>
      <SceneView
        descriptor={descriptor}
        isFocused={state.routes[state.index].key === routeKey}
        isClosing={false}
        defaultAnimation={defaultAnimation}
        defaultDuration={defaultDuration}
        bgColor={bgColor}
        revealedSurfaceId={props.revealedSurfaceId}
        belowSurfaceId={props.belowSurfaceId}
        surfaceId={props.surfaceId}
        onExitSettled={onExitSettled}
      />
      {Array.from(closingDescriptors.entries())
        .filter(([k]) => closingKeys.has(k))
        .map(([k, d]) => (
          <SceneView
            key={`closing-${k}`}
            descriptor={d}
            isFocused={false}
            isClosing={true}
            defaultAnimation={defaultAnimation}
            defaultDuration={defaultDuration}
            bgColor={bgColor}
            revealedSurfaceId={0}
            belowSurfaceId={0}
            surfaceId={0}
            onExitSettled={onExitSettled}
          />
        ))}
    </View>
  );
}

// surfaceIdBelow: returns the surfaceId of the route at state.index - 1
// (the one directly below the focused surface in the visible stack), used
// to re-push the revealed surface into the engine stack on pop.
function surfaceIdBelow(
  _key: string,
  state: StackNavigationState<ParamListBase>,
  mounted: Map<string, MountedScreen>,
): number {
  const belowIndex = state.index - 1;
  if (belowIndex < 0) return 0;
  const belowRoute = state.routes[belowIndex];
  if (!belowRoute) return 0;
  const m = mounted.get(belowRoute.key);
  return m?.surfaceId ?? 0;
}

// ─── public API ──────────────────────────────────────────────────────────

/**
 * Drop-in replacement for createNativeStackNavigator(). Same Navigator/Screen
 * API as react-navigation's built-in stacks — app code is identical.
 */
export const createStackNavigator = createNavigatorFactory(StackNavigator);
export const createNativeStackNavigator = createStackNavigator;

/**
 * NavigationContainer backed by core's platform-agnostic BaseNavigationContainer
 * (no react-native dependency). Hardware back is wired via the default
 * hardwareBackPress listener registered inside StackNavigator; react-navigation's
 * useBackButton from `@react-navigation/native` also works when its
 * `react-native` BackHandler import is aliased to ours.
 */
export const NavigationContainer = React.forwardRef<
  unknown,
  React.ComponentProps<typeof BaseNavigationContainer>
>(function NavigationContainer(props, ref) {
  return <BaseNavigationContainer ref={ref as never} {...props} />;
});

export const navigationBackend = isAndroid ? 'native' : 'layered';

// Re-export the hooks/utilities apps use, straight from core/routers.
export {
  useNavigation,
  useRoute,
  useFocusEffect,
  useIsFocused,
  useNavigationState,
} from '@react-navigation/core';
export { CommonActions, StackActions } from '@react-navigation/routers';
// Re-export the engine-side back handler so apps that imported it from
// react-navigation's native package via bundler alias also work here.
export { BackHandler, useBackHandler } from '@rayact/react';
export type { BackHandlerSubscription } from '@rayact/react';
