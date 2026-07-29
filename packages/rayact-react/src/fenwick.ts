// Fenwick (binary indexed) tree over row heights.
//
// A virtual list needs three things from its height table: the offset of row i
// (prefix sum), the row containing pixel y (search), and "row i just measured
// 8px taller" (point update). A plain prefix-sum array gives O(1) reads but
// O(n) rebuild per measurement — which is what made the previous FlatList
// re-derive 10k offsets every time one row reported its height. Fenwick makes
// all three O(log n), so measurement corrections stream in without a rebuild.
export class Fenwick {
  private tree: Float64Array;
  size: number;

  constructor(size: number, initial = 0) {
    this.size = size;
    this.tree = new Float64Array(size + 1);
    if (initial !== 0 && size > 0) this.fill(initial);
  }

  /** Set every element to `value` in O(n). */
  fill(value: number): void {
    const t = this.tree;
    t.fill(0);
    for (let i = 1; i <= this.size; i++) {
      t[i] += value;
      const parent = i + (i & -i);
      if (parent <= this.size) t[parent] += t[i];
    }
  }

  /** Bulk build from a value function, O(n). */
  build(valueAt: (index: number) => number): void {
    const t = this.tree;
    t.fill(0);
    for (let i = 1; i <= this.size; i++) {
      t[i] += valueAt(i - 1);
      const parent = i + (i & -i);
      if (parent <= this.size) t[parent] += t[i];
    }
  }

  /** Add `delta` to element `index`. */
  add(index: number, delta: number): void {
    if (delta === 0) return;
    for (let i = index + 1; i <= this.size; i += i & -i) this.tree[i] += delta;
  }

  /** Sum of elements [0, index) — i.e. the offset of row `index`. */
  prefix(index: number): number {
    let sum = 0;
    for (let i = Math.min(index, this.size); i > 0; i -= i & -i) sum += this.tree[i];
    return sum;
  }

  /** Value of a single element. */
  at(index: number): number {
    return this.prefix(index + 1) - this.prefix(index);
  }

  /**
   * Largest index whose offset is <= target (clamped to [0, size-1]).
   * Standard BIT descent — O(log n), no allocation.
   */
  lowerBound(target: number): number {
    if (this.size === 0) return 0;
    if (target <= 0) return 0;
    let pos = 0;
    let remaining = target;
    let step = 1 << (31 - Math.clz32(this.size));
    for (; step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= this.size && this.tree[next] <= remaining) {
        pos = next;
        remaining -= this.tree[next];
      }
    }
    // `pos` counts elements fully consumed; the row containing `target` is that
    // one (offset <= target < offset + height).
    return Math.min(pos, this.size - 1);
  }
}
