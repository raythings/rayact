import React from 'react';
import type {
  ActivityIndicatorProps,
  BaseProps,
  BadgeProps,
  ButtonProps,
  IconProps,
  ImageProps,
  ListProps,
  MaterialComponentProps,
  ModalProps,
  ScrollViewProps,
  SearchBarProps,
  SliderProps,
  StatusBarProps,
  TextInputProps,
  TextProps
} from './types';

const searchIconSlotStyle = { width: 24, height: 24 };

function withSearchIconSlot(node: React.ReactNode, style?: unknown): React.ReactNode {
  if (node && React.isValidElement(node) && node.type === Icon) {
    return React.cloneElement(node as React.ReactElement<{ style?: unknown }>, {
      style: [searchIconSlotStyle, node.props.style, style]
    });
  }
  return node;
}

export function View(props: BaseProps): React.ReactElement {
  return React.createElement('rayact-view', props);
}

export function Text(props: TextProps): React.ReactElement {
  return React.createElement('rayact-text', props);
}

export function Button(props: ButtonProps): React.ReactElement {
  return React.createElement('rayact-button', props);
}

export function Image(props: ImageProps): React.ReactElement {
  return React.createElement('rayact-image', props);
}

export function Icon(props: IconProps): React.ReactElement {
  return React.createElement('rayact-icon', props);
}

export function TextInput(props: TextInputProps): React.ReactElement {
  return React.createElement('rayact-text-input', props);
}

export function ScrollView(props: ScrollViewProps): React.ReactElement {
  return React.createElement('rayact-scroll-view', props);
}

export function List<T>(props: ListProps<T>): React.ReactElement {
  const { data, renderItem, keyExtractor, estimatedItemSize: _estimatedItemSize, ...scrollProps } = props;
  return React.createElement(
    ScrollView,
    scrollProps,
    data.map((item, index) =>
      React.createElement(React.Fragment, {
        key: keyExtractor ? keyExtractor(item, index) : String(index)
      }, renderItem({ item, index }))
    )
  );
}

export function Modal(props: ModalProps): React.ReactElement | null {
  if (props.visible === false) return null;
  return React.createElement('rayact-modal', props);
}

export function SafeArea(props: BaseProps): React.ReactElement {
  return React.createElement('rayact-safe-area', props);
}

export function StatusBar(props: StatusBarProps): React.ReactElement {
  return React.createElement('rayact-status-bar', props);
}

export function ActivityIndicator(props: ActivityIndicatorProps): React.ReactElement {
  return React.createElement('rayact-activity-indicator', props);
}

export function AvoidKeyboard(props: BaseProps): React.ReactElement {
  return React.createElement('rayact-avoid-keyboard', props);
}

function createMaterialComponent(tag: string) {
  return function MaterialComponent(props: MaterialComponentProps): React.ReactElement {
    return React.createElement(tag, props);
  };
}

export const AppBar = createMaterialComponent('rayact-app-bar');
export function Badge(props: BadgeProps): React.ReactElement {
  return React.createElement('rayact-badge', {
    ...props,
    label: props.label ?? props.text ?? (props.value == null ? undefined : String(props.value))
  });
}
export const Banner = createMaterialComponent('rayact-banner');
export const BottomAppBar = createMaterialComponent('rayact-bottom-app-bar');
export const BottomSheet = createMaterialComponent('rayact-bottom-sheet');
export const DataTable = createMaterialComponent('rayact-data-table');
export const DockedToolbar = createMaterialComponent('rayact-docked-toolbar');
export const FloatingToolbar = createMaterialComponent('rayact-floating-toolbar');
export const ButtonGroup = createMaterialComponent('rayact-button-group');
export const Card = createMaterialComponent('rayact-card');
export const Carousel = createMaterialComponent('rayact-carousel');
export const Checkbox = createMaterialComponent('rayact-checkbox');
export const Chip = createMaterialComponent('rayact-chip');
export const DatePicker = createMaterialComponent('rayact-date-picker');
export const Dialog = createMaterialComponent('rayact-dialog');
export const Divider = createMaterialComponent('rayact-divider');
export const ExtendedFab = createMaterialComponent('rayact-extended-fab');
export const Fab = createMaterialComponent('rayact-fab');
export const FabMenu = createMaterialComponent('rayact-fab-menu');
export const IconButton = createMaterialComponent('rayact-icon-button');
export const LoadingIndicator = createMaterialComponent('rayact-loading-indicator');
export const Menu = createMaterialComponent('rayact-menu');
export const NavigationBar = createMaterialComponent('rayact-navigation-bar');
export const NavigationBarItem = createMaterialComponent('rayact-navigation-bar-item');
export const NavigationDrawer = createMaterialComponent('rayact-navigation-drawer');
export const NavigationRail = createMaterialComponent('rayact-navigation-rail');
export const ProgressIndicator = createMaterialComponent('rayact-progress-indicator');
export const RadioButton = createMaterialComponent('rayact-radio-button');
export function SearchBar(props: SearchBarProps): React.ReactElement {
  const {
    value, placeholder, onChangeText,
    leading, trailing, trailing2,
    leadingStyle, trailingStyle,
    style, ...rest
  } = props;

  const leadingNode = withSearchIconSlot(
    leading ?? React.createElement(Icon, { name: 'search', size: 24 }),
    leadingStyle
  );
  const trailingNode = withSearchIconSlot(trailing, trailingStyle);
  const trailing2Node = withSearchIconSlot(trailing2);

  return React.createElement(
    'rayact-search-bar',
    { ...rest, style },
    leadingNode,
    React.createElement(TextInput, {
      value, placeholder, onChangeText,
      drawStateLayer: false,
      style: { flexGrow: 1 }
    }),
    trailingNode,
    trailing2Node
  );
}
export const SegmentedButton = createMaterialComponent('rayact-segmented-button');
export const SideSheet = createMaterialComponent('rayact-side-sheet');
export function Slider(props: SliderProps): React.ReactElement {
  return React.createElement('rayact-slider', props);
}
export const Snackbar = createMaterialComponent('rayact-snackbar');
export const SplitButton = createMaterialComponent('rayact-split-button');
export const Switch = createMaterialComponent('rayact-switch');
export const Tabs = createMaterialComponent('rayact-tabs');
export const Toolbar = createMaterialComponent('rayact-toolbar');
export const Tooltip = createMaterialComponent('rayact-tooltip');
