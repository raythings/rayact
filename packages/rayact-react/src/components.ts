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
  TextProps,
  DatePickerProps,
  TimePickerProps
} from './types';
import { useTheme } from './theme/theming';

const searchIconSlotStyle = { width: 24, height: 24 };

function withSearchIconSlot(node: React.ReactNode, style?: unknown): React.ReactNode {
  if (node && React.isValidElement(node) && node.type === Icon) {
    const iconNode = node as React.ReactElement<{ style?: unknown }>;
    return React.cloneElement(iconNode, {
      style: [searchIconSlotStyle, iconNode.props.style, style]
    });
  }
  return node;
}

export const View = React.forwardRef<any, BaseProps>((props, ref) => {
  return React.createElement('rayact-view', { ...props, ref });
});

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

export const Input = TextInput;

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

// ─── DayCell ────────────────────────────────────────────────────────────────
function DayCell(props: {
  day: number | null; cellW: number;
  selected: boolean; isToday: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { day, cellW, selected, isToday, onPress } = props;
  const theme = useTheme();

  if (day === null) {
    return React.createElement(View, { style: { width: cellW, height: 48 } });
  }
  return React.createElement(
    View,
    { style: { width: cellW, height: 48, justifyContent: 'center', alignItems: 'center' }, onPress },
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
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return React.createElement(
    View,
    { style: { flexDirection: 'column', alignItems: 'center', height: rows.length * 48 + 48 } },
    // Weekday header
    React.createElement(
      View,
      { style: { flexDirection: 'row', height: 48 } },
      WD.map((d, i) =>
        React.createElement(
          View,
          { key: i, style: { width: cellW, height: 48, justifyContent: 'center', alignItems: 'center' } },
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
              backgroundColor: theme.surfaceContainer,
              borderRadius: 8,
              overflow: 'hidden',
              elevation: 4,
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
            { style: { paddingHorizontal: 12, paddingBottom: 4 } },
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
export const NavigationBar = createMaterialComponent('rayact-navigation-bar');
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
export const Snackbar = createMaterialComponent('rayact-snackbar');
export const SplitButton = createMaterialComponent('rayact-split-button');
export const Switch = createMaterialComponent('rayact-switch');
export const Tabs = createMaterialComponent('rayact-tabs');
export function TextField(props: TextInputProps & { label?: string }): React.ReactElement {
  const { label, placeholder, style, variant, drawBackground, ...rest } = props;
  const resolvedVariant = variant ?? 'filled';
  return React.createElement('rayact-text-input', {
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
export function TimePicker(props: TimePickerProps): React.ReactElement {
  const { open, value, onChange, onRequestClose, onDismiss, style, ...rest } = props;
  const theme = useTheme();

  const parsedTime = React.useMemo(() => {
    if (value) {
      const parts = value.split(':');
      if (parts.length === 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return { hour: h, minute: m };
      }
    }
    const now = new Date();
    return { hour: now.getHours(), minute: now.getMinutes() };
  }, [value]);

  const [hour, setHour] = React.useState(parsedTime.hour);
  const [minute, setMinute] = React.useState(parsedTime.minute);
  const [selecting, setSelecting] = React.useState<'hour' | 'minute'>('hour');
  const [period, setPeriod] = React.useState<'AM' | 'PM'>(parsedTime.hour >= 12 ? 'PM' : 'AM');

  React.useEffect(() => {
    setHour(parsedTime.hour);
    setMinute(parsedTime.minute);
    setPeriod(parsedTime.hour >= 12 ? 'PM' : 'AM');
  }, [parsedTime]);

  const handleCancel = () => {
    if (onDismiss) onDismiss();
    else if (onRequestClose) onRequestClose();
  };

  const handleOk = () => {
    let finalHour = hour;
    if (period === 'AM') {
      if (finalHour === 12) finalHour = 0;
      else if (finalHour > 12) finalHour = finalHour - 12;
    } else {
      if (finalHour < 12) finalHour = finalHour + 12;
      else if (finalHour === 12) finalHour = 12;
    }
    const formattedHour = String(finalHour).padStart(2, '0');
    const formattedMinute = String(minute).padStart(2, '0');
    if (onChange) onChange(`${formattedHour}:${formattedMinute}`);
    handleCancel();
  };

  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = String(minute).padStart(2, '0');

  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutesList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const currentList = selecting === 'hour' ? hoursList : minutesList;
  const currentValue = selecting === 'hour' ? displayHour : minute;

  return React.createElement(
    'rayact-time-picker',
    {
      open,
      onRequestClose: onRequestClose ?? onDismiss,
      style: [
        {
          width: 328,
          height: 508,
          padding: 24,
          backgroundColor: theme.surfaceContainerHigh,
          borderRadius: 28,
          flexDirection: 'column',
        },
        style,
      ],
      ...rest,
    },
    // Title
    React.createElement(
      Text,
      { style: { marginBottom: 20, height: 20, text: { fontSize: 12, fontWeight: '500', color: theme.onSurfaceVariant } } },
      'Select time'
    ),
    // Selector boxes row
    React.createElement(
      View,
      { style: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24, height: 72 } },
      // Hour Display Card
      React.createElement(
        View,
        {
          style: {
            width: 80,
            height: 72,
            borderRadius: 8,
            backgroundColor: selecting === 'hour' ? 0xe8def8ff : 0xece6f0ff,
            justifyContent: 'center',
            alignItems: 'center'
          },
          onPress: () => setSelecting('hour')
        },
        React.createElement(
          Text,
          { style: { text: { fontSize: 40, fontWeight: '700', color: selecting === 'hour' ? 0x21005dff : 0x1c1b1fff } } },
          String(displayHour).padStart(2, '0')
        )
      ),
      // Colon separator
      React.createElement(
        Text,
        { style: { marginHorizontal: 8, height: 72, text: { fontSize: 40, fontWeight: '700', color: 0x1c1b1fff, lineHeight: 72 } } },
        ':'
      ),
      // Minute Display Card
      React.createElement(
        View,
        {
          style: {
            width: 80,
            height: 72,
            borderRadius: 8,
            backgroundColor: selecting === 'minute' ? 0xe8def8ff : 0xece6f0ff,
            justifyContent: 'center',
            alignItems: 'center'
          },
          onPress: () => setSelecting('minute')
        },
        React.createElement(
          Text,
          { style: { text: { fontSize: 40, fontWeight: '700', color: selecting === 'minute' ? 0x21005dff : 0x1c1b1fff } } },
          displayMinute
        )
      ),
      // AM/PM Toggle Column
      React.createElement(
        View,
        { style: { flexDirection: 'column', height: 72, borderWidth: 1, borderColor: 0x79747eff, borderRadius: 8, marginLeft: 12, overflow: 'hidden' } },
        React.createElement(
          View,
          {
            style: {
              width: 52,
              height: 36,
              backgroundColor: period === 'AM' ? 0xe8def8ff : undefined,
              justifyContent: 'center',
              alignItems: 'center'
            },
            onPress: () => setPeriod('AM')
          },
          React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '700', color: period === 'AM' ? 0x21005dff : 0x49454fff } } }, 'AM')
        ),
        React.createElement(
          View,
          { style: { height: 1, backgroundColor: 0x79747eff } },
          null
        ),
        React.createElement(
          View,
          {
            style: {
              width: 52,
              height: 36,
              backgroundColor: period === 'PM' ? 0xe8def8ff : undefined,
              justifyContent: 'center',
              alignItems: 'center'
            },
            onPress: () => setPeriod('PM')
          },
          React.createElement(Text, { style: { text: { fontSize: 14, fontWeight: '700', color: period === 'PM' ? 0x21005dff : 0x49454fff } } }, 'PM')
        )
      )
    ),
    // Dial Circle Face Container
    React.createElement(
      View,
      {
        style: {
          alignSelf: 'center',
          width: 256,
          height: 256,
          borderRadius: 128,
          backgroundColor: 0xece6f0ff,
          position: 'relative',
          marginBottom: 16
        }
      },
      // Central pivot dot
      React.createElement(
        View,
        {
          style: {
            position: 'absolute',
            left: 124,
            top: 124,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: 0x6750a4ff
          }
        }
      ),
      // Dial values placed circularly
      currentList.map((val, idx) => {
        const angle = ((idx - 3) * 30 * Math.PI) / 180;
        const left = 128 + 104 * Math.cos(angle) - 18;
        const top = 128 + 104 * Math.sin(angle) - 18;

        const isSelected = currentValue === val;
        const numStyle: Record<string, unknown> = {
          position: 'absolute',
          left,
          top,
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center'
        };
        const textStyle: Record<string, unknown> = {
          textAlign: 'center',
          text: {
            fontSize: 14,
            color: isSelected ? 0xffffffff : 0x1c1b1fff,
            fontWeight: isSelected ? '700' : '400',
          }
        };

        if (isSelected) {
          numStyle.backgroundColor = 0x6750a4ff;
        }

        const selectVal = () => {
          if (selecting === 'hour') {
            setHour(val);
            setSelecting('minute');
          } else {
            setMinute(val);
          }
        };

        return React.createElement(
          View,
          { key: idx, style: numStyle, onPress: selectVal },
          React.createElement(
            Text,
            { style: textStyle },
            selecting === 'minute' ? String(val).padStart(2, '0') : String(val)
          )
        );
      })
    ),
    // Action footer
    React.createElement(PickerActions, { onCancel: handleCancel, onOk: handleOk })
  );
}
export const Toolbar = createMaterialComponent('rayact-toolbar');
export const Tooltip = createMaterialComponent('rayact-tooltip');
