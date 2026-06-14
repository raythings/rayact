import './avoid-keyboard.css';
import type React from 'react';
import ReactNS from 'react';
import { getDefaultRuntime } from '@rayact/runtime';
import { createHostContainer, RayactReconciler } from './reconciler';
import { RayactThemeProvider } from './theme/RayactThemeProvider';
import type { RayactContainer, RayactRoot } from './types';

export type {
  ActivityIndicatorProps,
  AppBarProps,
  AvoidKeyboardProps,
  BaseProps,
  BadgeProps,
  ButtonProps,
  ColorValue,
  IconProps,
  ImageProps,
  ListProps,
  MaterialComponentProps,
  ModalProps,
  NavigationBarProps,
  RayactContainer,
  RayactRoot,
  SafeAreaEdge,
  SafeAreaProps,
  ScrollViewProps,
  SearchBarProps,
  StatusBarProps,
  Style,
  StyleProp,
  TabBarProps,
  TabsProps,
  TextInputProps,
  TextProps
} from './types';

export { ExternalView, NativeTextInput } from './components';
export {
  ActivityIndicator,
  AppBar,
  AvoidKeyboard,
  Badge,
  Banner,
  BottomAppBar,
  BottomSheet,
  Button,
  ButtonGroup,
  Card,
  Carousel,
  Checkbox,
  Chip,
  DataTable,
  DatePicker,
  Dialog,
  DockedToolbar,
  Divider,
  FloatingToolbar,
  ExtendedFab,
  Fab,
  FabMenu,
  Icon,
  IconButton,
  Image,
  List,
  MaterialList,
  LoadingIndicator,
  Menu,
  MenuItem,
  Modal,
  NavigationBar,
  NavigationBarItem,
  NavigationDrawer,
  NavigationRail,
  ProgressIndicator,
  RadioButton,
  RangeSlider,
  SafeArea,
  SafeAreaView,
  ScrollView,
  Search,
  SearchBar,
  SegmentedButton,
  SideSheet,
  Slider,
  Snackbar,
  SplitButton,
  StatusBar,
  Switch,
  TabBar,
  Tabs,
  Text,
  TextField,
  TimePicker,
  Input,
  TextInput,
  Toolbar,
  Tooltip,
  View
} from './components';
export { RayactReconciler };
export { createRuntime, getDefaultRuntime } from '@rayact/runtime';
export { useTheme, withTheme } from './theme/theming';
export { useKeyboard } from './hooks/useKeyboard';
export type { KeyboardInsets } from './hooks/useKeyboard';
export { useSafeAreaInsets } from './hooks/useSafeAreaInsets';
export type { SafeAreaInsets } from './hooks/useSafeAreaInsets';
export { useColorScheme, useColorSchemePreference, setColorSchemePreference, cycleColorSchemePreference } from './theme/colorSchemeStore';
export type { ColorSchemePreference } from './theme/colorSchemeStore';
export { RayactThemeProvider } from './theme/RayactThemeProvider';
export type { RayactTheme } from './theme/tokens';
export { useAnimatedValue, easeInOutCubic } from './anim/useAnimatedValue';
export { useSpring } from './anim/useSpring';
export { SharedValue, useSharedValue, withTiming, withSpring } from './anim/SharedValue';
export { BackHandler, useBackHandler } from './BackHandler';
export type { BackHandlerSubscription } from './BackHandler';

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
      // Flush synchronously so the teardown (setRoot(null) + disposeNode) runs
      // NOW, while the caller still has this root's screen bound as current.
      // Otherwise the teardown is deferred to a microtask that runs after the
      // caller has switched the current screen (e.g. a navigator popping back
      // to a lower screen), and setRoot(null) would null the WRONG screen's
      // root — blanking the screen being revealed.
      const flush = (RayactReconciler as { flushSync?: (fn: () => void) => void }).flushSync;
      const doUnmount = () => {
        RayactReconciler.updateContainer(null, fiberRoot, null, () => {
          container.bridge.setRoot(null);
          container.bridge.disposeNode(container.rootNode);
        });
      };
      if (flush) flush(doUnmount);
      else doUnmount();
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
  root.render(
    ReactNS.createElement(RayactThemeProvider, null, element)
  );
  return root;
}
