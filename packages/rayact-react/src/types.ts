import type React from 'react';
import type { HostBridge, HostNode, HostNodeType, RayactAsset, RayactRuntime } from '@rayact/runtime';

export type RayactElementType =
  | 'View'
  | 'Text'
  | 'Button'
  | 'Image'
  | 'Icon'
  | 'TextInput'
  | 'ScrollView'
  | 'Modal'
  | 'SafeArea'
  | 'StatusBar'
  | 'ActivityIndicator'
  | 'AvoidKeyboard'
  | 'AppBar'
  | 'Badge'
  | 'BottomSheet'
  | 'ButtonGroup'
  | 'Card'
  | 'Carousel'
  | 'Checkbox'
  | 'Chip'
  | 'DatePicker'
  | 'Dialog'
  | 'Divider'
  | 'ExtendedFab'
  | 'Fab'
  | 'FabMenu'
  | 'IconButton'
  | 'MaterialList'
  | 'LoadingIndicator'
  | 'Menu'
  | 'MenuItem'
  | 'NavigationBar'
  | 'NavigationBarItem'
  | 'NavigationDrawer'
  | 'NavigationRail'
  | 'ProgressIndicator'
  | 'RadioButton'
  | 'RangeSlider'
  | 'Search'
  | 'SearchBar'
  | 'SegmentedButton'
  | 'SideSheet'
  | 'Slider'
  | 'Snackbar'
  | 'SplitButton'
  | 'Switch'
  | 'Tabs'
  | 'TextField'
  | 'TimePicker'
  | 'Toolbar'
  | 'Tooltip'
  | 'Popover'
  | HostNodeType;

export interface RayactHostInstance {
  kind: 'instance';
  type: HostNodeType;
  node: HostNode;
  props: Record<string, unknown>;
  parent?: RayactHostInstance | RayactContainer;
  children: Array<RayactHostInstance | RayactTextInstance>;
}

export interface RayactTextInstance {
  kind: 'text';
  text: string;
  parent?: RayactHostInstance | RayactContainer;
}

export interface RayactContainer {
  kind: 'container';
  rootNode: HostNode;
  bridge: HostBridge;
  runtime: RayactRuntime;
  children: Array<RayactHostInstance | RayactTextInstance>;
}

export interface RayactRoot {
  readonly container: RayactContainer;
  render(element: React.ReactNode): void;
  unmount(): void;
}

// Numeric style values are raym3 layout dp, not physical pixels. Native hosts
// convert to/from pixels only at render, font/icon raster, safe-area, and input
// boundaries.
export type Style = Record<string, unknown>;
export type StyleProp = Style | null | false | undefined | StyleProp[];

export type ColorValue = number | string;

export interface BaseProps {
  ref?: React.Ref<any>;
  children?: React.ReactNode;
  className?: string;
  style?: StyleProp;
  zIndex?: number;
  /** When true, this node's layout box blocks input to content painted underneath. */
  capturesInput?: boolean;
  /** CSS pointer-events. Use 'none' to let taps pass through this node. */
  pointerEvents?: 'none' | 'auto';
  /** Internal: marks the AppBar title slot so the renderer can recenter it. */
  appBarTitle?: boolean;
  onPress?: () => void;
  onClick?: () => void;
  onDragStart?: (event: { x: number; y: number }) => void;
  onDragMove?: (event: { x: number; y: number }) => void;
  onDragEnd?: (event: { x: number; y: number }) => void;
  /**
   * RN-style layout callback. Receives `{ nativeEvent: { layout: { x, y, width, height } } }`.
   * Used by the navigation transition container to size the slide/scale
   * interpolator. Mirrors react-native's View.onLayout.
   */
  onLayout?: (event: {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }) => void;
}

export interface AvoidKeyboardProps extends BaseProps {
  /** `position` shifts with `bottom`; `padding` adds `marginBottom`. Default: `position`. */
  behavior?: 'padding' | 'position';
  /** Animate offset changes via CSS layout transitions. Default: `true`. */
  animate?: boolean;
}

export type SafeAreaEdge = 'top' | 'right' | 'bottom' | 'left';

export interface SafeAreaProps extends BaseProps {
  /** When set, only these edges receive system inset padding. Default: all four. */
  edges?: SafeAreaEdge[];
}

export interface TextProps extends BaseProps {
  text?: string;
}

export interface ButtonProps extends BaseProps {
  label?: string;
  text?: string;
}

export interface ImageProps extends BaseProps {
  src?: string | RayactAsset;
  source?: string | RayactAsset;
}

export interface IconProps extends BaseProps {
  name?: string;
  icon?: string;
  size?: number;
  color?: ColorValue;
  variant?: 'outlined' | 'rounded' | 'sharp';
  filled?: boolean;
}

