// Worker drawing + node APIs — usable from rayact JS workers (spawnWorker).
//
// Two lanes, matching what the main thread can do:
//
// 1. `WorkerCanvas` — immediate-mode raylib drawing. Records a binary
//    draw-command stream and hands it to the engine via the worker-global
//    `presentDrawCommands`. The render thread replays the last presented
//    frame every engine frame inside the worker's view node
//    (createWorkerView on the main thread), clipped to its layout rect.
//    Format mirrors native/desktop/worker_draw.hpp — keep in sync.
//
// 2. `WorkerNodeTree` — retained raym3 components. Records the same binary
//    mutation protocol the main-thread reconciler uses (src/react/protocol.ts)
//    and flushes via the worker-global `flushNodeCommands`. The tree attaches
//    under the worker's view node and participates in normal Yoga layout.
//
// Coordinates are dp, local to the worker view. Colors are 0xRRGGBBAA.

import { CMD, TYPE, SK, F64_KEYS, COLOR_KEYS, ENUM_VALUES } from '@rayact/renderer/protocol';

declare const presentDrawCommands: ((buf: Uint8Array) => void) | undefined;
declare const flushNodeCommands: ((buf: Uint8Array) => void) | undefined;

// Draw opcodes — mirror RayactDrawOp in native/desktop/worker_draw.hpp.
export const DRAW = {
  CLEAR: 1,
  RECT: 2,
  RECT_LINES: 3,
  ROUND_RECT: 4,
  ROUND_RECT_LINES: 5,
  LINE: 6,
  CIRCLE: 7,
  CIRCLE_LINES: 8,
  TRIANGLE: 9,
  TEXT: 10,
  SCISSOR: 11,
  SCISSOR_END: 12,
  PUSH_MATRIX: 13,
  POP_MATRIX: 14,
  TRANSLATE: 15,
  SCALE: 16,
  ROTATE: 17,
  IMAGE: 18,
} as const;

// Minimal UTF-8 encoder — TextEncoder is not guaranteed in the QuickJS worker.
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i)!;
    if (cp > 0xffff) i++;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

// Growable little-endian word writer shared by both recorders.
class ByteWriter {
  buf: ArrayBuffer;
  view: DataView;
  len = 0;

  constructor(initial = 64 * 1024) {
    this.buf = new ArrayBuffer(initial);
    this.view = new DataView(this.buf);
  }

  ensure(n: number): void {
    if (this.len + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new ArrayBuffer(cap);
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.len));
    this.buf = next;
    this.view = new DataView(next);
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.len, v >>> 0, true);
    this.len += 4;
  }
  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.len, v | 0, true);
    this.len += 4;
  }
  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.len, v, true);
    this.len += 4;
  }
  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.len, v, true);
    this.len += 8;
  }
  str(s: string): void {
    const bytes = utf8Bytes(s);
    const padded = (bytes.length + 3) & ~3;
    this.u32(bytes.length);
    this.ensure(padded);
    const dst = new Uint8Array(this.buf, this.len, padded);
    for (let i = 0; i < bytes.length; i++) dst[i] = bytes[i];
    for (let i = bytes.length; i < padded; i++) dst[i] = 0;
    this.len += padded;
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.buf, 0, this.len);
  }
  reset(): void {
    this.len = 0;
  }
}

export interface WorkerTextOptions {
  fontSize?: number;
  spacing?: number;
  color?: number;
  fontFamily?: string;
}

/**
 * Immediate-mode drawing surface. Record a frame, then `present()`. The frame
 * is retained: it keeps rendering until the next present, so only redraw when
 * content changes.
 */
export class WorkerCanvas {
  private w = new ByteWriter();

