import React from 'react';
import type {
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
  KeyboardStickyViewProps,
  MaterialComponentProps,
  ModalProps,
  NavigationBarProps,
  PressableProps,
  PressableStateCallbackType,
  SafeAreaProps,
  ScrollViewProps,
  SearchBarProps,
  SliderProps,
  StatusBarProps,
  Style,
  StyleProp,
  TabBarProps,
  TabsProps,
  TextInputProps,
  TextProps,
  ViewProps,
  DatePickerProps,
  TimePickerProps
} from './types.js';
import { useTheme } from './theme/theming.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useSafeAreaInsets } from './hooks/useSafeAreaInsets.js';
import { Platform } from '@rayact/shared';

const searchIconSlotStyle = { width: 24, height: 24 };

function asStyleObject(style: StyleProp | undefined): Style {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Style>((acc, item) => ({ ...acc, ...asStyleObject(item) }), {});
  }
  return { ...style };
}

/**
 * Collapse the nested editing-color forms onto their flat keys:
 * `placeholder: { color }` → `placeholderColor`, `caret`/`cursor` →
 * `caretColor`, `selection: { color | backgroundColor }` → `selectionColor`.
 *
 * The flat keys are what the binary style codec and the CSS cascade speak, so
 * normalizing here keeps the nested form working on every path (binary create,
 * binary update, sync fallback) instead of only where the payload happens to
 * fall back to JSON.
 */
function normalizeEditingColors(style: Style): Style {
  const nested: Array<[keyof Style, keyof Style]> = [
    ['placeholder', 'placeholderColor'],
    ['caret', 'caretColor'],
    ['cursor', 'caretColor'],
    ['selection', 'selectionColor'],
  ];
  let out = style;
  for (const [from, to] of nested) {
    const value = out[from] as { color?: unknown; backgroundColor?: unknown } | undefined;
    if (!value || typeof value !== 'object') continue;
    const color = value.color ?? value.backgroundColor;
    if (out === style) out = { ...style };
    delete (out as Record<string, unknown>)[from as string];
    if (color != null && out[to] == null) {
      (out as Record<string, unknown>)[to as string] = color;
    }
  }
  return out;
}

function edgePadding(explicit: unknown, inset: number): number {
  return Math.max(typeof explicit === 'number' ? explicit : 0, inset);
}

function BottomSafeAreaSpacer({ height, backgroundColor }: { height: number; backgroundColor: ColorValue }) {
  if (height <= 0) return null;
  return React.createElement(View, {
    pointerEvents: 'none',
    style: { height, backgroundColor },
  });
}

function TopSafeAreaSpacer({ height, backgroundColor }: { height: number; backgroundColor: ColorValue }) {
  if (height <= 0) return null;
  return React.createElement(View, {
    pointerEvents: 'none',
    style: { height, backgroundColor },
  });
}

function withSearchIconSlot(node: React.ReactNode, style?: unknown): React.ReactNode {
  if (node && React.isValidElement(node) && node.type === Icon) {
    const iconNode = node as React.ReactElement<{ style?: unknown }>;
    return React.cloneElement(iconNode, {
      style: [searchIconSlotStyle, iconNode.props.style, style]
    });
  }
  return node;
}

export const View = React.forwardRef<any, ViewProps>((props, ref) => {
  return React.createElement('rayact-view', { ...props, ref });
});

/**
 * react-native Pressable. A View that tracks pressed state and exposes it to
 * `style` and `children` render-prop callbacks. Press feedback is driven by the
 * native onPressIn/onPressOut edges; onPress/onLongPress pass through.
 */
export const Pressable = React.forwardRef<any, PressableProps>((props, ref) => {
  const { style, children, onPressIn, onPressOut, ...rest } = props;
  const [pressed, setPressed] = React.useState(false);
  const state: PressableStateCallbackType = { pressed };
  return React.createElement(
    'rayact-view',
    {
      ...rest,
      ref,
      style: typeof style === 'function' ? style(state) : style,
      onPressIn: () => { setPressed(true); onPressIn?.(); },
      onPressOut: () => { setPressed(false); onPressOut?.(); },
    },
    typeof children === 'function' ? children(state) : children,
  );
});

export function Text(props: TextProps): React.ReactElement {
  const { numberOfLines, ellipsizeMode, style, ...rest } = props;
  if (numberOfLines == null && ellipsizeMode == null) {
    return React.createElement('rayact-text', props);
  }
  // Line clamping travels as style, not as a loose prop: style is the only
  // channel the create/update fast path and the binary command buffer both
  // carry. react-native defaults to a tail ellipsis once numberOfLines is set.
  const clamp: Style = {};
  if (numberOfLines != null) clamp.maxLines = numberOfLines;
  clamp.ellipsizeMode = ellipsizeMode ?? 'tail';
  return React.createElement('rayact-text', {
    ...rest,
    style: [style, clamp]
  });
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


// RN keyboardType → raym3 wire inputType. The engine masks (password) and the
// OS keyboard layout (email/number/phone) are driven by this single token.
function inputTypeFromKeyboardType(
  keyboardType: TextInputProps['keyboardType'],
  multiline: boolean | undefined,
  secure: boolean | undefined,
): string {
  if (secure) return 'password';
  if (multiline) return 'multiline';
  switch (keyboardType) {
    case 'email-address': return 'email';
    case 'numeric':
    case 'number-pad':
    case 'decimal-pad': return 'number';
    case 'phone-pad': return 'phone';
    case 'url': return 'url';
    case 'ascii-capable': return 'ascii';
    case 'visible-password': return 'visible-password';
    default: return 'text';
  }
}

/** Imperative handle exposed on TextInput refs (react-native parity). */
export interface TextInputHandle {
  focus(): void;
  blur(): void;
  /** Underlying host node id (advanced). */
  node: { id: number };
}

declare const focusTextInput:
  | ((nodeId: number, focused?: boolean) => void)
  | undefined;
declare const setExternalViewProps:
  | ((nodeId: number, props: Record<string, unknown>) => void)
  | undefined;

function assignRef(ref: React.Ref<unknown>, value: unknown): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') (ref as { current: unknown }).current = value;
}

/**
 * react-native TextInput. Maps the RN prop surface onto the raym3 native text
 * field (Flutter editing model). See TextInputProps. Refs receive a
 * TextInputHandle with imperative focus()/blur().
 */
