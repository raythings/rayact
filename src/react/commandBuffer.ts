// Zero-allocation binary encoder for the per-commit mutation stream.
//
// emit* helpers write opcodes + args straight into the shared
// __rayactCommandBuffer arena (no per-op object allocation, no boundary
// crossing). resetAfterCommit() calls flushCommands() once → native decodes the
// whole stream in a single __rayactFlushCommands(byteLen) call.
//
// Slice 3 adds JS-owned node IDs + binary node creation with an inline style
// codec, so a mount batches into ~1 crossing with zero parseStyle probes in
// native. Node types / styles the codec cannot represent fall back to the
// synchronous bridge.createNode path (see canBatchCreate in reconciler).
import { CMD, ENUM_VALUES, SK } from './protocol';
import { perfLogBatch } from './perfLog';

type BinaryGlobals = typeof globalThis & {
  __RAYACT_USE_BINARY?: boolean;
  __rayactCommandBuffer?: ArrayBuffer;
  __rayactFlushCommands?: (byteLen: number) => void;
};

let view: DataView | null = null;
let capacity = 0;
let cursor = 0;

function init(): boolean {
  if (view) return true;
  const g = globalThis as BinaryGlobals;
  const buf = g.__rayactCommandBuffer;
  if (!buf || typeof g.__rayactFlushCommands !== 'function') return false;
  view = new DataView(buf);
  capacity = buf.byteLength;
  return true;
}

export function binaryEnabled(): boolean {
  return (globalThis as BinaryGlobals).__RAYACT_USE_BINARY === true && init();
}

// --- JS-owned node IDs ------------------------------------------------------
// EVEN ids; native-allocated ids are ODD (raym3_bridge nextNativeNodeId). The
// two spaces are disjoint by parity, so they never collide even across native
// per-instance resets. Both stay low/dense — the animated style slab is indexed
// by id.
let nextNodeId = 0;
export function allocNodeId(): number {
  nextNodeId += 2;
  return nextNodeId;
}

// --- string interning -------------------------------------------------------
// First sight of a string emits NEW_STRING(id, bytes); later uses reference the
// int id. Native keeps a parallel intern table keyed by the same id.
const stringIds = new Map<string, number>();
let nextStringId = 1;

// --- low-level writers ------------------------------------------------------
function ensureSpace(bytes: number): void {
  // A single op/node always fits in a fresh arena, so a pre-write flush is safe:
  // ops apply in order, splitting one commit across native calls is harmless.
  if (cursor + bytes > capacity) flushCommands();
}
function w32(v: number): void {
  view!.setInt32(cursor, v | 0, true);
  cursor += 4;
}
function wU32(v: number): void {
  view!.setUint32(cursor, v >>> 0, true);
  cursor += 4;
}
function wF64(v: number): void {
  view!.setFloat64(cursor, v, true);
  cursor += 8;
}

// --- structural ops (slice 1) ----------------------------------------------
export function emitAppend(parentId: number, childId: number): void {
  ensureSpace(12);
  w32(CMD.APPEND);
  w32(parentId);
  w32(childId);
}
export function emitInsert(parentId: number, childId: number, beforeChildId: number): void {
  ensureSpace(16);
  w32(CMD.INSERT);
  w32(parentId);
  w32(childId);
  w32(beforeChildId);
}
export function emitRemove(parentId: number, childId: number): void {
  ensureSpace(12);
  w32(CMD.REMOVE);
  w32(parentId);
  w32(childId);
}
export function emitDispose(nodeId: number): void {
  ensureSpace(8);
  w32(CMD.DISPOSE);
  w32(nodeId);
}
export function emitSetRoot(nodeId: number): void {
  ensureSpace(8);
  w32(CMD.SET_ROOT);
  w32(nodeId);
}

// --- style codec ------------------------------------------------------------
type StyleObj = Record<string, unknown>;

/** True if `style` is fully representable by the binary codec (else fallback). */
const SK_MAP = SK as Record<string, number>;

function styleEntrySize(key: string, value: unknown): number {
  if (value == null) return 0;
  const id = SK_MAP[key];
  if (id === undefined) return -1;
  if (id < 60) {
    if (typeof value !== 'number') return -1;
    return id < 50 ? 12 : 8;
  }
  const m = ENUM_VALUES[key];
  if (!m || typeof value !== 'string' || m[value] === undefined) return -1;
  return 8;
}

// Single pass: validates AND sizes a style object. Returns the style-run byte
// size (incl the count word), or -1 if any key/value isn't codec-representable
// (caller then falls back to the sync bridge). Replaces the old
// canEncodeStyle + styleByteSize two-pass combo — this is the create hot path.
export function styleEncSize(style: unknown): number {
  if (style == null) return 4;
  if (typeof style !== 'object' || Array.isArray(style)) return -1;
  let bytes = 4; // count word
  for (const k in style) {
    const v = (style as StyleObj)[k];
    if (v == null) continue;
    if (k === 'text') {
      if (typeof v !== 'object' || Array.isArray(v)) return -1;
      for (const textKey in (v as StyleObj)) {
        const nestedSize = styleEntrySize(textKey, (v as StyleObj)[textKey]);
        if (nestedSize < 0) return -1;
        bytes += nestedSize;
      }
      continue;
    }
    const entrySize = styleEntrySize(k, v);
    if (entrySize < 0) return -1;
    bytes += entrySize;
  }
  return bytes;
}