  clear(color: number): this {
    this.w.u32(DRAW.CLEAR); this.w.u32(color); return this;
  }
  drawRect(x: number, y: number, width: number, height: number, color: number): this {
    this.w.u32(DRAW.RECT);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    this.w.u32(color);
    return this;
  }
  drawRectLines(x: number, y: number, width: number, height: number, thickness: number, color: number): this {
    this.w.u32(DRAW.RECT_LINES);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    this.w.f32(thickness); this.w.u32(color);
    return this;
  }
  drawRoundedRect(x: number, y: number, width: number, height: number, radius: number, color: number): this {
    this.w.u32(DRAW.ROUND_RECT);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    this.w.f32(radius); this.w.u32(color);
    return this;
  }
  drawRoundedRectLines(x: number, y: number, width: number, height: number, radius: number, thickness: number, color: number): this {
    this.w.u32(DRAW.ROUND_RECT_LINES);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    this.w.f32(radius); this.w.f32(thickness); this.w.u32(color);
    return this;
  }
  drawLine(x1: number, y1: number, x2: number, y2: number, thickness: number, color: number): this {
    this.w.u32(DRAW.LINE);
    this.w.f32(x1); this.w.f32(y1); this.w.f32(x2); this.w.f32(y2);
    this.w.f32(thickness); this.w.u32(color);
    return this;
  }
  drawCircle(centerX: number, centerY: number, radius: number, color: number): this {
    this.w.u32(DRAW.CIRCLE);
    this.w.f32(centerX); this.w.f32(centerY); this.w.f32(radius); this.w.u32(color);
    return this;
  }
  drawCircleLines(centerX: number, centerY: number, radius: number, color: number): this {
    this.w.u32(DRAW.CIRCLE_LINES);
    this.w.f32(centerX); this.w.f32(centerY); this.w.f32(radius); this.w.u32(color);
    return this;
  }
  drawTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number): this {
    this.w.u32(DRAW.TRIANGLE);
    this.w.f32(x1); this.w.f32(y1); this.w.f32(x2); this.w.f32(y2);
    this.w.f32(x3); this.w.f32(y3); this.w.u32(color);
    return this;
  }
  drawText(text: string, x: number, y: number, options: WorkerTextOptions = {}): this {
    this.w.u32(DRAW.TEXT);
    this.w.f32(x); this.w.f32(y);
    this.w.f32(options.fontSize ?? 14);
    this.w.f32(options.spacing ?? 0);
    this.w.u32(options.color ?? 0xffffffff);
    this.w.str(options.fontFamily ?? '');
    this.w.str(text);
    return this;
  }
  drawImage(path: string, x: number, y: number, width: number, height: number, tint = 0xffffffff): this {
    this.w.u32(DRAW.IMAGE);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    this.w.u32(tint);
    this.w.str(path);
    return this;
  }
  scissor(x: number, y: number, width: number, height: number): this {
    this.w.u32(DRAW.SCISSOR);
    this.w.f32(x); this.w.f32(y); this.w.f32(width); this.w.f32(height);
    return this;
  }
  endScissor(): this { this.w.u32(DRAW.SCISSOR_END); return this; }
  pushMatrix(): this { this.w.u32(DRAW.PUSH_MATRIX); return this; }
  popMatrix(): this { this.w.u32(DRAW.POP_MATRIX); return this; }
  translate(x: number, y: number): this {
    this.w.u32(DRAW.TRANSLATE); this.w.f32(x); this.w.f32(y); return this;
  }
  scale(sx: number, sy: number): this {
    this.w.u32(DRAW.SCALE); this.w.f32(sx); this.w.f32(sy); return this;
  }
  rotate(degrees: number): this {
    this.w.u32(DRAW.ROTATE); this.w.f32(degrees); return this;
  }

  /** Publish the recorded frame and start a new one. */
  present(): void {
    if (typeof presentDrawCommands !== 'function') {
      throw new Error('WorkerCanvas.present: presentDrawCommands missing — not in a rayact worker?');
    }
    presentDrawCommands(this.w.bytes());
    this.w.reset();
  }
}

// ── Node lane ─────────────────────────────────────────────────────────────────