export function TextInput(props: TextInputProps): React.ReactElement {
  const theme = useTheme();
  const {
    ref,
    // RN names mapped onto wire props:
    keyboardType,
    returnKeyType,
    autoCapitalize,
    autoCorrect,
    secureTextEntry,
    editable,
    multiline,
    // passthrough / renamed below:
    selection,
    ...rest
  } = props as TextInputProps & { ref?: React.Ref<TextInputHandle> };
  // Platforms whose host supplies a real transparent editor through the
  // platform-view bridge (EditText / UITextField / DOM input / NSTextField).
  // raym3 keeps painting the Material chrome either way; the native editor only
  // owns glyphs, caret, selection and composition — which is what buys real IME,
  // autofill and spellcheck. Everywhere else falls back to raym3's own editor.
  const nativeEditorPlatform =
    Platform.OS === Platform.ANDROID ||
    Platform.OS === Platform.IOS ||
    Platform.OS === Platform.WEB ||
    Platform.OS === Platform.MACOS ||
    Platform.OS === Platform.WINDOWS;
  // Material fields hide the placeholder behind their resting label and reveal
  // it once the label floats (M3 spec). Tracking focus here is what lets the
  // editor's hint follow that.
  const [editorFocused, setEditorFocused] = React.useState(false);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    props.defaultValue ?? '',
  );
  const value = props.value ?? uncontrolledValue;
  const nativeNodeId = React.useRef(0);
  const raym3NodeId = React.useRef(0);

  // Bare TextInput is a React-Native-style plain input: no M3 fill, outline,
  // or label float. TextField (and any caller passing `variant`) opts into the
  // Material chrome. The `style` prop applies to plain fields as usual.
  const resolvedVariant = props.variant ?? 'plain';
  // Plain fields have no label chrome; the native hint stays visible and the
  // editor gets the full node bounds. (Declared here because the focus
  // handlers below need it, not only the geometry block.)
  const hasLabel = !!props.label && resolvedVariant !== 'plain';
  const wire: Record<string, unknown> = {
    ...rest,
    // Nested `placeholder`/`caret`/`cursor`/`selection` objects collapse onto
    // the flat color keys the codec and CSS cascade share.
    style: normalizeEditingColors(asStyleObject(props.style)),
    variant: resolvedVariant,
    value,
    inputType: inputTypeFromKeyboardType(keyboardType, multiline, secureTextEntry),
    imeAction: returnKeyType && returnKeyType !== 'default' ? returnKeyType : 'done',
    autoCapitalize: autoCapitalize ?? 'sentences',
    secure: !!secureTextEntry,
    secureTextEntry: !!secureTextEntry,
    autocorrect: autoCorrect !== false,
    readOnly: editable === false,
    multiline: !!multiline,
    // blurOnSubmit defaults to single-line behaviour (RN parity).
    blurOnSubmit: props.blurOnSubmit ?? !multiline,
    // The renderer retains the complete Material field chrome. On mobile the
    // transparent child editor owns only glyphs/caret/selection/composition.
    nativeEditor: nativeEditorPlatform,
    // The real mobile editor supplies the accessibility element. Keeping the
    // raym3 chrome semantic as well would announce every field twice.
    accessible: nativeEditorPlatform ? false : props.accessible,
  };
  // Controlled selection → flat wire keys the bridge reads.
  if (selection) {
    wire.selectionStart = selection.start;
    wire.selectionEnd = selection.end ?? selection.start;
  }
  if (nativeEditorPlatform) {
    // The raym3 chrome owns focus policy (tap-outside dismissal, imperative
    // focusTextInput, focus stealing by another field). Mirror its focus
    // transitions onto the native editor, or a chrome blur leaves the
    // EditText/UITextField focused with the keyboard up. The reverse
    // direction (editor → chrome) already flows through handleNativeEvent's
    // focus/blur envelopes; both sides are idempotent, so no loop.
    wire.onFocus = () => {
      setEditorFocused(true);
      if (typeof setExternalViewProps === 'function' && nativeNodeId.current) {
        setExternalViewProps(nativeNodeId.current, { focused: true });
      }
      props.onFocus?.();
    };
    wire.onBlur = () => {
      setEditorFocused(false);
      if (typeof setExternalViewProps === 'function' && nativeNodeId.current) {
        setExternalViewProps(nativeNodeId.current, { focused: false });
      }
      props.onBlur?.();
    };
  }
  // Always retain the raym3 id: native focus transitions must update the M3
  // focused chrome even when the caller did not request a public ref.
  wire.ref = (inst: { node?: { id: number } } | null) => {
    if (!inst || inst.node == null) {
      raym3NodeId.current = 0;
      if (ref) {
        assignRef(ref, null);
      }
      return;
    }
    const id = inst.node.id;
    raym3NodeId.current = id;
    if (ref) {
      assignRef(ref, {
        node: inst.node,
        focus: () => {
          if (typeof focusTextInput === 'function') focusTextInput(id, true);
          if (typeof setExternalViewProps === 'function' && nativeNodeId.current) {
            setExternalViewProps(nativeNodeId.current, { focused: true });
          }
        },
        blur: () => {
          if (typeof focusTextInput === 'function') focusTextInput(id, false);
          if (typeof setExternalViewProps === 'function' && nativeNodeId.current) {
            setExternalViewProps(nativeNodeId.current, { focused: false });
          }
        },
      } satisfies TextInputHandle);
    }
  };

  if (!nativeEditorPlatform) {
    return React.createElement('rayact-text-input', wire);
  }

  const flattenedStyle = asStyleObject(props.style);
  const textStyle = flattenedStyle.text ?? {};
  // Match the renderer's geometry exactly (kFilledInputTop/kFilledInputBottom/
  // kOutlinedTopStrip in third_party/raym3/src/v2/TextInput.cpp). The native
  // editor fills only raym3's editable region; raym3 owns the M3 chrome.
  //  - filled/underline + label: label row reserved at the container top.
  //  - outlined + label: 8dp top strip; text centers in the border box.
  //  - no label / plain: full node bounds.
  const contentHorizontal = 16;
  let contentTop = 0;
  let contentBottom = 0;
  if (hasLabel) {
    if (resolvedVariant === 'outlined') {
      contentTop = 8;
    } else {
      contentTop = 24;
      contentBottom = 8;
    }
  }
  const handleNativeEvent = (payload: string) => {
    let event: {
      type?: string;
      text?: string;
      selectionStart?: number;
      selectionEnd?: number;
      width?: number;
      height?: number;
      key?: string;
    };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      return;
    }
    const text = event.text ?? value;
    switch (event.type) {
      case 'change':
        if (props.value == null) setUncontrolledValue(text);
        props.onChangeText?.(text);
        props.onChange?.({ nativeEvent: { text } });
        break;
      case 'focus':
        if (raym3NodeId.current && typeof focusTextInput === 'function') {
          focusTextInput(raym3NodeId.current, true);
        }
        break;
      case 'blur':
        if (raym3NodeId.current && typeof focusTextInput === 'function') {
          focusTextInput(raym3NodeId.current, false);
        }
        break;
      case 'submit':
        props.onSubmitEditing?.({ nativeEvent: { text } });
        break;
      case 'selection':
        // Selection envelopes carry the full editor text. Sync uncontrolled
        // state from them as well so the raym3 chrome (label float depends on
        // "has content") can never desync from the native editor even if a
        // change envelope is lost in transit.
        if (
          props.value == null &&
          typeof event.text === 'string' &&
          event.text !== value
        ) {
          setUncontrolledValue(event.text);
        }
        props.onSelectionChange?.({
          nativeEvent: {
            selection: {
              start: event.selectionStart ?? 0,
              end: event.selectionEnd ?? event.selectionStart ?? 0,
            },
          },
        });
        break;
      case 'key':
        props.onKeyPress?.({ nativeEvent: { key: event.key ?? '' } });
        break;
      case 'contentSize':
        props.onContentSizeChange?.({
          nativeEvent: {
            contentSize: {
              width: event.width ?? 0,
              height: event.height ?? 0,
            },
          },
        });
        break;
    }
  };

  const nativeEditor = React.createElement('rayact-external-view', {
    ref: (inst: { node?: { id: number } } | null) => {
      nativeNodeId.current = inst?.node?.id ?? 0;
    },
    kind: 'rayact.internal.text-input',
    // This native view is only a transparent editor. Preserve raym3 pixels
    // beneath it instead of treating its bounds as an opaque platform view.
    preserveFrameworkUnderlay: true,
    hitTestBehavior: editable === false ? 'transparent' : 'opaque',
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    value,
    // The native editor shows a placeholder only for `plain` fields — every
    // Material variant owns that spot with its chrome (resting label float,
    // etc.), so the native hint stays off there on every platform.
    //
    // A plain field has nowhere to render `label`, but the label is still the
    // field's name: fall back to it so switching variants doesn't silently
    // change the text the user reads (Material variants rest their label in
    // exactly this spot).
    placeholder: hasLabel
      ? // M3: the label owns this spot at rest and floats out of the way on
        // focus, at which point the placeholder is what the user should read.
        editorFocused
        ? props.placeholder ?? ''
        : ''
      : props.label ?? props.placeholder ?? '',
    inputType: inputTypeFromKeyboardType(keyboardType, multiline, secureTextEntry),
    imeAction: returnKeyType && returnKeyType !== 'default' ? returnKeyType : 'done',
    autoCapitalize: autoCapitalize ?? 'sentences',
    autocorrect: autoCorrect !== false,
    autoComplete: props.autoComplete ?? null,
    secure: !!secureTextEntry,
    editable: editable !== false,
    multiline: !!multiline,
    maxLength: props.maxLength ?? null,
    selectTextOnFocus: !!props.selectTextOnFocus,
    caretHidden: !!props.caretHidden,
    contextMenuHidden: !!props.contextMenuHidden,
    blurOnSubmit: props.blurOnSubmit ?? !multiline,
    selectionStart: selection?.start ?? null,
    selectionEnd: selection?.end ?? selection?.start ?? null,
    // textColor / placeholderColor / cursorColor / selectionColor are NOT sent
    // from here. Only the engine sees all three sources — the react-native
    // prop, the resolved CSS/style cascade (`placeholder-color`, `caret-color`,
    // `selection-color`, or nested `style={{ placeholder: { color } }}`), and
    // the theme — so it resolves them and pushes the winner to the editor
    // (syncNativeEditorAppearance). A theme guess sent from JS would race that
    // and clobber a class-derived color.
    fontSize: textStyle.fontSize ?? 16,
    textAlign: props.textAlign ?? 'auto',
    contentHorizontal,
    contentTop,
    contentBottom,
    hasLabel,
    focused: !!props.autoFocus,
    nativeAccessible: props.accessible !== false,
    nativeAccessibilityLabel:
      props.accessibilityLabel ?? props.label ?? props.placeholder ?? null,
    nativeAccessibilityHint: props.accessibilityHint ?? null,
    onNativeEvent: handleNativeEvent,
  });

  return React.createElement('rayact-text-input', wire, nativeEditor);
}

