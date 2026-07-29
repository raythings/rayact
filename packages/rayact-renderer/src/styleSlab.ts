// StyleSlab writer — the zero-copy style path.
//
// Native exposes a fixed arena of 48-word entries as the external ArrayBuffer
// global __rayactStyleSlab (native/desktop/style_slab.hpp is the layout
// contract — keep FIELD indices in sync). Hot style keys are written straight
// into the entry through typed-array element stores (no boxing, no property
// lookup, no protocol bytes), then the reconciler emits a 3-word
// CMD.DIRTY_SLAB(nodeId, slot) so the entry applies at the correct position in
// the commit's command stream.
//
// Slot ownership lives entirely on the JS side (single writer): slots are
// claimed lazily on a node's first all-hot style *update* — not on create, so
// static nodes never consume slots — and recycled on dispose. Native validates
// entry.nodeId against the op's nodeId, so a stale ref to a recycled slot is
// dropped rather than misapplied.

type SlabGlobals = typeof globalThis & {
  __RAYACT_USE_STYLE_SLAB?: boolean;
  __rayactStyleSlab?: ArrayBuffer;
};

const WORDS = 48; // per-entry u32 words; MUST match kStyleSlabWords
const GEN = 0;
const DIRTY = 1;
const PRESENT_LO = 2;
const PRESENT_HI = 3;
const NODE_ID = 39;
const FIRST_FIELD = 4;

// key → [wordIndex, isColor]. MUST match kSlab* in style_slab.hpp.
const FIELD: Record<string, [number, boolean]> = {
  translateX: [4, false], translateY: [5, false], scale: [6, false],
  rotation: [7, false], opacity: [8, false],
  borderRadius: [9, false], borderWidth: [10, false],
  backgroundColor: [11, true], borderColor: [12, true], color: [13, true],
  width: [14, false], height: [15, false],
  minWidth: [16, false], minHeight: [17, false],
  maxWidth: [18, false], maxHeight: [19, false],
  flexGrow: [20, false], flexShrink: [21, false], flexBasis: [22, false],
  top: [23, false], right: [24, false], bottom: [25, false], left: [26, false],
  marginTop: [27, false], marginRight: [28, false],
  marginBottom: [29, false], marginLeft: [30, false],
  paddingTop: [31, false], paddingRight: [32, false],
  paddingBottom: [33, false], paddingLeft: [34, false],
  rowGap: [35, false], columnGap: [36, false],
};

let f32: Float32Array | null = null;
let u32: Uint32Array | null = null;
let slotCount = 0;

function init(): boolean {
  if (u32) return true;
  const g = globalThis as SlabGlobals;
  const buf = g.__rayactStyleSlab;
  if (!buf) return false;
  f32 = new Float32Array(buf);
  u32 = new Uint32Array(buf);
  slotCount = (buf.byteLength / 4 / WORDS) | 0;
  return true;
}

export function slabEnabled(): boolean {
  return (globalThis as SlabGlobals).__RAYACT_USE_STYLE_SLAB === true && init();
}

// --- slot allocation --------------------------------------------------------
const slotByNode = new Map<number, number>();
const freeSlots: number[] = [];
let nextSlot = 0;
let exhausted = false;

/** Claim (or return the existing) slot for a node. -1 when the arena is full. */
export function claimSlot(nodeId: number): number {
  const existing = slotByNode.get(nodeId);
  if (existing !== undefined) return existing;
  let slot: number;
  if (freeSlots.length > 0) {
    slot = freeSlots.pop()!;
  } else if (nextSlot < slotCount) {
    slot = nextSlot++;
  } else {
    exhausted = true;
    return -1;
  }
  slotByNode.set(nodeId, slot);
  const base = slot * WORDS;
  // Fresh claim: reset presence so a recycled slot can't leak old fields.
  u32![base + PRESENT_LO] = 0;
  u32![base + PRESENT_HI] = 0;
  u32![base + DIRTY] = 0;
  u32![base + NODE_ID] = nodeId;
  return slot;
}

export function slotForNode(nodeId: number): number {
  const slot = slotByNode.get(nodeId);
  return slot === undefined ? -1 : slot;
}

export function releaseSlot(nodeId: number): void {
  const slot = slotByNode.get(nodeId);
  if (slot === undefined) return;
  slotByNode.delete(nodeId);
  freeSlots.push(slot);
}

export function slabExhausted(): boolean {
  return exhausted;
}

// --- style classification ---------------------------------------------------
/**
 * True if every set key of `style` has a slab field (numeric values only —
 * colors must already be packed uint32, same constraint as the binary codec).
 * Nested `text` objects and enum/string keys are cold → route via opcode 12.
 */
export function styleAllHot(style: unknown): boolean {
  if (style == null || typeof style !== 'object' || Array.isArray(style)) return false;
  let any = false;
  for (const k in style as Record<string, unknown>) {
    const v = (style as Record<string, unknown>)[k];
    if (v == null) continue;
    if (FIELD[k] === undefined || typeof v !== 'number') return false;
    any = true;
  }
  return any;
}

// --- writes -----------------------------------------------------------------
/**
 * Write every set key of `style` into the slot. Caller guarantees styleAllHot.
 * Seqlock: generation goes odd for the write burst, even after — all stores
 * are 4-byte aligned and naturally atomic.
 */
export function writeSlabStyle(slot: number, style: Record<string, unknown>): void {
  const base = slot * WORDS;
  const U = u32!;
  const F = f32!;
  const g = U[base + GEN];
  U[base + GEN] = g + 1;
  let lo = U[base + PRESENT_LO];
  let hi = U[base + PRESENT_HI];
  for (const k in style) {
    const v = style[k];
    if (v == null) continue;
    const field = FIELD[k];
    const idx = field[0];
    if (field[1]) U[base + idx] = v as number;
    else F[base + idx] = v as number;
    const bit = idx - FIRST_FIELD;
    if (bit < 32) lo |= 1 << bit;
    else hi |= 1 << (bit - 32);
  }
  U[base + PRESENT_LO] = lo;
  U[base + PRESENT_HI] = hi;
  U[base + DIRTY] = 1;
  U[base + GEN] = g + 2;
}

/**
 * Clear the present bits of `style`'s hot keys on the node's slot (no-op if
 * the node has no slot). Called before routing those keys through opcode 12 so
 * a later slab apply can't resurrect a stale value over the stream's.
 */
export function clearSlabPresent(nodeId: number, style: unknown): void {
  const slot = slotByNode.get(nodeId);
  if (slot === undefined) return;
  if (style == null || typeof style !== 'object' || Array.isArray(style)) return;
  const base = slot * WORDS;
  const U = u32!;
  let lo = U[base + PRESENT_LO];
  let hi = U[base + PRESENT_HI];
  const clearKey = (k: string) => {
    const field = FIELD[k];
    if (field === undefined) return;
    const bit = field[0] - FIRST_FIELD;
    if (bit < 32) lo &= ~(1 << bit);
    else hi &= ~(1 << (bit - 32));
  };
  for (const k in style as Record<string, unknown>) {
    const v = (style as Record<string, unknown>)[k];
    // SK 52 `color` targets text color both as a top-level key and nested
    // under `text` — clear the slab's color bit for either spelling.
    if (k === 'text' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const tk in v as Record<string, unknown>) clearKey(tk);
      continue;
    }
    clearKey(k);
  }
  U[base + PRESENT_LO] = lo;
  U[base + PRESENT_HI] = hi;
}