/** react-native TextInput.keyboardType (cross-platform subset + common iOS/Android values). */
export type KeyboardType =
  | 'default'
  | 'number-pad'
  | 'decimal-pad'
  | 'numeric'
  | 'email-address'
  | 'phone-pad'
  | 'url'
  | 'ascii-capable'
  | 'visible-password';

/** react-native TextInput.returnKeyType (cross-platform subset). */
export type ReturnKeyType = 'done' | 'go' | 'next' | 'search' | 'send' | 'default';

export type AutoCapitalize = 'none' | 'sentences' | 'words' | 'characters';

export interface TextInputSelection {
  start: number;
  end?: number;
}

export interface TextInputChangeEvent {
  nativeEvent: { text: string; target?: number; eventCount?: number };
}
export interface TextInputSubmitEvent {
  nativeEvent: { text: string; target?: number };
}
export interface TextInputEndEditingEvent {
  nativeEvent: { text: string; target?: number };
}
export interface TextInputFocusEvent {
  nativeEvent: { text?: string; target?: number };
}
export interface TextInputSelectionChangeEvent {
  nativeEvent: { selection: { start: number; end: number }; target?: number };
}
export interface TextInputKeyPressEvent {
  nativeEvent: { key: string };
}
export interface TextInputContentSizeChangeEvent {
  nativeEvent: { contentSize: { width: number; height: number } };
}

/**
 * Props mirror react-native's TextInput (https://reactnative.dev/docs/textinput).
 * The field is rendered + edited entirely by the raym3 engine (Flutter model:
 * caret/selection/composing/handles/clipboard live in native; the OS only
 * proxies the IME), so behaviour is 1:1 with Flutter's EditableText while the
 * surface matches RN.
 */
export interface TextInputProps extends BaseProps {
  // ── Value ────────────────────────────────────────────────────────────────
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: ColorValue;
  maxLength?: number;

  // ── Keyboard / input behaviour ─────────────────────────────────────────────
  keyboardType?: KeyboardType;
  returnKeyType?: ReturnKeyType;
  autoCapitalize?: AutoCapitalize;
  autoCorrect?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
  /** false === RN's editable={false}. */
  editable?: boolean;
  /** Multiline field (textarea). */
  multiline?: boolean;
  numberOfLines?: number;
  /** Blur (and not insert a newline) when the return key is pressed. Default: !multiline. */
  blurOnSubmit?: boolean;
  selectTextOnFocus?: boolean;
  caretHidden?: boolean;
  contextMenuHidden?: boolean;

  // ── Appearance ─────────────────────────────────────────────────────────────
  selectionColor?: ColorValue;
  cursorColor?: ColorValue;
  textAlign?: 'left' | 'center' | 'right' | 'auto';
  /** Controlled selection range. */
  selection?: TextInputSelection;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  onChangeText?: (value: string) => void;
  onChange?: (e: TextInputChangeEvent) => void;
  onSubmitEditing?: (e: TextInputSubmitEvent) => void;
  onEndEditing?: (e: TextInputEndEditingEvent) => void;
  onSelectionChange?: (e: TextInputSelectionChangeEvent) => void;
  onKeyPress?: (e: TextInputKeyPressEvent) => void;
  onContentSizeChange?: (e: TextInputContentSizeChangeEvent) => void;
  onFocus?: (e?: TextInputFocusEvent) => void;
  onBlur?: (e?: TextInputFocusEvent) => void;

  // ── raym3/M3 rendering controls (not in RN; advanced) ──────────────────────
  variant?: 'filled' | 'outlined' | 'underline';
  drawOutline?: boolean;
  drawBackground?: boolean;
  /** When false, the field paints no own hover/focus highlight (parent owns it). */
  drawStateLayer?: boolean;
  label?: string;
}

export interface SliderProps extends BaseProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  size?: 'xs' | 's' | 'm' | 'l' | 'xl';
  onValueChange?: (value: number) => void;
}

export interface ScrollViewProps extends BaseProps {
  horizontal?: boolean;
  scrollEnabled?: boolean;
  contentContainerStyle?: StyleProp;
  onScroll?: (event: unknown) => void;
}

export interface ListRenderItem<T> {
  item: T;
  index: number;
}

export interface ListProps<T = unknown> extends Omit<ScrollViewProps, 'children'> {
  data: readonly T[];
  renderItem: (info: ListRenderItem<T>) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  estimatedItemSize?: number;
}

export interface ModalProps extends BaseProps {
  visible?: boolean;
  backdropColor?: ColorValue;
  onRequestClose?: () => void;
}

export interface StatusBarProps extends BaseProps {
  hidden?: boolean;
  style?: StyleProp;
  barStyle?: 'light' | 'dark' | 'auto';
  backgroundColor?: ColorValue;
}