export const Input = TextInput;

/** Imperative handle exposed on ScrollView refs (react-native parity). */
export interface ScrollViewHandle {
  /**
   * Scroll to an absolute offset. Omitted axes are left unchanged. `animated`
   * is accepted for react-native parity but currently performs an instant jump.
   */
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void;
  /** Scroll to the end of the content (bottom for vertical, right for horizontal). */
  scrollToEnd(options?: { animated?: boolean }): void;
  /** Underlying host node id (advanced). */
  node: { id: number };
}

declare const setScrollOffset:
  | ((nodeId: number, x: number, y: number) => void)
  | undefined;

/**
 * react-native ScrollView. Refs receive a ScrollViewHandle with imperative
 * scrollTo()/scrollToEnd(). The native offset is clamped on the next layout
 * pass, so scrollToEnd() passes a large offset and lets the clamp cap it.
 */
/** Flatten a StyleProp (nested arrays / falsy entries) into one object. */
function flattenStyleProp(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyleProp));
  return style as Record<string, unknown>;
}

export function ScrollView(props: ScrollViewProps): React.ReactElement {
  const {
    ref,
    contentContainerStyle,
    children,
    onScroll,
    onLayout,
    onContentSizeChange,
    ...rest
  } =
    props as ScrollViewProps & { ref?: React.Ref<ScrollViewHandle>; children?: React.ReactNode };
  const viewportRef = React.useRef({ width: 0, height: 0 });
  const contentSizeRef = React.useRef({ width: 0, height: 0 });
  const keyboard = useKeyboard();

  // react-native parity: children live in an implicit content container that
  // sizes to its content along the scroll axis. Without it, children are laid
  // out directly in the viewport-sized scroll node and Yoga's default
  // flexShrink squeezes them to fit instead of overflowing into scroll range.
  const contentStyle: Record<string, unknown> = {
    flexDirection: props.horizontal ? 'row' : 'column',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    ...(props.keyboardAware && keyboard.height > 0 ? { paddingBottom: keyboard.height } : {}),
    ...flattenStyleProp(contentContainerStyle)
  };
  const content = React.createElement('rayact-view', {
    style: contentStyle,
    onLayout: (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      const previous = contentSizeRef.current;
      contentSizeRef.current = { width, height };
      if (previous.width !== width || previous.height !== height) {
        onContentSizeChange?.(width, height);
      }
    },
  }, children);

  const wireScroll = (event: unknown) => {
    if (!onScroll) return;
    const candidate = event as {
      x?: number;
      y?: number;
      nativeEvent?: { contentOffset?: { x?: number; y?: number } };
    };
    const x = candidate.nativeEvent?.contentOffset?.x ?? candidate.x ?? 0;
    const y = candidate.nativeEvent?.contentOffset?.y ?? candidate.y ?? 0;
    onScroll({
      nativeEvent: {
        contentOffset: { x, y },
        contentSize: contentSizeRef.current,
        layoutMeasurement: viewportRef.current,
      },
    });
  };

  const wireLayout = (event: {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }) => {
    const { width, height } = event.nativeEvent.layout;
    viewportRef.current = { width, height };
    onLayout?.(event);
  };

  if (!ref) {
    return React.createElement('rayact-scroll-view', {
      ...rest,
      onScroll: wireScroll,
      onLayout: wireLayout,
    }, content);
  }

  const wire: Record<string, unknown> = {
    ...rest,
    onScroll: wireScroll,
    onLayout: wireLayout,
  };
  wire.ref = (inst: { node?: { id: number } } | null) => {
    if (!inst || inst.node == null) {
      assignRef(ref, null);
      return;
    }
    const id = inst.node.id;
    const horizontal = props.horizontal === true;
    const END = Number.MAX_SAFE_INTEGER;
    assignRef(ref, {
      node: inst.node,
      scrollTo: (options = {}) => {
        if (typeof setScrollOffset !== 'function') return;
        setScrollOffset(id, options.x ?? Number.NaN, options.y ?? Number.NaN);
      },
      scrollToEnd: () => {
        if (typeof setScrollOffset !== 'function') return;
        if (horizontal) setScrollOffset(id, END, Number.NaN);
        else setScrollOffset(id, Number.NaN, END);
      },
    } satisfies ScrollViewHandle);
  };
  return React.createElement('rayact-scroll-view', wire, content);
}

// `List` now lives in FlatList.tsx (it is an alias for the virtualized list);
// exporting it from there keeps components.ts out of an import cycle.

export function Modal(props: ModalProps): React.ReactElement | null {
  if (props.visible === false) return null;
  return React.createElement('rayact-modal', props);
}

export function SafeArea(props: SafeAreaProps): React.ReactElement {
  const { edges, style, children, ...rest } = props;
  if (!edges) {
    return React.createElement('rayact-safe-area', props);
  }
  const insets = useSafeAreaInsets();
  const base = asStyleObject(style);
  const resolved: Style = { flexGrow: 1, ...base };
  if (edges.includes('top')) resolved.paddingTop = edgePadding(base.paddingTop, insets.top);
  else if (base.paddingTop != null) resolved.paddingTop = base.paddingTop;
  if (edges.includes('right')) resolved.paddingRight = edgePadding(base.paddingRight, insets.right);
  else if (base.paddingRight != null) resolved.paddingRight = base.paddingRight;
  if (edges.includes('bottom')) resolved.paddingBottom = edgePadding(base.paddingBottom, insets.bottom);
  else if (base.paddingBottom != null) resolved.paddingBottom = base.paddingBottom;
  if (edges.includes('left')) resolved.paddingLeft = edgePadding(base.paddingLeft, insets.left);
  else if (base.paddingLeft != null) resolved.paddingLeft = base.paddingLeft;
  return React.createElement(View, { ...rest, style: resolved }, children);
}

export const SafeAreaView = SafeArea;

export function StatusBar(props: StatusBarProps): React.ReactElement {
  return React.createElement('rayact-status-bar', props);
}

export function ActivityIndicator(props: ActivityIndicatorProps): React.ReactElement {
  return React.createElement('rayact-activity-indicator', props);
}

export interface ExternalViewProps extends BaseProps {
  /** Producer kind: 'stub' (animated test pattern), 'textfield', ... */
  kind?: string;
  /**
   * Whether this native view participates in Rayact hit testing.
   * Mirrors Flutter's PlatformViewHitTestBehavior.
   */
  hitTestBehavior?: 'opaque' | 'translucent' | 'transparent';
  /** Raw event envelope emitted by the registered platform-view controller. */
  onNativeEvent?: (payload: string) => void;
}

/**
 * A node whose content is produced by a registered platform-native view.
 * Hosts with native composition keep the view in the real platform hierarchy;
 * unsupported hosts may use the legacy texture/stub fallback.
 */
export function ExternalView(props: ExternalViewProps): React.ReactElement {
  return React.createElement('rayact-external-view', {
    hitTestBehavior: 'opaque',
    ...props,
  });
}

export interface NativeTextInputProps extends BaseProps {
  value?: string;
  placeholder?: string;
  /** 'text' | 'email' | 'number' | 'phone' | 'password' | 'multiline' */
  inputType?: string;
  autocorrect?: boolean;
  secure?: boolean;
  imeAction?: string;
  onChangeText?: (text: string) => void;
}

/**
 * An undecorated text field on the framework-rendered raym3 path (Flutter
 * model: raym3 draws text/caret/selection/composing; the platform only
 * proxies the IME — InputConnection on Android, NSTextInputClient on macOS).
 * Single-line; placeholder/inputType/secure/imeAction apply at create time.
 */
export function NativeTextInput(props: NativeTextInputProps): React.ReactElement {
  const { style, secure, inputType, ...rest } = props;
  return React.createElement('rayact-text-input', {
    ...rest,
    inputType,
    secure: !!secure,
    // raym3 masks via secureTextEntry→passwordMode; honor both spellings.
    secureTextEntry: !!secure || inputType === 'password',
    drawBackground: false,
    drawOutline: false,
    drawStateLayer: false,
    style: [{ height: 48 }, style],
  });
}

const AVOID_KEYBOARD_PADDING_CLASS = 'rayact-AvoidKeyboard_paddingTransition';
const AVOID_KEYBOARD_POSITION_CLASS = 'rayact-AvoidKeyboard_positionTransition';