type StyleObj = Record<string, unknown>;

function writeStyleRun(w: ByteWriter, style: StyleObj | undefined): void {
  const countPos = w.len;
  w.u32(0);
  let n = 0;
  const writeEntry = (k: string, v: unknown) => {
    if (v == null) return;
    const id = (SK as Record<string, number>)[k];
    if (id === undefined) return;
    if (F64_KEYS.has(k)) { w.i32(id); w.f64(v as number); }
    else if (COLOR_KEYS.has(k)) { w.i32(id); w.u32(v as number); }
    else if (ENUM_VALUES[k] && typeof v === 'string' && ENUM_VALUES[k][v] !== undefined) {
      w.i32(id); w.i32(ENUM_VALUES[k][v]);
    } else return;
    n++;
  };
  if (style) {
    for (const k in style) {
      const v = style[k];
      if (k === 'text' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const tk in v as StyleObj) writeEntry(tk, (v as StyleObj)[tk]);
        continue;
      }
      writeEntry(k, v);
    }
  }
  w.view.setInt32(countPos, n, true);
}

/**
 * Retained raym3 component tree recorded from a worker. Ids are worker-local —
 * the engine remaps them; the tree set via `setRoot` mounts under the worker's
 * view node (createWorkerView) and lays out with Yoga like any other subtree.
 */
export class WorkerNodeTree {
  static readonly TYPE = TYPE;
  private w = new ByteWriter();
  private nextId = 1;
  private nextStringId = 1;

  allocId(): number { return this.nextId++; }

  createView(style?: StyleObj): number {
    const id = this.allocId();
    this.w.u32(CMD.CREATE); this.w.i32(id); this.w.i32(TYPE.VIEW);
    writeStyleRun(this.w, style);
    return id;
  }
  createText(text: string, style?: StyleObj): number {
    const id = this.allocId();
    this.w.u32(CMD.CREATE); this.w.i32(id); this.w.i32(TYPE.TEXT);
    writeStyleRun(this.w, style);
    this.setText(id, text);
    return id;
  }
  create(typeId: number, style?: StyleObj): number {
    const id = this.allocId();
    this.w.u32(CMD.CREATE); this.w.i32(id); this.w.i32(typeId);
    writeStyleRun(this.w, style);
    return id;
  }
  setStyle(nodeId: number, style: StyleObj): void {
    this.w.u32(CMD.SET_STYLE); this.w.i32(nodeId);
    writeStyleRun(this.w, style);
  }
  setText(nodeId: number, text: string): void {
    const sid = this.nextStringId++;
    this.w.u32(CMD.NEW_STRING); this.w.i32(sid);
    this.w.str(text);
    this.w.u32(CMD.SET_TEXT); this.w.i32(nodeId); this.w.i32(sid);
  }
  appendChild(parentId: number, childId: number): void {
    this.w.u32(CMD.APPEND); this.w.i32(parentId); this.w.i32(childId);
  }
  insertBefore(parentId: number, childId: number, beforeChildId: number): void {
    this.w.u32(CMD.INSERT); this.w.i32(parentId); this.w.i32(childId); this.w.i32(beforeChildId);
  }
  removeChild(parentId: number, childId: number): void {
    this.w.u32(CMD.REMOVE); this.w.i32(parentId); this.w.i32(childId);
  }
  dispose(nodeId: number): void {
    this.w.u32(CMD.DISPOSE); this.w.i32(nodeId);
  }
  setRoot(nodeId: number): void {
    this.w.u32(CMD.SET_ROOT); this.w.i32(nodeId);
  }

  /** Apply everything recorded since the last flush. */
  flush(): void {
    if (this.w.len === 0) return;
    if (typeof flushNodeCommands !== 'function') {
      throw new Error('WorkerNodeTree.flush: flushNodeCommands missing — not in a rayact worker?');
    }
    flushNodeCommands(this.w.bytes());
    this.w.reset();
  }
}