export function canEncodeStyle(style: unknown): boolean {
  return styleEncSize(style) >= 0;
}

// Writes count + entries in ONE pass: reserve the count slot, write entries
// while tallying, then back-patch the count. Assumes the run is codec-valid and
// space is already reserved (via styleEncSize).
function writeStyleRun(style: StyleObj | null | undefined): void {
  if (!style) {
    w32(0);
    return;
  }
  const countPos = cursor;
  cursor += 4;
  let n = 0;
  const writeEntry = (k: string, v: unknown) => {
    if (v == null) return;
    const id = SK_MAP[k];
    if (id === undefined) return;
    w32(id);
    if (id < 50) wF64(v as number);
    else if (id < 60) wU32(v as number);
    else w32(ENUM_VALUES[k][v as string]);
    n++;
  };
  for (const k in style) {
    const v = style[k];
    if (k === 'text' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const textKey in (v as StyleObj)) {
        writeEntry(textKey, (v as StyleObj)[textKey]);
      }
      continue;
    }
    writeEntry(k, v);
  }
  view!.setInt32(countPos, n, true);
}

// --- create / text ----------------------------------------------------------
// `styleBytes` is the precomputed styleEncSize(style) from the caller, so the
// style object is walked exactly twice total (size+validate, then write).
export function emitCreate(
  nodeId: number,
  typeId: number,
  style: StyleObj | null | undefined,
  styleBytes = styleEncSize(style),
): void {
  ensureSpace(12 + styleBytes);
  w32(CMD.CREATE);
  w32(nodeId);
  w32(typeId);
  writeStyleRun(style);
}

export const CREATE_PARAM_HAS_SIZE = 1 << 0;
export const CREATE_PARAM_HAS_COLOR = 1 << 1;
export const CREATE_PARAM_FILLED = 1 << 2;
export const CREATE_PARAM_HAS_FILLED = 1 << 3;

export function emitCreateParam(
  nodeId: number,
  typeId: number,
  stringId: number,
  style: StyleObj | null | undefined,
  options: { flags?: number; size?: number; color?: number; variantId?: number } = {},
  styleBytes = styleEncSize(style),
): void {
  ensureSpace(36 + styleBytes);
  w32(CMD.CREATE_PARAM);
  w32(nodeId);
  w32(typeId);
  w32(stringId);
  w32(options.flags ?? 0);
  wF64(options.size ?? 0);
  wU32(options.color ?? 0);
  w32(options.variantId ?? 0);
  writeStyleRun(style);
}

export function emitSetStyle(nodeId: number, style: StyleObj | null | undefined): void {
  ensureSpace(8 + styleEncSize(style));
  w32(CMD.SET_STYLE);
  w32(nodeId);
  writeStyleRun(style);
}

function utf8ByteLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

function writeUtf8(s: string): void {
  const v = view!;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      v.setUint8(cursor++, c);
    } else if (c < 0x800) {
      v.setUint8(cursor++, 0xc0 | (c >> 6));
      v.setUint8(cursor++, 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      v.setUint8(cursor++, 0xe0 | (c >> 12));
      v.setUint8(cursor++, 0x80 | ((c >> 6) & 0x3f));
      v.setUint8(cursor++, 0x80 | (c & 0x3f));
    } else {
      v.setUint8(cursor++, 0xf0 | (c >> 18));
      v.setUint8(cursor++, 0x80 | ((c >> 12) & 0x3f));
      v.setUint8(cursor++, 0x80 | ((c >> 6) & 0x3f));
      v.setUint8(cursor++, 0x80 | (c & 0x3f));
    }
  }
}

/** Intern a string, emitting NEW_STRING on first sight. Returns its int id. */
export function internString(s: string): number {
  const existing = stringIds.get(s);
  if (existing !== undefined) return existing;
  const id = nextStringId++;
  stringIds.set(s, id);
  const len = utf8ByteLen(s);
  const padded = (len + 3) & ~3;
  ensureSpace(12 + padded);
  w32(CMD.NEW_STRING);
  w32(id);
  w32(len);
  writeUtf8(s);
  cursor = (cursor + 3) & ~3; // pad to 4-byte boundary
  return id;
}

export function emitSetText(nodeId: number, stringId: number): void {
  ensureSpace(12);
  w32(CMD.SET_TEXT);
  w32(nodeId);
  w32(stringId);
}

// --- flush ------------------------------------------------------------------
export function flushCommands(): void {
  if (!view || cursor === 0) return;
  const g = globalThis as BinaryGlobals;
  const len = cursor;
  cursor = 0;
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  g.__rayactFlushCommands!(len);
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  perfLogBatch(end - start, len >> 2);
}
