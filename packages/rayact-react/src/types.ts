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

export interface TextInputProps extends BaseProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'email' | 'number' | 'phone' | 'password' | 'multiline' | string;
  autocorrect?: boolean;
  secure?: boolean;
  imeAction?: 'done' | 'go' | 'next' | 'send' | 'search' | string;
  secureTextEntry?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  onChangeText?: (value: string) => void;
  onFocus?: (e?: unknown) => void;
  onBlur?: (e?: unknown) => void;
  // M3 text-field rendering controls (used e.g. by SearchBar for a borderless field).
  variant?: 'filled' | 'outlined' | 'underline';
  drawOutline?: boolean;
  drawBackground?: boolean;
  // When false, the field paints no own hover/focus highlight; the parent (e.g.
  // SearchBar) owns the single state layer spanning the whole element.
  drawStateLayer?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
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
      SafeArea: BaseProps;
      StatusBar: StatusBarProps;
      ActivityIndicator: ActivityIndicatorProps;
      AvoidKeyboard: AvoidKeyboardProps;
      AppBar: MaterialComponentProps;
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
      NavigationBar: MaterialComponentProps;
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
      Tabs: MaterialComponentProps;
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
