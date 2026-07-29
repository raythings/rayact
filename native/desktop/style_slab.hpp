// StyleSlab — POD hot-path style memory shared between QuickJS and native.
//
// A fixed arena of StyleSlabEntry records, exposed to JS as the external
// ArrayBuffer global __rayactStyleSlab (paired Float32Array/Uint32Array views).
// JS writes hot style values (transform/opacity/colors/box/flex/margins/
// paddings/gaps) straight into the entry — a typed-array element store is the
// zero-copy path: no boxing, no property lookup, no protocol bytes — then emits
// a 3-word RCMD_DIRTY_SLAB(nodeId, slot) into the command stream so the write
// applies at the correct position relative to structural ops in the same
// commit.
//
// Layout contract (MUST stay in sync with packages/rayact-renderer/src/
// styleSlab.ts):
//   word  0: generation  — seqlock; JS writes odd, stores fields, writes even
//   word  1: dirty       — bit0 set by JS after a write burst, cleared by native
//   word  2: presentLo   — "field is set" bits for fields 4..35 (bit = idx-4)
//   word  3: presentHi   — bit 0 = field 36 (columnGap); bits 1+ reserved
//   words 4..36: hot fields (see kSlabField* below); f32 unless noted u32
//   words 37..38: reserved (packed enums, future)
//   word 39: nodeId      — owner node id (JS-even id space)
//   words 40..47: reserved
//
// Threading: JS is the only writer, native the only consumer; today both run
// under the engine mutex so the seqlock is belt-and-braces for the future
// threaded mode. All fields are 4-byte aligned → naturally atomic stores on
// arm64/x86-64. Cross-node consistency within a frame is NOT guaranteed (same
// model as the animated style buffer).
//
// Precedence: the retained raym3 Style stays the source of truth. A dirty slab
// entry is applied INTO node->style on decode (per-field optional assignment,
// merge semantics identical to RCMD_SET_STYLE). When JS routes a hot key
// through RCMD_SET_STYLE instead (mixed hot/cold delta), it clears that key's
// present bit first so a later slab re-apply cannot resurrect a stale value.
#pragma once

#include <cstdint>

namespace rayact {

inline constexpr uint32_t kStyleSlabWords = 48;   // 192 bytes = 3 cache lines
inline constexpr uint32_t kStyleSlabSlots = 16384; // 3 MiB arena, fixed

// Header words
inline constexpr uint32_t kSlabGeneration = 0;
inline constexpr uint32_t kSlabDirty      = 1;
inline constexpr uint32_t kSlabPresentLo  = 2;
inline constexpr uint32_t kSlabPresentHi  = 3;
inline constexpr uint32_t kSlabNodeId     = 39;

// Hot fields (word index). Present bit = index - 4 (lo covers 4..35, hi bit 0
// covers 36).
inline constexpr uint32_t kSlabTranslateX   = 4;
inline constexpr uint32_t kSlabTranslateY   = 5;
inline constexpr uint32_t kSlabScale        = 6;
inline constexpr uint32_t kSlabRotation     = 7;
inline constexpr uint32_t kSlabOpacity      = 8;
inline constexpr uint32_t kSlabBorderRadius = 9;
inline constexpr uint32_t kSlabBorderWidth  = 10;
inline constexpr uint32_t kSlabBackgroundColor = 11; // u32 packed RGBA
inline constexpr uint32_t kSlabBorderColor     = 12; // u32
inline constexpr uint32_t kSlabTextColor       = 13; // u32
inline constexpr uint32_t kSlabWidth      = 14;
inline constexpr uint32_t kSlabHeight     = 15;
inline constexpr uint32_t kSlabMinWidth   = 16;
inline constexpr uint32_t kSlabMinHeight  = 17;
inline constexpr uint32_t kSlabMaxWidth   = 18;
inline constexpr uint32_t kSlabMaxHeight  = 19;
inline constexpr uint32_t kSlabFlexGrow   = 20;
inline constexpr uint32_t kSlabFlexShrink = 21;
inline constexpr uint32_t kSlabFlexBasis  = 22;
inline constexpr uint32_t kSlabTop    = 23;
inline constexpr uint32_t kSlabRight  = 24;
inline constexpr uint32_t kSlabBottom = 25;
inline constexpr uint32_t kSlabLeft   = 26;
inline constexpr uint32_t kSlabMarginTop     = 27;
inline constexpr uint32_t kSlabMarginRight   = 28;
inline constexpr uint32_t kSlabMarginBottom  = 29;
inline constexpr uint32_t kSlabMarginLeft    = 30;
inline constexpr uint32_t kSlabPaddingTop    = 31;
inline constexpr uint32_t kSlabPaddingRight  = 32;
inline constexpr uint32_t kSlabPaddingBottom = 33;
inline constexpr uint32_t kSlabPaddingLeft   = 34;
inline constexpr uint32_t kSlabRowGap    = 35;
inline constexpr uint32_t kSlabColumnGap = 36;
inline constexpr uint32_t kSlabFirstField = kSlabTranslateX;
inline constexpr uint32_t kSlabLastField  = kSlabColumnGap;

}  // namespace rayact