export function AvoidKeyboard(props: AvoidKeyboardProps): React.ReactElement {
  const {
    children,
    style,
    behavior = 'position',
    animate = true,
    className,
    ...rest
  } = props;
  const keyboard = useKeyboard();
  const insets = useSafeAreaInsets();

  const offset =
    keyboard.visible && keyboard.height > 0
      ? Math.round(keyboard.height + insets.bottom)
      : 0;

  const duration = keyboard.duration > 0 ? keyboard.duration : 250;
  const paddingTransition = animate && behavior === 'padding';
  const positionTransition = animate && behavior === 'position';
  const mergedClassName = [
    paddingTransition ? AVOID_KEYBOARD_PADDING_CLASS : undefined,
    positionTransition ? AVOID_KEYBOARD_POSITION_CLASS : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  const offsetStyle = React.useMemo(() => {
    // Always emit explicit offset values: native setStyle merges, so omitting
    // a key after it was set would leave the stale keyboard offset applied.
    const s: Record<string, unknown> = {};
    if (behavior === 'padding') {
      s.marginBottom = offset;
    } else {
      if (offset > 0) s.position = 'relative';
      s.bottom = offset;
    }
    if (animate && offset > 0) s.transitionDurationMs = duration;
    else if (!animate) s.transition = 'none';
    return s;
  }, [behavior, offset, animate, duration]);

  return React.createElement(
    View,
    {
      ...rest,
      className: mergedClassName,
      style: [style, offsetStyle],
    },
    children
  );
}

/** Keeps children immediately above the animated software-keyboard frame. */
export function KeyboardStickyView(props: KeyboardStickyViewProps): React.ReactElement {
  const { offset = 0, style, children, ...rest } = props;
  const keyboard = useKeyboard();
  return React.createElement(View, {
    ...rest,
    style: [
      style,
      {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(0, keyboard.height + offset),
      },
    ],
  }, children);
}

function createMaterialComponent(tag: string) {
  return function MaterialComponent(props: MaterialComponentProps): React.ReactElement {
    return React.createElement(tag, props);
  };
}

// True on Apple platforms (iOS/macOS). Used so AppBar defaults to a centered
// title there — matching Flutter's platform-derived AppBar.centerTitle — while
// Android/other stays start-aligned (M3 default). Reads the platform global the
// native layer injects at context init.
function isApplePlatform(): boolean {
  const os = (globalThis as { __rayactPlatform?: { os?: string } }).__rayactPlatform?.os;
  return os === 'ios' || os === 'macos';
}

// M3 top-app-bar variant metrics. Heights are the full collapsed size; medium
// and large stack the title on a second row below the action row.
const APP_BAR_VARIANTS = {
  small:  { height: 64,  titleSize: 22, titleLineHeight: 28, titleBottomPadding: 0,  twoRow: false },
  center: { height: 64,  titleSize: 22, titleLineHeight: 28, titleBottomPadding: 0,  twoRow: false },
  medium: { height: 112, titleSize: 24, titleLineHeight: 32, titleBottomPadding: 20, twoRow: true  },
  large:  { height: 152, titleSize: 28, titleLineHeight: 36, titleBottomPadding: 28, twoRow: true  },
} as const;

type AppBarVariant = keyof typeof APP_BAR_VARIANTS;

const NAVIGATION_BAR_HEIGHT = 80;

// M3 content inset: 16dp from the screen edge to the title (and to body
// content), so the title lines up with the list below it. A 48dp leading
// IconButton centres its 24dp icon, so the bar pads 4dp on that side and the
// icon still lands at 16dp.
const APP_BAR_CONTENT_INSET = 16;
const APP_BAR_LEADING_PADDING = 4;

function AppBarTitleSlot({
  title, color, fontSize, lineHeight, align, flexGrow, marginLeft,
}: {
  title: React.ReactNode;
  color: ColorValue;
  fontSize: number;
  lineHeight: number;
  align: 'start' | 'center';
  flexGrow: number;
  marginLeft: number;
}): React.ReactElement {
  const content = typeof title === 'string' || typeof title === 'number'
    ? React.createElement(Text, {
        text: String(title),
        style: { text: { color, fontSize, lineHeight, weight: 'normal', letterSpacing: 0 } },
      })
    : title;
  // appBarTitle marks this node so the native renderer can recenter it across
  // the full bar width when centerTitle is active (Flutter centerMiddle).
  return React.createElement(
    View,
    {
      appBarTitle: true,
      style: {
        flexGrow,
        flexShrink: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        marginLeft,
      },
    } as BaseProps,
    content
  );
}

export function AppBar(props: AppBarProps): React.ReactElement {
  const {
    extendTopPaddingToAppBar, ignoreSafeAreaView,
    title, leading, actions, centerTitle, variant = 'small',
    titleStyle, style, children, ...rest
  } = props;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const extend = ignoreSafeAreaView || extendTopPaddingToAppBar;
  // Honour a caller-supplied backgroundColor (so it also fills the status-bar
  // spacer); fall back to the surface token.
  const backgroundColor =
    (asStyleObject(style).backgroundColor as ColorValue | undefined) ?? theme.surface;

  const v: AppBarVariant = (variant in APP_BAR_VARIANTS ? variant : 'small') as AppBarVariant;
  const cfg = APP_BAR_VARIANTS[v];
  // Default: center on Apple or the center-aligned variant; start elsewhere (M3).
  const resolvedCenter = centerTitle ?? (v === 'center' ? true : isApplePlatform());
  // Title color via style passthrough: explicit titleStyle.text.color wins, then
  // the bar's own style.text.color, then the theme token.
  const titleTextColor = (s: StyleProp | undefined): ColorValue | undefined =>
    (asStyleObject(s) as { text?: { color?: ColorValue } }).text?.color;
  const titleColor = titleTextColor(titleStyle) ?? titleTextColor(style) ?? theme.onSurface;
  const titleTextStyle = (asStyleObject(titleStyle) as { text?: { fontSize?: number; lineHeight?: number } }).text;
  const titleFontSize =
    titleTextStyle?.fontSize ?? cfg.titleSize;
  const titleLineHeight =
    titleTextStyle?.lineHeight ?? cfg.titleLineHeight;
  const topInset = extend ? Math.max(0, insets.top) : 0;
  const leftInset = extend ? Math.max(0, insets.left) : 0;
  const rightInset = extend ? Math.max(0, insets.right) : 0;

  const useSlots = title != null || leading != null || actions != null;

  // Legacy path: no slot props → behave as a bare row container around children.
  // `barInternalStyle` is the bar's OWN computed layout (height/row/padding); the
  // caller's `style` is kept separate so — like NavigationBar — it rides the
  // outer wrapper when extended (positioning the whole unit) instead of being
  // reinterpreted against the bar's flex axis.
  let barChildren: React.ReactNode;
  let barInternalStyle: StyleProp;

  if (useSlots) {
    const hasLeading = leading != null;
    const hasActions = actions != null && !(Array.isArray(actions) && actions.length === 0);
    const leadingBox = React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 } },
      leading ?? null
    );
    const actionsBox = React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 } },
      Array.isArray(actions) ? actions : (actions ?? null)
    );

    if (cfg.twoRow) {
      // medium/large: [action row] over [title row], title start-aligned and
      // inset to the 16dp content line. Bar pads 4dp so a leading IconButton's
      // icon lands at 16dp; the title row adds 12dp to reach the same 16dp.
      barChildren = [
        React.createElement(
          View,
          { key: 'row', style: { height: 64, flexDirection: 'row', alignItems: 'center', flexShrink: 0 } },
          leadingBox,
          React.createElement(View, { key: 'sp', style: { flexGrow: 1 } }),
          actionsBox
        ),
        React.createElement(
          View,
          { key: 'title', style: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: cfg.titleBottomPadding } },
          AppBarTitleSlot({
            title, color: titleColor, fontSize: titleFontSize, lineHeight: titleLineHeight, align: 'start',
            flexGrow: 0, marginLeft: APP_BAR_CONTENT_INSET - APP_BAR_LEADING_PADDING,
          })
        ),
      ];
      // alignItems stretch: the AppBar default is center (for the small row);
      // a two-row column must stretch so the title row spans full width and
      // its start-aligned title lands at the bottom-left (M3 medium/large).
      barInternalStyle = {
        height: cfg.height, minHeight: cfg.height,
        flexDirection: 'column', alignItems: 'stretch',
        paddingLeft: APP_BAR_LEADING_PADDING + leftInset,
        paddingRight: APP_BAR_LEADING_PADDING + rightInset,
        backgroundColor,
      };
    } else {
      // small/center: single row [leading][title][actions]. Title aligns to the
      // 16dp content inset: with a leading button the bar pads 4dp and the title
      // adds an 8dp gap after the 48dp button; with no leading the bar itself
      // pads 16dp and the title needs no extra margin.
      const titleSlot = AppBarTitleSlot({
        title, color: titleColor, fontSize: titleFontSize, lineHeight: titleLineHeight,
        align: resolvedCenter ? 'center' : 'start',
        flexGrow: resolvedCenter ? 0 : 1,
        marginLeft: resolvedCenter ? 0 : (hasLeading ? 8 : 0),
      });
      barChildren = [
        React.cloneElement(leadingBox, { key: 'lead' }),
        React.cloneElement(titleSlot, { key: 'title' }),
        React.cloneElement(actionsBox, { key: 'act' }),
      ];
      barInternalStyle = {
        height: cfg.height,
        minHeight: cfg.height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: resolvedCenter ? 'space-between' : 'flex-start',
        paddingLeft: (hasLeading ? APP_BAR_LEADING_PADDING : APP_BAR_CONTENT_INSET) + leftInset,
        paddingRight: (hasActions ? APP_BAR_LEADING_PADDING : APP_BAR_CONTENT_INSET) + rightInset,
        backgroundColor,
      };
    }
  } else {
    // Legacy bare-row path: still push the resolved bg so the bar matches the
    // wrapper + spacer when extended.
    barChildren = children;
    barInternalStyle = extend
      ? {
          height: cfg.height,
          minHeight: cfg.height,
          paddingLeft: leftInset,
          paddingRight: rightInset,
          backgroundColor,
        }
      : { backgroundColor };
  }

  // When extended, the caller's `style` rides the wrapper (positions the whole
  // status-spacer + bar unit); the bar keeps only its internal layout. When not
  // extended, there is no wrapper, so the caller's `style` merges onto the bar.
  const bar = React.createElement(
    'rayact-app-bar',
    {
      ...rest,
      centerTitle: resolvedCenter && !cfg.twoRow,
      style: extend ? barInternalStyle : [barInternalStyle, style],
    },
    barChildren
  );

  if (!extend) return bar;

  return React.createElement(
    View,
    { style: [style, { backgroundColor }] },
    React.createElement(TopSafeAreaSpacer, { height: topInset, backgroundColor }),
    bar
  );
}
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
// ─── Popover ────────────────────────────────────────────────────────────────
export const Popover = createMaterialComponent('rayact-popover');

