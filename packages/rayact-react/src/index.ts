import './avoid-keyboard.css';
import type React from 'react';
import ReactNS from 'react';
import { getDefaultRuntime } from '@rayact/runtime';
import { createHostContainer, RayactReconciler } from '@rayact/renderer';
import { RayactThemeProvider } from './theme/RayactThemeProvider.js';
import type { RayactContainer, RayactRoot } from './types.js';

export type {
  ActivityIndicatorProps,
  AccessibilityAction,
  AccessibilityRole,
  AccessibilityState,
  AccessibilityValue,
  AppBarProps,
  AvoidKeyboardProps,
  KeyboardStickyViewProps,
  BaseProps,
  BadgeProps,
  ButtonProps,
  ColorValue,
  IconProps,
  ImageProps,
  ListProps,
  FlatListProps,
  MaintainVisibleContentPosition,
  MaterialComponentProps,
  ModalProps,
  NavigationBarProps,
  PressableProps,
  PressableStateCallbackType,
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
  TextProps,
  TextStyle,
  ViewProps,
  ViewStyle,
  SliderProps,
  DatePickerProps,
  TimePickerProps,
  PopoverProps,
  ListRenderItem
} from './types.js';

export { ExternalView, NativeTextInput } from './components.js';
export type { TextInputHandle, ScrollViewHandle, ExternalViewProps } from './components.js';
export { FlatList, List } from './FlatList.js';
export type { FlatListHandle } from './FlatList.js';
export {
  ActivityIndicator,
  AppBar,
  AvoidKeyboard,
  KeyboardStickyView,
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
  MaterialList,
  LoadingIndicator,
  Menu,
  MenuItem,
  Modal,
  NavigationBar,
  NavigationBarItem,
  NavigationDrawer,
  NavigationRail,
  Pressable,
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
} from './components.js';
export { RayactReconciler };
export { createRuntime, getDefaultRuntime } from '@rayact/runtime';
// Extension point for native modules that ship a component (see @rayact/svg).
export { registerNativeComponent } from './moduleComponents.js';
export type { ModuleNodeHandlers } from './moduleComponents.js';
export { useTheme, withTheme } from './theme/theming.js';
export { useKeyboard } from './hooks/useKeyboard.js';
export type { KeyboardInsets } from './hooks/useKeyboard.js';
export { useSafeAreaInsets } from './hooks/useSafeAreaInsets.js';
export type { SafeAreaInsets } from './hooks/useSafeAreaInsets.js';
export { useColorScheme, useColorSchemePreference, setColorSchemePreference, cycleColorSchemePreference } from './theme/colorSchemeStore.js';
export type { ColorSchemePreference } from './theme/colorSchemeStore.js';
export {
  useCSSVariable,
  getCSSVariable,
  setCSSVariable,
  setCSSVariables,
  resetCSSVariables
} from './theme/cssVariableStore.js';
export { RayactThemeProvider } from './theme/RayactThemeProvider.js';
export type { RayactTheme } from './theme/tokens.js';
export { useAnimatedValue, easeInOutCubic } from './anim/useAnimatedValue.js';
export { useSpring } from './anim/useSpring.js';
export { SharedValue, useSharedValue, withTiming, withSpring } from './anim/SharedValue.js';
export { BackHandler, useBackHandler } from './BackHandler.js';
export type { BackHandlerSubscription } from './BackHandler.js';
export { Keyboard, useKeyboardEvents } from './Keyboard.js';
export type {
  KeyboardCaptureOptions,
  KeyboardEventListener,
  KeyboardEventType,
  KeyboardKeyEvent,
  KeyboardSubscription,
  KeyboardTextInputEvent,
  RayactKeyboardEvent,
  UseKeyboardEventsOptions,
} from './Keyboard.js';
export {
  setAccessibilityFocus,
  useReducedMotion,
} from './accessibility.js';

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
  // Skip the initial render only on a GENUINE hot reload — i.e. a root was
  // already created and mounted. Module HMR sets __RAYACT_HMR_ACTIVE__ (via the
  // dev-bundle footer) before the project entry's first render(<App/>) runs, so
  // gating purely on that flag skips the initial mount and the pane stays black.
  const alreadyMounted = !!(globalThis as GlobalWithRoot).__rayactReactRoot;
  // An uncaught render error leaves a mounted-but-dead fiber root: React will
  // not re-render it, and Fast Refresh cannot revive it. The dev error overlay
  // is the signal. Drop the dead root so the entry's render() below mounts a
  // fresh one — this is what lets fixing the code clear the error screen
  // instead of leaving the app stuck on it until it is restarted.
  let crashed = false;
  try {
    crashed = !!getDefaultRuntime().bridge.hasError?.();
  } catch { /* runtime not initialised — treat as healthy */ }
  if (crashed && alreadyMounted) {
    delete (globalThis as GlobalWithRoot).__rayactReactRoot;
  }
  if (!crashed && (globalThis as Record<string, unknown>).__RAYACT_HMR_ACTIVE__ && alreadyMounted) {
    return getOrCreateRoot();
  }
  const root = getOrCreateRoot();
  const decorateRoot = (globalThis as typeof globalThis & {
    __rayactDecorateRoot?: (node: React.ReactNode) => React.ReactNode;
  }).__rayactDecorateRoot;
  const renderedElement = decorateRoot ? decorateRoot(element) : element;
  root.render(
    ReactNS.createElement(RayactThemeProvider, null, renderedElement)
  );
  // The legacy-root render above commits synchronously, and the binary/batched
  // renderers set the native root inside that commit without ever calling
  // bridge.setRoot. Tell the bridge where the app tree lives so the dev error
  // overlay bookkeeping (hasError/clearError) tracks reality — this is what
  // retires the error screen after a successful recovery render.
  try {
    getDefaultRuntime().bridge.noteAppRoot?.(root.container.rootNode);
  } catch { /* bridge without dev overlay support */ }
  return root;
}