export interface ActivityIndicatorProps extends BaseProps {
  animating?: boolean;
  color?: ColorValue;
  size?: number | 'small' | 'large';
  wavy?: boolean;
  wavelength?: number;
}

export interface MaterialComponentProps extends BaseProps {
  label?: string;
  text?: string;
  title?: string;
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  wavy?: boolean;
  open?: boolean;
  layout?: 'row' | 'column';
  progress?: number;
  startProgress?: number;
  endProgress?: number;
  start?: number;
  end?: number;
  lower?: number;
  upper?: number;
  wavelength?: number;
}

/**
 * Top app bar.
 *
 * Color is set through `style` passthrough (no dedicated color props):
 * - `style.backgroundColor` fills the bar AND the status-bar safe-area spacer.
 * - `style.text.color` sets the (string) title color; `titleStyle.text.color`
 *   overrides it. A node `title` is rendered as-is — color it yourself.
 * - Leading/action icons are caller-colored (`<Icon color=… />`), as in
 *   `NavigationBar`.
 */
export interface AppBarProps extends Omit<MaterialComponentProps, 'title'> {
  /**
   * Extends the app bar background behind the OS status area when it sits
   * outside `SafeAreaView`. Alias: `ignoreSafeAreaView`. Mirrors
   * `NavigationBar`'s `extendBottomPaddingToNavigationBar`, at the top.
   */
  extendTopPaddingToAppBar?: boolean;
  ignoreSafeAreaView?: boolean;
  /** M3 top-app-bar variant. Default `'small'`. */
  variant?: 'small' | 'center' | 'medium' | 'large';
  /** Title slot. String renders M3 title typography; a node is used as-is. */
  title?: React.ReactNode;
  /** Leading slot (e.g. back/menu IconButton), pinned to the start. */
  leading?: React.ReactNode;
  /** Trailing action slot(s), pinned to the end. */
  actions?: React.ReactNode | React.ReactNode[];
  /**
   * Center the title across the full bar width (Flutter `centerTitle`).
   * Defaults to `true` on Apple platforms and for the `center` variant,
   * `false` (start-aligned, M3) otherwise.
   */
  centerTitle?: boolean;
  /** Style override for the title text (e.g. `{ text: { fontSize } }`). */
  titleStyle?: StyleProp;
}

export interface NavigationBarProps extends MaterialComponentProps {
  /**
   * Extends the bar background behind the OS navigation area when it sits
   * outside `SafeAreaView`. Alias: `ignoreSafeAreaView`.
   */
  extendBottomPaddingToNavigationBar?: boolean;
  ignoreSafeAreaView?: boolean;
}

export interface TabBarProps extends BaseProps {
  /**
   * Extends the bar background behind the OS navigation area when it sits
   * outside `SafeAreaView`. Alias: `ignoreSafeAreaView`.
   */
  extendBottomPaddingToNavigationBar?: boolean;
  ignoreSafeAreaView?: boolean;
}

export interface TabsProps extends MaterialComponentProps {
  /**
   * Extends the tab background behind the OS status area when it sits outside
   * `SafeAreaView`. Alias: `ignoreSafeAreaView`.
   */
  extendTopPaddingToStatusBar?: boolean;
  ignoreSafeAreaView?: boolean;
}

export interface BadgeProps extends MaterialComponentProps {
  value?: string | number;
}

export interface SearchBarProps extends BaseProps {
  value?: string;
  placeholder?: string;
  onChangeText?: (value: string) => void;
  // Slots. Defaults: leading = search icon. trailing/trailing2 render to the
  // right of the field (e.g. clear, mic, avatar).
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  trailing2?: React.ReactNode;
  // Secondary styles applied ONLY when the corresponding slot is an <Icon>.
  leadingStyle?: StyleProp;
  trailingStyle?: StyleProp;
}

export interface DatePickerProps extends BaseProps {
  open?: boolean;
  value?: string; // e.g. "YYYY-MM-DD"
  label?: string;
  /** 'modal' (default) shows a centered overlay dialog.
   *  'docked' / 'input' shows an outlined text field with a dropdown calendar. */
  variant?: 'modal' | 'docked' | 'input';
  onChange?: (date: string) => void;
  onRequestClose?: () => void;
  onDismiss?: () => void;
}

export interface TimePickerProps extends BaseProps {
  open?: boolean;
  value?: string; // e.g. "HH:MM" (24h)
  /** 'modal' (default) | 'input' */
  variant?: 'modal' | 'input';
  onChange?: (time: string) => void;
  onRequestClose?: () => void;
  onDismiss?: () => void;
}