// ─── Color & Styling Helpers ────────────────────────────────────────────────
function withAlpha(color: any, alpha: number): any {
  if (typeof color === 'number') {
    return ((color & 0xffffff00) | Math.round(alpha * 255)) >>> 0;
  }
  return color;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseIso(s: string | undefined): Date {
  if (s) { const d = new Date(s); if (!isNaN(d.getTime())) return d; }
  return new Date();
}
function mmddyyyy(d: Date): string {
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
function headlineDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function monthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// M3 day picker: 48dp rows, always 6 week rows (+ weekday header) so the picker
// doesn't resize when the month spans fewer/more weeks.
const CALENDAR_DAY_ROW_HEIGHT = 48;
const CALENDAR_MAX_WEEK_ROWS = 6;
const CALENDAR_GRID_HEIGHT = CALENDAR_DAY_ROW_HEIGHT * (CALENDAR_MAX_WEEK_ROWS + 1);
const DOCKED_DATE_PICKER_HEIGHT = 456;

// ─── DayCell ────────────────────────────────────────────────────────────────
function DayCell(props: {
  day: number | null; cellW: number;
  selected: boolean; isToday: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { day, cellW, selected, isToday, onPress } = props;
  const theme = useTheme();

  if (day === null) {
    return React.createElement(View, { style: { width: cellW, height: CALENDAR_DAY_ROW_HEIGHT } });
  }
  return React.createElement(
    View,
    { style: { width: cellW, height: CALENDAR_DAY_ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' }, onPress },
    React.createElement(
      View,
      {
        style: {
          width: 40, height: 40, borderRadius: 20,
          justifyContent: 'center', alignItems: 'center',
          backgroundColor: selected ? theme.primary : undefined,
          borderWidth: (isToday && !selected) ? 1 : 0,
          borderColor: theme.primary,
        },
      },
      React.createElement(Text, {
        style: {
          textAlign: 'center',
          text: {
            fontSize: 16,
            color: selected ? theme.onPrimary : isToday ? theme.primary : theme.onSurface,
            fontWeight: (selected || isToday) ? '600' : '400',
          }
        }
      }, String(day))
    )
  );
}

// ─── CalendarGrid ────────────────────────────────────────────────────────────
function CalendarGrid(props: {
  viewDate: Date; selected: Date; today: Date;
  cellW: number; onDay: (n: number) => void;
}): React.ReactElement {
  const { viewDate, selected, today, cellW, onDay } = props;
  const theme = useTheme();

  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDay = new Date(yr, mo, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < CALENDAR_MAX_WEEK_ROWS * 7) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return React.createElement(
    View,
    { style: { flexDirection: 'column', alignItems: 'center', height: CALENDAR_GRID_HEIGHT } },
    // Weekday header
    React.createElement(
      View,
      { style: { flexDirection: 'row', height: CALENDAR_DAY_ROW_HEIGHT } },
      WD.map((d, i) =>
        React.createElement(
          View,
          { key: i, style: { width: cellW, height: CALENDAR_DAY_ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' } },
          React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '500', color: theme.onSurfaceVariant } } }, d)
        )
      )
    ),
    // Day rows
    ...rows.map((row, ri) =>
      React.createElement(
        View,
        { key: ri, style: { flexDirection: 'row' } },
        row.map((day, ci) =>
          React.createElement(DayCell, {
            key: ci, day, cellW,
            selected: day !== null && selected.getDate() === day && selected.getMonth() === mo && selected.getFullYear() === yr,
            isToday: day !== null && today.getDate() === day && today.getMonth() === mo && today.getFullYear() === yr,
            onPress: () => { if (day !== null) onDay(day); },
          })
        )
      )
    )
  );
}

// ─── MonthYearBar ────────────────────────────────────────────────────────────
function MonthYearBar(props: {
  viewDate: Date; onPrev: () => void; onNext: () => void;
  onToggle?: () => void; showArrow?: boolean;
}): React.ReactElement {
  const { viewDate, onPrev, onNext, onToggle, showArrow = true } = props;
  const theme = useTheme();

  return React.createElement(
    View,
    { style: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 12 } },
    React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, gap: 6 }, onPress: onToggle },
      React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '500', color: withAlpha(theme.onSurface, 0.6) } } }, monthYear(viewDate)),
      showArrow
        ? React.createElement(Icon, { name: 'arrow_drop_down', size: 18, color: theme.onSurfaceVariant })
        : null,
    ),
    React.createElement(
      View,
      { style: { flexDirection: 'row', width: 108, justifyContent: 'flex-end', alignItems: 'center', gap: 8 } },
      React.createElement(
        View,
        { style: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }, onPress: onPrev },
        React.createElement(Icon, { name: 'chevron_left', size: 24, color: theme.onSurfaceVariant })
      ),
      React.createElement(
        View,
        { style: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }, onPress: onNext },
        React.createElement(Icon, { name: 'chevron_right', size: 24, color: theme.onSurfaceVariant })
      ),
    ),
  );
}

// ─── YearGrid (3-col, 72×36 each, M3 spec) ──────────────────────────────────
function YearGrid(props: { current: number; onSelect: (y: number) => void }): React.ReactElement {
  const { current, onSelect } = props;
  const theme = useTheme();

  const start = current - 6;
  const years = Array.from({ length: 15 }, (_, i) => start + i);
  const rows: number[][] = [];
  for (let i = 0; i < years.length; i += 3) rows.push(years.slice(i, i + 3));
  return React.createElement(
    View,
    { style: { flexDirection: 'column', height: 288, justifyContent: 'center', alignItems: 'center' } },
    rows.map((row, ri) =>
      React.createElement(
        View,
        { key: ri, style: { flexDirection: 'row', height: 52, gap: 8 } },
        row.map(y =>
          React.createElement(
            View,
            {
              key: y,
              style: {
                width: 72, height: 36, borderRadius: 18,
                justifyContent: 'center', alignItems: 'center',
                backgroundColor: y === current ? theme.primary : undefined,
              },
              onPress: () => onSelect(y),
            },
            React.createElement(Text, {
              style: {
                textAlign: 'center',
                text: {
                  fontSize: 14,
                  color: y === current ? theme.onPrimary : theme.onSurface,
                  fontWeight: y === current ? '600' : '400'
                }
              }
            }, String(y))
          )
        )
      )
    )
  );
}

// ─── Time picker dial math (mirrors Flutter material/time_picker.dart) ───────
const TWO_PI = Math.PI * 2;
const DIAL_SIZE = 256;
const DIAL_LABEL_RADIUS = 104;
const DIAL_HUB_RADIUS = 4;
const DIAL_TIP_RADIUS = 20;
const DIAL_HAND_WIDTH = 4;
const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const DRAG_TAP_SLOP = 8;

