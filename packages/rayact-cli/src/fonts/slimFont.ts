/**
 * Strip OpenType tables the engine can never read.
 *
 * Text and icons are rasterized by raylib's `LoadFontEx`/`LoadFontFromMemory`,
 * which is stb_truetype. stb_truetype has no variable-font support: it renders
 * the `glyf` outlines as authored, i.e. the fvar default instance, and never
 * looks at `gvar`/`HVAR`/`avar`. Nothing in raym3 or the native host reads a
 * variation axis either. In the bundled Material Symbols fonts that unread
 * delta data is ~88% of the file (15.02 MB -> 1.76 MB after stripping), so it
 * is pure APK/IPA weight.
 *
 * `glyf`, `loca`, `cmap`, `hmtx` and `GSUB` are copied through byte-identical,
 * so rendering is unchanged — the deltas at the default instance are zero by
 * definition. `GSUB` in particular must survive: EmojiFont parses it for ZWJ
 * ligatures, and third-party icon fonts may resolve names through it.
 *
 * Dependency-free on purpose: this runs inside `rayact build` on whatever OS
 * the app author develops on, and it slims their own bundled fonts too.
 */

/** Tables that only exist to drive variation axes, plus the digital signature. */
const DROP_TABLES = new Set([
  'gvar', // glyph outline deltas — the big one
  'HVAR', // horizontal metrics variations
  'VVAR', // vertical metrics variations
  'MVAR', // font-wide metrics variations
  'cvar', // CVT variations (note: 'cvt ' hinting data is kept)
  'avar', // axis value mappings
  'fvar', // axis + named instance declarations
  'STAT', // style attributes, only meaningful alongside fvar
  'DSIG' // digital signature, invalidated by any rewrite anyway
]);

const HEAD_CHECKSUM_MAGIC = 0xb1b0afba;

export interface SlimFontResult {
  /** Slimmed font, or the input untouched when slimming was skipped. */
  out: Buffer;
  /** Tags actually removed. Empty when nothing was slimmed. */
  dropped: string[];
  /** Why the font was returned untouched. Only set when `dropped` is empty. */
  skipped?: string;
}

interface TableRecord {
  tag: string;
  offset: number;
  length: number;
}

/** OpenType checksum: sum of big-endian uint32s over the zero-padded table. */
function tableChecksum(buf: Buffer, offset: number, length: number): number {
  let sum = 0;
  const whole = offset + (length & ~3);
  for (let i = offset; i < whole; i += 4) {
    sum = (sum + buf.readUInt32BE(i)) >>> 0;
  }
  // Trailing 1-3 bytes are summed as if zero-padded to four.
  const rest = length & 3;
  if (rest) {
    let tail = 0;
    for (let i = 0; i < 4; i += 1) {
      tail = (tail << 8) | (i < rest ? buf[whole + i]! : 0);
    }
    sum = (sum + (tail >>> 0)) >>> 0;
  }
  return sum;
}

function readDirectory(buf: Buffer): TableRecord[] | null {
  if (buf.length < 12) return null;
  const numTables = buf.readUInt16BE(4);
  if (numTables === 0 || 12 + numTables * 16 > buf.length) return null;
  const records: TableRecord[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    const offset = buf.readUInt32BE(rec + 8);
    const length = buf.readUInt32BE(rec + 12);
    // A table that runs past EOF means we are misreading the file; bail rather
    // than emit something subtly broken.
    if (offset + length > buf.length) return null;
    records.push({ tag, offset, length });
  }
  return records;
}

export function slimFont(buf: Buffer): SlimFontResult {
  const untouched = (skipped: string): SlimFontResult => ({ out: buf, dropped: [], skipped });

  if (buf.length < 12) return untouched('not a font (too short)');

  const sfntVersion = buf.readUInt32BE(0);
  if (sfntVersion === 0x74746366) {
    // 'ttcf' — a collection shares tables between fonts; rewriting one
    // directory would desync the others.
    return untouched('TrueType Collection');
  }
  const known =
    sfntVersion === 0x00010000 || // TrueType outlines
    sfntVersion === 0x4f54544f || // 'OTTO', CFF outlines
    sfntVersion === 0x74727565 || // 'true'
    sfntVersion === 0x74797031; // 'typ1'
  if (!known) return untouched('unrecognized sfnt version');

  const records = readDirectory(buf);
  if (!records) return untouched('unreadable table directory');

  // CFF2 keeps its variation data inside the charstrings, so fvar is load-bearing
  // there in a way we cannot compensate for. Leave those fonts alone.
  if (records.some(rec => rec.tag === 'CFF2')) return untouched('CFF2 outlines');

  const keep = records.filter(rec => !DROP_TABLES.has(rec.tag));
  const dropped = records.filter(rec => DROP_TABLES.has(rec.tag)).map(rec => rec.tag);
  if (!dropped.length) return untouched('nothing to drop');

  // Directory entries must be sorted by tag; table data keeps its original
  // relative order so the layout stays close to what the source font had.
  const directory = [...keep].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const dataOrder = [...keep].sort((a, b) => a.offset - b.offset);

  const headerSize = 12 + directory.length * 16;
  let total = headerSize;
  const newOffsets = new Map<TableRecord, number>();
  for (const rec of dataOrder) {
    newOffsets.set(rec, total);
    total += (rec.length + 3) & ~3;
  }

  const out = Buffer.alloc(total);
  out.writeUInt32BE(sfntVersion, 0);
  out.writeUInt16BE(directory.length, 4);
  // searchRange/entrySelector/rangeShift describe the binary-search window over
  // the directory; they must match the new table count.
  const entrySelector = Math.floor(Math.log2(directory.length));
  const searchRange = 2 ** entrySelector * 16;
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(directory.length * 16 - searchRange, 10);

  for (const rec of dataOrder) {
    buf.copy(out, newOffsets.get(rec)!, rec.offset, rec.offset + rec.length);
  }

  let headOffset = -1;
  for (let i = 0; i < directory.length; i += 1) {
    const rec = directory[i]!;
    const at = 12 + i * 16;
    const offset = newOffsets.get(rec)!;
    out.write(rec.tag, at, 4, 'latin1');
    out.writeUInt32BE(offset, at + 8);
    out.writeUInt32BE(rec.length, at + 12);
    if (rec.tag === 'head') headOffset = offset;
  }

  // head.checkSumAdjustment is zeroed while checksums are computed, then set to
  // the magic-minus-file-checksum value (OpenType spec, head table).
  if (headOffset >= 0 && headOffset + 12 <= out.length) out.writeUInt32BE(0, headOffset + 8);
  for (let i = 0; i < directory.length; i += 1) {
    const rec = directory[i]!;
    const sum = tableChecksum(out, newOffsets.get(rec)!, rec.length);
    out.writeUInt32BE(sum, 12 + i * 16 + 4);
  }
  if (headOffset >= 0 && headOffset + 12 <= out.length) {
    const fileChecksum = tableChecksum(out, 0, out.length);
    out.writeUInt32BE((HEAD_CHECKSUM_MAGIC - fileChecksum) >>> 0, headOffset + 8);
  }

  return { out, dropped };
}

/** True for filenames slimFont knows how to handle. */
export function isSlimmableFont(name: string): boolean {
  return /\.(ttf|otf)$/i.test(name);
}
