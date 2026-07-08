// Binary command-buffer protocol — single source of truth for the JS encoder.
//
// MUST stay in sync with the native decoder in
// native/desktop/raym3_bridge.cpp (applyCommandBuffer / applyStyleKeyBinary /
// createNodeFromBuffer). Each command is one int32 opcode followed by int32
// args (little-endian) in the shared __rayactCommandBuffer arena; f64 values
// occupy 2 words. The whole per-commit stream is flushed in ONE call.

export const CMD = {
  // --- structural (slice 1) ---
  APPEND: 1, //  parentId, childId
  INSERT: 2, //  parentId, childId, beforeChildId
  REMOVE: 3, //  parentId, childId
  DISPOSE: 4, // nodeId
  SET_ROOT: 5, // nodeId

  // --- create + style (slice 3) ---
  CREATE: 10, //      nodeId, typeId, styleN, [styleEntry...]
  CREATE_PARAM: 11, // nodeId, typeId, stringId, flags, size, color, variantId, styleN, [styleEntry...]
  SET_STYLE: 12, //   nodeId, styleN, [styleEntry...]
  NEW_STRING: 13, //  stringId, byteLen, <utf8, padded to 4>
  SET_TEXT: 14, //    nodeId, stringId

  // --- reserved ---
  SET_CLASSNAME: 15,
  SET_EVENT: 16,
  SET_MATERIAL: 17,
  DIRTY_SLAB: 18,
} as const;

// Node types that the binary create path handles. Everything else falls back to
// the synchronous bridge.createNode path.
export const TYPE = {
  VIEW: 1,
  TEXT: 2,
  BUTTON: 3,
  IMAGE: 4,
  ICON: 5,
  SCROLL_VIEW: 6,
  TEXT_INPUT: 7,
  SAFE_AREA: 8,
  STATUS_BAR: 9,
} as const;

// Style keys. A `styleEntry` is: keyId (1 word) followed by the value —
// F64 keys take 2 words, COLOR/ENUM keys take 1 word. The value width is
// implied by the key (see F64_KEYS / COLOR_KEYS / ENUM_KEYS below), so no
// per-entry tag is stored. Keys here mirror native applyStyleKeyBinary.
export const SK = {
  // floats
  width: 1, height: 2, minWidth: 3, minHeight: 4, maxWidth: 5, maxHeight: 6,
  flexGrow: 7, flexShrink: 8, flexBasis: 9, flex: 10,
  gap: 11, rowGap: 12, columnGap: 13,
  padding: 14, paddingTop: 15, paddingRight: 16, paddingBottom: 17, paddingLeft: 18,
  paddingHorizontal: 19, paddingVertical: 20,
  margin: 21, marginTop: 22, marginRight: 23, marginBottom: 24, marginLeft: 25,
  marginHorizontal: 26, marginVertical: 27,
  opacity: 28, borderRadius: 29, borderWidth: 30, elevation: 31,
  translateX: 36, translateY: 37, scale: 38, rotation: 39,
  fontSize: 40, lineHeight: 41, letterSpacing: 42,
  // colors (uint32)
  backgroundColor: 50, borderColor: 51, color: 52,
  // enums (int)
  flexDirection: 60, justifyContent: 61, alignItems: 62, alignSelf: 63,
  display: 64, position: 65, overflow: 66, pointerEvents: 67,
} as const;

export type StyleKey = keyof typeof SK;

export const F64_KEYS = new Set<string>([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'flexGrow', 'flexShrink', 'flexBasis', 'flex', 'gap', 'rowGap', 'columnGap',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'paddingHorizontal', 'paddingVertical',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginHorizontal', 'marginVertical',
  'opacity', 'borderRadius', 'borderWidth', 'elevation',
  'translateX', 'translateY', 'scale', 'rotation',
  'fontSize', 'lineHeight', 'letterSpacing',
]);

export const COLOR_KEYS = new Set<string>(['backgroundColor', 'borderColor', 'color']);

// Enum string → int. MUST match native applyStyleKeyBinary.
export const ENUM_VALUES: Record<string, Record<string, number>> = {
  flexDirection: { row: 0, column: 1, 'row-reverse': 2, 'column-reverse': 3 },
  justifyContent: { 'flex-start': 0, 'flex-end': 1, center: 2, 'space-between': 3, 'space-around': 4, 'space-evenly': 5 },
  alignItems: { 'flex-start': 0, 'flex-end': 1, center: 2, stretch: 3, baseline: 4 },
  alignSelf: { 'flex-start': 0, 'flex-end': 1, center: 2, stretch: 3 },
  display: { flex: 0, none: 1, contents: 2 },
  position: { absolute: 0, relative: 1, fixed: 2 },
  overflow: { hidden: 0, scroll: 1, visible: 2 },
  pointerEvents: { none: 0, auto: 1 },
};

export type CmdOpcode = (typeof CMD)[keyof typeof CMD];
