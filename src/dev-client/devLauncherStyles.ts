import type { Style } from '../react/index.js';

export const PAGE_PADDING = 24;
export const SECTION_GAP = 28;
export const INPUT_HEIGHT = 48;
export const INPUT_RADIUS = 12;
export const CARD_RADIUS = 12;
export const ROW_GAP = 10;
export const STATUS_DOT_SIZE = 10;

export const pageStyle: Style = {
  flexGrow: 1,
  padding: PAGE_PADDING,
  gap: SECTION_GAP,
};

export const sectionStyle: Style = {
  gap: 8,
  flexShrink: 0,
  minWidth: 0,
  width: '100%',
};

export const sectionTitleStyle: Style = {
  text: { fontSize: 14, fontWeight: 600 },
};

export const hintStyle: Style = {
  text: { fontSize: 14 },
};

export const inputStyle: Style = {
  height: INPUT_HEIGHT,
  padding: 12,
  borderRadius: INPUT_RADIUS,
  width: '100%',
  minWidth: 0,
};

export const primaryButtonStyle: Style = {
  width: '100%',
  padding: 14,
  borderRadius: INPUT_RADIUS,
  alignItems: 'center',
};

export const secondaryButtonStyle: Style = {
  width: '100%',
  padding: 14,
  borderRadius: INPUT_RADIUS,
  alignItems: 'center',
};

export const cardStyle: Style = {
  borderRadius: CARD_RADIUS,
  padding: 16,
  gap: 12,
  width: '100%',
  minWidth: 0,
};

export const modalOverlayStyle: Style = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
  padding: PAGE_PADDING,
  zIndex: 1000,
};

export const modalStyle: Style = {
  width: '100%',
  maxWidth: 400,
  borderRadius: CARD_RADIUS,
  padding: 20,
  gap: 12,
};

export const tabBarStyle: Style = {
  flexDirection: 'row',
  borderTopWidth: 1,
  paddingTop: 8,
  paddingBottom: 8,
  flexShrink: 0,
};

export const tabItemStyle: Style = {
  flexGrow: 1,
  alignItems: 'center',
  padding: 8,
  gap: 4,
};
