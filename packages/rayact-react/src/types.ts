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
  | 'LoadingIndicator'
  | 'Menu'
  | 'NavigationBar'
  | 'NavigationBarItem'
  | 'NavigationDrawer'
  | 'NavigationRail'
  | 'ProgressIndicator'
  | 'RadioButton'
  | 'SearchBar'
  | 'SegmentedButton'
  | 'SideSheet'
  | 'Slider'
  | 'Snackbar'
  | 'SplitButton'
  | 'Switch'
  | 'Tabs'
  | 'Toolbar'
  | 'Tooltip'
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

export type Style = Record<string, unknown>;
export type StyleProp = Style | null | false | undefined | StyleProp[];

export type ColorValue = number | string;

export interface BaseProps {
  children?: React.ReactNode;
  className?: string;
  style?: StyleProp;
  zIndex?: number;
  onPress?: () => void;
  onClick?: () => void;
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
  variant?: 'filled' | 'outlined';
}

export interface TextInputProps extends BaseProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  onChangeText?: (value: string) => void;
  // M3 text-field rendering controls (used e.g. by SearchBar for a borderless field).
  variant?: 'filled' | 'outlined';
  drawOutline?: boolean;
  drawBackground?: boolean;
  // When false, the field paints no own hover/focus highlight; the parent (e.g.
  // SearchBar) owns the single state layer spanning the whole element.
  drawStateLayer?: boolean;
}

export interface SliderProps extends BaseProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
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
      AvoidKeyboard: BaseProps;
      AppBar: MaterialComponentProps;
      Badge: BadgeProps;
      BottomSheet: MaterialComponentProps;
      ButtonGroup: MaterialComponentProps;
      Card: MaterialComponentProps;
      Carousel: MaterialComponentProps;
      Checkbox: MaterialComponentProps;
      Chip: MaterialComponentProps;
      DatePicker: MaterialComponentProps;
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
      Toolbar: MaterialComponentProps;
      Tooltip: MaterialComponentProps;
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
      'rayact-date-picker': MaterialComponentProps;
      'rayact-dialog': MaterialComponentProps;
      'rayact-divider': MaterialComponentProps;
      'rayact-extended-fab': MaterialComponentProps;
      'rayact-fab': MaterialComponentProps;
      'rayact-fab-menu': MaterialComponentProps;
      'rayact-icon-button': MaterialComponentProps;
      'rayact-loading-indicator': MaterialComponentProps;
      'rayact-menu': MaterialComponentProps;
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
      'rayact-toolbar': MaterialComponentProps;
      'rayact-tooltip': MaterialComponentProps;
    }
  }
}