function thetaForHour12(hour12: number): number {
  const fraction = (hour12 % 12) / 12;
  return (Math.PI / 2 - fraction * TWO_PI) % TWO_PI;
}

function thetaForMinute(minute: number): number {
  const fraction = (minute % 60) / 60;
  return (Math.PI / 2 - fraction * TWO_PI) % TWO_PI;
}

function angleFromPointer(px: number, py: number, cx: number, cy: number): number {
  const dx = px - cx;
  const dy = py - cy;
  return (Math.atan2(dx, dy) - Math.PI / 2 + TWO_PI) % TWO_PI;
}

function hour12FromAngle(angle: number): number {
  const fraction = (0.25 - (angle % TWO_PI) / TWO_PI + 1) % 1;
  const h = Math.round(fraction * 12) % 12;
  return h === 0 ? 12 : h;
}

function minuteFromAngle(angle: number, roundMinutes: boolean): number {
  const fraction = (0.25 - (angle % TWO_PI) / TWO_PI + 1) % 1;
  let minute = Math.round(fraction * 60) % 60;
  if (roundMinutes) {
    minute = Math.floor((minute + 2) / 5) * 5 % 60;
  }
  return minute;
}

function dialLabelPosition(index: number, count: number): { left: number; top: number } {
  const angle = ((index - 3) * (360 / count) * Math.PI) / 180;
  return {
    left: DIAL_SIZE / 2 + DIAL_LABEL_RADIUS * Math.cos(angle) - 18,
    top: DIAL_SIZE / 2 + DIAL_LABEL_RADIUS * Math.sin(angle) - 18,
  };
}

function handTip(theta: number, radius: number): { x: number; y: number } {
  const cx = DIAL_SIZE / 2;
  const cy = DIAL_SIZE / 2;
  return {
    x: cx + radius * Math.cos(theta),
    y: cy - radius * Math.sin(theta),
  };
}

interface ClockDialProps {
  mode: 'hour' | 'minute';
  hour12: number;
  minute: number;
  primaryColor: ColorValue;
  onHourChange: (hour12: number) => void;
  onMinuteChange: (minute: number) => void;
  onHourSelected: () => void;
}

function ClockDial(props: ClockDialProps): React.ReactElement {
  const { mode, hour12, minute, primaryColor, onHourChange, onMinuteChange, onHourSelected } = props;
  const labels = mode === 'hour' ? HOUR_LABELS : MINUTE_LABELS;
  const selectedValue = mode === 'hour' ? hour12 : minute;
  const theta = mode === 'hour' ? thetaForHour12(hour12) : thetaForMinute(minute);
  const tip = handTip(theta, DIAL_LABEL_RADIUS);
  const cx = DIAL_SIZE / 2;
  const cy = DIAL_SIZE / 2;
  const handLength = DIAL_LABEL_RADIUS;
  const handDeg = (Math.atan2(tip.y - cy, tip.x - cx) * 180) / Math.PI;

  const dialLayoutRef = React.useRef({ x: 0, y: 0, width: DIAL_SIZE, height: DIAL_SIZE });
  const dragStartRef = React.useRef({ x: 0, y: 0 });
  const didDragRef = React.useRef(false);

  const pointerToLocal = (screenX: number, screenY: number) => {
    const layout = dialLayoutRef.current;
    return {
      x: screenX - layout.x,
      y: screenY - layout.y,
    };
  };

  const applyPointer = (screenX: number, screenY: number, roundMinutes: boolean) => {
    const local = pointerToLocal(screenX, screenY);
    const angle = angleFromPointer(local.x, local.y, cx, cy);
    if (mode === 'hour') {
      onHourChange(hour12FromAngle(angle));
    } else {
      onMinuteChange(minuteFromAngle(angle, roundMinutes));
    }
  };

  const handleDragStart = (e: { x: number; y: number }) => {
    didDragRef.current = false;
    dragStartRef.current = { x: e.x, y: e.y };
    applyPointer(e.x, e.y, false);
  };

  const handleDragMove = (e: { x: number; y: number }) => {
    const dx = e.x;
    const dy = e.y;
    if (Math.hypot(dx, dy) > DRAG_TAP_SLOP) didDragRef.current = true;
    const screenX = dragStartRef.current.x + dx;
    const screenY = dragStartRef.current.y + dy;
    applyPointer(screenX, screenY, false);
  };

  const handleDragEnd = (e: { x: number; y: number }) => {
    const travel = Math.hypot(e.x, e.y);
    const screenX = dragStartRef.current.x + e.x;
    const screenY = dragStartRef.current.y + e.y;
    // Flutter: pan = 1-min resolution; tap-up snaps minutes to 5-min marks.
    applyPointer(screenX, screenY, travel <= DRAG_TAP_SLOP);
    if (mode === 'hour') onHourSelected();
    didDragRef.current = false;
  };

  return React.createElement(
    View,
    {
      style: {
        alignSelf: 'center',
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        position: 'relative',
        marginBottom: 16,
      },
      onLayout: (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        dialLayoutRef.current = { x, y, width, height };
      },
      onDragStart: handleDragStart,
      onDragMove: handleDragMove,
      onDragEnd: handleDragEnd,
    },
    React.createElement(View, {
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        borderRadius: DIAL_SIZE / 2,
        backgroundColor: 0xece6f0ff,
        pointerEvents: 'none',
      },
    }),
    React.createElement(View, {
      style: {
        position: 'absolute',
        left: (cx + tip.x) / 2 - handLength / 2,
        top: (cy + tip.y) / 2 - DIAL_HAND_WIDTH / 2,
        width: handLength,
        height: DIAL_HAND_WIDTH,
        borderRadius: DIAL_HAND_WIDTH / 2,
        backgroundColor: primaryColor,
        rotation: handDeg,
        pointerEvents: 'none',
      },
    }),
    React.createElement(View, {
      style: {
        position: 'absolute',
        left: cx - DIAL_HUB_RADIUS,
        top: cy - DIAL_HUB_RADIUS,
        width: DIAL_HUB_RADIUS * 2,
        height: DIAL_HUB_RADIUS * 2,
        borderRadius: DIAL_HUB_RADIUS,
        backgroundColor: primaryColor,
        pointerEvents: 'none',
      },
    }),
    React.createElement(View, {
      style: {
        position: 'absolute',
        left: tip.x - DIAL_TIP_RADIUS,
        top: tip.y - DIAL_TIP_RADIUS,
        width: DIAL_TIP_RADIUS * 2,
        height: DIAL_TIP_RADIUS * 2,
        borderRadius: DIAL_TIP_RADIUS,
        backgroundColor: primaryColor,
        pointerEvents: 'none',
      },
    }),
    labels.map((val, idx) => {
      const pos = dialLabelPosition(idx, labels.length);
      const showSelected = mode === 'hour' ? val === hour12 : val === minute;
      const numStyle: Record<string, unknown> = {
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
      };
      if (showSelected) numStyle.backgroundColor = primaryColor;
      return React.createElement(
        View,
        { key: `${mode}-${idx}`, style: numStyle },
        React.createElement(
          Text,
          {
            style: {
              textAlign: 'center',
              text: {
                fontSize: 14,
                color: showSelected ? 0xffffffff : 0x1c1b1fff,
                fontWeight: showSelected ? '700' : '400',
              },
            },
          },
          mode === 'minute' ? String(val).padStart(2, '0') : String(val)
        )
      );
    })
  );
}

// ─── Action row ──────────────────────────────────────────────────────────────
function PickerActions(props: { onCancel: () => void; onOk: () => void }): React.ReactElement {
  const theme = useTheme();

  return React.createElement(
    View,
    { style: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, height: 52, paddingRight: 8 } },
    React.createElement(
      View,
      { style: { paddingHorizontal: 12, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }, onPress: props.onCancel },
      React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '500', color: theme.primary } } }, 'Cancel')
    ),
    React.createElement(
      View,
      { style: { paddingHorizontal: 12, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }, onPress: props.onOk },
      React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '500', color: theme.primary } } }, 'OK')
    ),
  );
}

