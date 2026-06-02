// @rayact/navigation — run the REAL react-navigation on rayact.
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
// Backend split (Platform.OS), mirroring react-navigation's own .tsx/.native:
//   - desktop/web: layered <View> stack in the single tree (top focused).
//   - android: same today; native per-screen containers are a later pass that
//     swaps the view backend without touching app code or the router.

import * as React from 'react';
import {
  BaseNavigationContainer,
  createNavigatorFactory,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type ParamListBase,
  type StackNavigationState,
} from '@react-navigation/core';
import {
  StackRouter,
  type StackRouterOptions,
  type StackActionHelpers,
} from '@react-navigation/routers';
import { View } from '@rayact/react';
import { Platform } from '@rayact/shared';

// Per-screen options accepted by <Stack.Screen options={...} />.
export type RayactStackNavigationOptions = {
  /** Hide this screen's container without unmounting (keeps component state). */
  detachInactiveScreens?: boolean;
};

type StackNavigationConfig = {
  /** Keep non-focused screens mounted (default true) so their state survives. */
  keepMounted?: boolean;
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

const fill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function StackNavigator({
  id,
  initialRouteName,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  keepMounted = true,
  ...rest
}: Props) {
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

  // Render the focused route plus the ones beneath it (so their component state
  // survives a push/pop). The focused screen is last → drawn on top.
  const lastIndex = state.index;
  const routesToRender = keepMounted ? state.routes : [state.routes[lastIndex]];

  return (
    <NavigationContent>
      <View style={{ flex: 1 }}>
        {routesToRender.map((route) => {
          const descriptor = descriptors[route.key];
          const focused = state.routes[lastIndex].key === route.key;
          // Background screens stay mounted but non-interactive and behind.
          const style = focused
            ? fill
            : { ...fill, pointerEvents: 'none' as const };
          return (
            <View key={route.key} style={style}>
              {descriptor.render()}
            </View>
          );
        })}
      </View>
    </NavigationContent>
  );
}

/**
 * Drop-in replacement for createNativeStackNavigator(). Same Navigator/Screen
 * API as react-navigation's built-in stacks — app code is identical.
 */
export const createStackNavigator = createNavigatorFactory(StackNavigator);
export const createNativeStackNavigator = createStackNavigator;

/**
 * NavigationContainer backed by core's platform-agnostic BaseNavigationContainer
 * (no react-native dependency). Hardware-back wiring on Android is added later
 * via a JNI back event → navigation.goBack().
 */
export const NavigationContainer = React.forwardRef(function NavigationContainer(
  props: React.ComponentProps<typeof BaseNavigationContainer>,
  ref: React.Ref<unknown>
) {
  return <BaseNavigationContainer ref={ref as never} {...props} />;
});

export const navigationBackend = Platform.OS === Platform.ANDROID ? 'native' : 'layered';

// Re-export the hooks/utilities apps use, straight from core/routers.
export {
  useNavigation,
  useRoute,
  useFocusEffect,
  useIsFocused,
  useNavigationState,
} from '@react-navigation/core';
export { CommonActions, StackActions } from '@react-navigation/routers';