export interface PopoverProps extends MaterialComponentProps {
  anchor?: number;
  placement?: 'auto' | 'below' | 'above';
  /** Full-screen backdrop scrim behind the popover (dismissible via onRequestClose). */
  scrim?: boolean;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      View: BaseProps;
      Text: TextProps;
      Button: ButtonProps;
      Image: ImageProps;
      Icon: IconProps;
      TextInput: TextInputProps;
      ScrollView: ScrollViewProps;
      Modal: ModalProps;
      SafeArea: SafeAreaProps;
      TabBar: TabBarProps;
      StatusBar: StatusBarProps;
      ActivityIndicator: ActivityIndicatorProps;
      AvoidKeyboard: AvoidKeyboardProps;
      AppBar: AppBarProps;
      Badge: BadgeProps;
      BottomSheet: MaterialComponentProps;
      ButtonGroup: MaterialComponentProps;
      Card: MaterialComponentProps;
      Carousel: MaterialComponentProps;
      Checkbox: MaterialComponentProps;
      Chip: MaterialComponentProps;
      DatePicker: DatePickerProps;
      Dialog: MaterialComponentProps;
      Divider: MaterialComponentProps;
      ExtendedFab: MaterialComponentProps;
      Fab: MaterialComponentProps;
      FabMenu: MaterialComponentProps;
      IconButton: MaterialComponentProps;
      LoadingIndicator: MaterialComponentProps;
      Menu: MaterialComponentProps;
      NavigationBar: NavigationBarProps;
      NavigationBarItem: MaterialComponentProps;
      NavigationDrawer: MaterialComponentProps;
      NavigationRail: MaterialComponentProps;
      ProgressIndicator: MaterialComponentProps;
      RadioButton: MaterialComponentProps;
      SearchBar: SearchBarProps;
      SegmentedButton: MaterialComponentProps;
      SideSheet: MaterialComponentProps;
      Slider: MaterialComponentProps;
      Snackbar: MaterialComponentProps;
      SplitButton: MaterialComponentProps;
      Switch: MaterialComponentProps;
      Tabs: TabsProps;
      TimePicker: TimePickerProps;
      Toolbar: MaterialComponentProps;
      Tooltip: MaterialComponentProps;
      Popover: PopoverProps;
      'rayact-view': BaseProps;
      'rayact-text': TextProps;
      'rayact-button': ButtonProps;
      'rayact-image': ImageProps;
      'rayact-icon': IconProps;
      'rayact-text-input': TextInputProps;
      'rayact-scroll-view': ScrollViewProps;
      'rayact-modal': ModalProps;
      'rayact-safe-area': BaseProps;
      'rayact-status-bar': StatusBarProps;
      'rayact-activity-indicator': ActivityIndicatorProps;
      'rayact-avoid-keyboard': BaseProps;
      'rayact-app-bar': MaterialComponentProps;
      'rayact-badge': BadgeProps;
      'rayact-banner': MaterialComponentProps;
      'rayact-bottom-app-bar': MaterialComponentProps;
      'rayact-bottom-sheet': MaterialComponentProps;
      'rayact-data-table': MaterialComponentProps;
      'rayact-docked-toolbar': MaterialComponentProps;
      'rayact-floating-toolbar': MaterialComponentProps;
      'rayact-button-group': MaterialComponentProps;
      'rayact-card': MaterialComponentProps;
      'rayact-carousel': MaterialComponentProps;
      'rayact-checkbox': MaterialComponentProps;
      'rayact-chip': MaterialComponentProps;
      'rayact-date-picker': DatePickerProps;
      'rayact-dialog': MaterialComponentProps;
      'rayact-divider': MaterialComponentProps;
      'rayact-extended-fab': MaterialComponentProps;
      'rayact-fab': MaterialComponentProps;
      'rayact-fab-menu': MaterialComponentProps;
      'rayact-icon-button': MaterialComponentProps;
      'rayact-loading-indicator': MaterialComponentProps;
      'rayact-menu': MaterialComponentProps;
      'rayact-menu-item': MaterialComponentProps;
      'rayact-navigation-bar': MaterialComponentProps;
      'rayact-navigation-bar-item': MaterialComponentProps;
      'rayact-navigation-drawer': MaterialComponentProps;
      'rayact-navigation-rail': MaterialComponentProps;
      'rayact-progress-indicator': MaterialComponentProps;
      'rayact-radio-button': MaterialComponentProps;
      'rayact-search-bar': SearchBarProps;
      'rayact-segmented-button': MaterialComponentProps;
      'rayact-side-sheet': MaterialComponentProps;
      'rayact-slider': MaterialComponentProps;
      'rayact-snackbar': MaterialComponentProps;
      'rayact-split-button': MaterialComponentProps;
      'rayact-switch': MaterialComponentProps;
      'rayact-tabs': MaterialComponentProps;
      'rayact-time-picker': TimePickerProps;
      'rayact-toolbar': MaterialComponentProps;
      'rayact-tooltip': MaterialComponentProps;
      'rayact-popover': PopoverProps;
    }
  }
}