// ─── DatePicker ──────────────────────────────────────────────────────────────
export function DatePicker(props: DatePickerProps): React.ReactElement {
  const { open, value, label, variant = 'modal', onChange, onRequestClose, onDismiss, style, ...rest } = props;
  const theme = useTheme();

  const initialDate = React.useMemo(() => parseIso(value), [value]);
  const [viewDate, setViewDate] = React.useState(initialDate);
  const [tempSel, setTempSel] = React.useState(initialDate);
  const [yearMode, setYearMode] = React.useState(false);
  const [dockedOpen, setDockedOpen] = React.useState(false);

  const fieldRef = React.useRef<any>(null);
  const [fieldId, setFieldId] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    setViewDate(initialDate);
    setTempSel(initialDate);
    setYearMode(false);
  }, [initialDate]);

  React.useEffect(() => {
    if (dockedOpen && fieldRef.current && fieldRef.current.node) {
      setFieldId(fieldRef.current.node.id);
    }
  }, [dockedOpen]);

  const today = new Date();
  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(yr, mo - 1, 1));
  const nextMonth = () => setViewDate(new Date(yr, mo + 1, 1));
  const handleDay = (d: number) => setTempSel(new Date(yr, mo, d));
  const handleYear = (y: number) => { setViewDate(new Date(y, mo, 1)); setYearMode(false); };

  const handleCancel = () => {
    setTempSel(initialDate);
    setViewDate(initialDate);
    setYearMode(false);
    setDockedOpen(false);
    if (onDismiss) onDismiss();
    else if (onRequestClose) onRequestClose();
  };
  const handleOk = () => {
    if (onChange) onChange(isoFromDate(tempSel));
    setDockedOpen(false);
    if (onRequestClose) onRequestClose();
    else if (onDismiss) onDismiss();
  };

  const calBody = yearMode
    ? React.createElement(YearGrid, { current: yr, onSelect: handleYear })
    : React.createElement(CalendarGrid, { viewDate, selected: tempSel, today, cellW: 48, onDay: handleDay });

  // ── Modal variant (360×568 centered overlay) ─────────────────────────────
  if (variant === 'modal') {
    return React.createElement(
      'rayact-date-picker',
      {
        open,
        onRequestClose: onRequestClose ?? onDismiss,
        style: [
          {
            padding: 0,
            width: 360,
            height: 568,
            minWidth: 328,
            minHeight: 400,
            backgroundColor: theme.surfaceContainerHigh,
            borderRadius: 28,
            flexDirection: 'column',
          },
          style,
        ],
        ...rest,
      },
      // Header block
      React.createElement(
        View,
        { style: { paddingTop: 20, paddingBottom: 12, paddingHorizontal: 24, height: 120 } },
        // Row: "Select date" + edit icon
        React.createElement(
          View,
          { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 20, marginBottom: 8 } },
          React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '500', color: theme.onSurfaceVariant } } }, 'Select date'),
          React.createElement(Icon, { name: 'edit', size: 20, color: theme.onSurfaceVariant })
        ),
        // Headline date: "Mon, Aug 17"
        React.createElement(
          Text,
          { style: { height: 40, text: { fontSize: 32, fontWeight: '400', color: theme.onSurfaceVariant, lineHeight: 40 } } },
          headlineDate(tempSel)
        )
      ),
      // Divider
      React.createElement(View, { style: { height: 1, backgroundColor: theme.outlineVariant } }),
      // Calendar area
      React.createElement(
        View,
        { style: { paddingHorizontal: 12, paddingBottom: 8, flexGrow: 1 } },
        React.createElement(MonthYearBar, {
          viewDate, onPrev: prevMonth, onNext: nextMonth,
          onToggle: () => setYearMode(v => !v), showArrow: true,
        }),
        React.createElement(
          View,
          { style: { flexGrow: 1 } },
          calBody
        )
      ),
      // Actions
      React.createElement(PickerActions, { onCancel: handleCancel, onOk: handleOk })
    );
  }

  // ── Docked / Input variant ─────────────────────────────────────────────
  const displayVal = mmddyyyy(tempSel);
  const active = dockedOpen;

  return React.createElement(
    View,
    { style: [{ position: 'relative', width: 320 }, style], ...rest },
    // Outlined field
    React.createElement(
      View,
      {
        ref: fieldRef,
        style: {
          height: 56, borderRadius: 4,
          borderWidth: active ? 2 : 1,
          borderColor: active ? theme.primary : theme.outline,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, backgroundColor: theme.surface,
          position: 'relative',
        },
        onPress: () => setDockedOpen(v => !v),
      },
      // Floating label
      React.createElement(
        View,
        { style: { position: 'absolute', left: 12, top: -10, paddingHorizontal: 4, backgroundColor: theme.surface } },
        React.createElement(Text, {
          style: { text: { fontSize: 12, color: active ? theme.primary : theme.onSurfaceVariant } }
        }, label || 'Date')
      ),
      React.createElement(Text, { style: { flexGrow: 1, text: { fontSize: 16, color: theme.onSurface } } }, displayVal),
      React.createElement(Icon, { name: 'calendar_month', size: 24, color: theme.onSurfaceVariant }),
    ),
    // Helper text
    React.createElement(Text, {
      style: { paddingLeft: 16, marginTop: 4, text: { fontSize: 12, color: theme.onSurfaceVariant } }
    }, 'MM/DD/YYYY'),

    // Dropdown calendar card inside Popover
    (dockedOpen && fieldId)
      ? React.createElement(
          'rayact-popover',
          {
            anchor: fieldId,
            placement: 'auto',
            open: true,
            scrim: true,
            onRequestClose: handleCancel,
            style: {
              width: 360,
              height: DOCKED_DATE_PICKER_HEIGHT,
              backgroundColor: theme.surfaceContainer,
              borderRadius: 8,
              overflow: 'hidden',
              elevation: 4,
              flexDirection: 'column',
            },
          },
          React.createElement(
            View,
            { style: { paddingHorizontal: 12, paddingTop: 8 } },
            React.createElement(MonthYearBar, {
              viewDate, onPrev: prevMonth, onNext: nextMonth,
              onToggle: () => setYearMode(v => !v), showArrow: true,
            }),
          ),
          React.createElement(
            View,
            { style: { paddingHorizontal: 12, paddingBottom: 4, height: CALENDAR_GRID_HEIGHT } },
            calBody,
          ),
          React.createElement(PickerActions, { onCancel: handleCancel, onOk: handleOk }),
        )
      : null
  );
}

export const Dialog = createMaterialComponent('rayact-dialog');
export const Divider = createMaterialComponent('rayact-divider');
export const ExtendedFab = createMaterialComponent('rayact-extended-fab');
export const Fab = createMaterialComponent('rayact-fab');
export const FabMenu = createMaterialComponent('rayact-fab-menu');
export const IconButton = createMaterialComponent('rayact-icon-button');
export const MaterialList = createMaterialComponent('rayact-list');
export const LoadingIndicator = createMaterialComponent('rayact-loading-indicator');
export const Menu = createMaterialComponent('rayact-menu');
export function MenuItem(props: MaterialComponentProps & { label?: string; trailing?: React.ReactNode }): React.ReactElement {
  const { label, trailing, children, ...rest } = props;
  // Compose order: leading content (children, e.g. icon) → label → trailing
  // (shortcut text / submenu arrow). `label` is rendered as a Text child here
  // rather than passed to native, so the leading icon stays before the label.
  return React.createElement(
    'rayact-menu-item',
    rest,
    children,
    label != null ? React.createElement(Text, { style: { flexGrow: 1 } }, label) : null,
    trailing
  );
}
export function NavigationBar(props: NavigationBarProps): React.ReactElement {
  const { extendBottomPaddingToNavigationBar, ignoreSafeAreaView, style, ...rest } = props;
  const extend = ignoreSafeAreaView || extendBottomPaddingToNavigationBar;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  if (!extend) {
    return React.createElement('rayact-navigation-bar', { ...rest, style });
  }
  const bottomInset = Math.max(0, insets.bottom);
  const leftInset = Math.max(0, insets.left);
  const rightInset = Math.max(0, insets.right);
  const backgroundColor =
    (asStyleObject(style).backgroundColor as ColorValue | undefined) ?? theme.surfaceContainer;
  const barStyle: Style = {
    height: NAVIGATION_BAR_HEIGHT + bottomInset,
    minHeight: NAVIGATION_BAR_HEIGHT + bottomInset,
    paddingBottom: bottomInset,
    paddingLeft: leftInset,
    paddingRight: rightInset,
    backgroundColor,
  };
  return React.createElement('rayact-navigation-bar', { ...rest, style: [style, barStyle] });
}
export const NavigationBarItem = createMaterialComponent('rayact-navigation-bar-item');
export const NavigationDrawer = createMaterialComponent('rayact-navigation-drawer');
export const NavigationRail = createMaterialComponent('rayact-navigation-rail');
export const ProgressIndicator = createMaterialComponent('rayact-progress-indicator');
export const RadioButton = createMaterialComponent('rayact-radio-button');
export const RangeSlider = createMaterialComponent('rayact-range-slider');
export const Search = createMaterialComponent('rayact-search');
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
      drawBackground: false,
      drawOutline: false,
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
export function TabBar(props: TabBarProps): React.ReactElement {
  const { extendBottomPaddingToNavigationBar, ignoreSafeAreaView, style, children, ...rest } = props;
  const extend = ignoreSafeAreaView || extendBottomPaddingToNavigationBar;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  if (!extend) {
    return React.createElement(View, { ...rest, style }, children);
  }
  const backgroundColor = theme.surfaceContainerHigh;
  return React.createElement(
    View,
    { ...rest, style: [style, { backgroundColor }] },
    children,
    React.createElement(BottomSafeAreaSpacer, {
      height: Math.max(0, insets.bottom),
      backgroundColor,
    })
  );
}
export const Snackbar = createMaterialComponent('rayact-snackbar');
export const SplitButton = createMaterialComponent('rayact-split-button');
export const Switch = createMaterialComponent('rayact-switch');
export function Tabs(props: TabsProps): React.ReactElement {
  const { extendTopPaddingToStatusBar, ignoreSafeAreaView, style, ...rest } = props;
  const extend = ignoreSafeAreaView || extendTopPaddingToStatusBar;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  if (!extend) {
    return React.createElement('rayact-tabs', { ...rest, style });
  }
  const backgroundColor = theme.surfaceContainer;
  return React.createElement(
    View,
    { style: [style, { backgroundColor }] },
    React.createElement(TopSafeAreaSpacer, {
      height: Math.max(0, insets.top),
      backgroundColor,
    }),
    React.createElement('rayact-tabs', rest)
  );
}
export function TextField(props: TextInputProps & { label?: string }): React.ReactElement {
  const { label, placeholder, style, variant, drawBackground, ...rest } = props;
  const resolvedVariant = variant ?? 'filled';
  // Route through TextInput so the react-native prop surface (keyboardType,
  // secureTextEntry, editable, …) is mapped to the native wire protocol.
  return React.createElement(TextInput, {
    ...rest,
    label,
    placeholder,
    variant: resolvedVariant,
    // Outlined/underline have no fill; filled draws its container background.
    drawBackground: drawBackground ?? (resolvedVariant === 'filled'),
    drawOutline: true,
    style: [
      { height: 56, minWidth: 240 },
      style
    ]
  });
}
function hour24ToHour12(hour24: number): number {
  const h = hour24 % 12;
  return h === 0 ? 12 : h;
}

function hour12ToHour24(hour12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function TimePicker(props: TimePickerProps): React.ReactElement {
  const { open, value, onChange, onRequestClose, onDismiss, style, ...rest } = props;
  const theme = useTheme();

  const parsedTime = React.useMemo(() => {
    if (value) {
      const parts = value.split(':');
      if (parts.length === 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return { hour24: h, minute: m };
      }
    }
    const now = new Date();
    return { hour24: now.getHours(), minute: now.getMinutes() };
  }, [value]);

  const [hour12, setHour12] = React.useState(() => hour24ToHour12(parsedTime.hour24));
  const [minute, setMinute] = React.useState(parsedTime.minute);
  const [selecting, setSelecting] = React.useState<'hour' | 'minute'>('hour');
  const [period, setPeriod] = React.useState<'AM' | 'PM'>(parsedTime.hour24 >= 12 ? 'PM' : 'AM');

  React.useEffect(() => {
    setHour12(hour24ToHour12(parsedTime.hour24));
    setMinute(parsedTime.minute);
    setPeriod(parsedTime.hour24 >= 12 ? 'PM' : 'AM');
    setSelecting('hour');
  }, [parsedTime]);

  const handleCancel = () => {
    if (onDismiss) onDismiss();
    else if (onRequestClose) onRequestClose();
  };

  const handleOk = () => {
    const finalHour = hour12ToHour24(hour12, period);
    const formattedHour = String(finalHour).padStart(2, '0');
    const formattedMinute = String(minute).padStart(2, '0');
    if (onChange) onChange(`${formattedHour}:${formattedMinute}`);
    handleCancel();
  };

  const selectedCardBg = theme.primaryContainer;
  const selectedCardFg = theme.onPrimaryContainer;
  const unselectedCardBg = theme.surfaceContainerHighest;
  const unselectedCardFg = theme.onSurface;

  return React.createElement(
    'rayact-time-picker',
    {
      open,
      onRequestClose: onRequestClose ?? onDismiss,
      style: [
        {
          padding: 0,
          width: 310,
          height: 468,
          minWidth: 238,
          minHeight: 326,
          backgroundColor: theme.surfaceContainerHigh,
          borderRadius: 28,
          flexDirection: 'column',
        },
        style,
      ],
      ...rest,
    },
    React.createElement(
      View,
      { style: { paddingTop: 20, paddingBottom: 12, paddingHorizontal: 24 } },
      React.createElement(
        Text,
        { style: { marginBottom: 8, text: { fontSize: 14, fontWeight: '500', color: theme.onSurfaceVariant } } },
        'Select time'
      ),
      React.createElement(
        View,
        { style: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 72 } },
        React.createElement(
          View,
          {
            style: {
              width: 80,
              height: 72,
              borderRadius: 8,
              backgroundColor: selecting === 'hour' ? selectedCardBg : unselectedCardBg,
              justifyContent: 'center',
              alignItems: 'center',
            },
            onPress: () => setSelecting('hour'),
          },
          React.createElement(
            Text,
            {
              style: {
                text: {
                  fontSize: 40,
                  fontWeight: '700',
                  color: selecting === 'hour' ? selectedCardFg : unselectedCardFg,
                },
              },
            },
            String(hour12).padStart(2, '0')
          )
        ),
        React.createElement(
          Text,
          {
            style: {
              marginHorizontal: 8,
              height: 72,
              text: { fontSize: 40, fontWeight: '700', color: unselectedCardFg, lineHeight: 72 },
            },
          },
          ':'
        ),
        React.createElement(
          View,
          {
            style: {
              width: 80,
              height: 72,
              borderRadius: 8,
              backgroundColor: selecting === 'minute' ? selectedCardBg : unselectedCardBg,
              justifyContent: 'center',
              alignItems: 'center',
            },
            onPress: () => setSelecting('minute'),
          },
          React.createElement(
            Text,
            {
              style: {
                text: {
                  fontSize: 40,
                  fontWeight: '700',
                  color: selecting === 'minute' ? selectedCardFg : unselectedCardFg,
                },
              },
            },
            String(minute).padStart(2, '0')
          )
        ),
        React.createElement(
          View,
          {
            style: {
              flexDirection: 'column',
              height: 72,
              borderWidth: 1,
              borderColor: theme.outline,
              borderRadius: 8,
              marginLeft: 12,
              overflow: 'hidden',
            },
          },
          React.createElement(
            View,
            {
              style: {
                width: 52,
                height: 36,
                backgroundColor: period === 'AM' ? selectedCardBg : undefined,
                justifyContent: 'center',
                alignItems: 'center',
              },
              onPress: () => setPeriod('AM'),
            },
            React.createElement(
              Text,
              {
                style: {
                  text: {
                    fontSize: 14,
                    fontWeight: '700',
                    color: period === 'AM' ? selectedCardFg : theme.onSurfaceVariant,
                  },
                },
              },
              'AM'
            )
          ),
          React.createElement(View, { style: { height: 1, backgroundColor: theme.outline } }),
          React.createElement(
            View,
            {
              style: {
                width: 52,
                height: 36,
                backgroundColor: period === 'PM' ? selectedCardBg : undefined,
                justifyContent: 'center',
                alignItems: 'center',
              },
              onPress: () => setPeriod('PM'),
            },
            React.createElement(
              Text,
              {
                style: {
                  text: {
                    fontSize: 14,
                    fontWeight: '700',
                    color: period === 'PM' ? selectedCardFg : theme.onSurfaceVariant,
                  },
                },
              },
              'PM'
            )
          )
        )
      )
    ),
    React.createElement(View, { style: { height: 1, backgroundColor: theme.outlineVariant } }),
    React.createElement(
      View,
      { style: { paddingTop: 24, paddingHorizontal: 24, flexGrow: 1, alignItems: 'center' } },
      React.createElement(ClockDial, {
        mode: selecting,
        hour12,
        minute,
        primaryColor: theme.primary,
        onHourChange: setHour12,
        onMinuteChange: setMinute,
        onHourSelected: () => setSelecting('minute'),
      })
    ),
    React.createElement(PickerActions, { onCancel: handleCancel, onOk: handleOk })
  );
}
export const Toolbar = createMaterialComponent('rayact-toolbar');
export const Tooltip = createMaterialComponent('rayact-tooltip');
