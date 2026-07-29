import test from 'node:test';
import assert from 'node:assert/strict';
import { Fenwick } from '../../packages/rayact-react/dist/fenwick.js';

// Reference implementation the virtual list would otherwise have to rebuild in
// full on every measurement — the tree must agree with it exactly.
function naive(heights) {
  const offsets = [0];
  for (const h of heights) offsets.push(offsets[offsets.length - 1] + h);
  return {
    prefix: i => offsets[Math.min(i, heights.length)],
    total: offsets[heights.length],
    lowerBound: target => {
      if (heights.length === 0) return 0;
      if (target <= 0) return 0;
      let i = 0;
      while (i < heights.length - 1 && offsets[i + 1] <= target) i++;
      return i;
    },
  };
}

test('prefix sums match a naive prefix array after build', () => {
  const heights = [10, 20, 5, 40, 1, 60];
  const tree = new Fenwick(heights.length);
  tree.build(i => heights[i]);
  const ref = naive(heights);
  for (let i = 0; i <= heights.length; i++) {
    assert.equal(tree.prefix(i), ref.prefix(i), `prefix(${i})`);
  }
  assert.equal(tree.prefix(heights.length), ref.total);
});

test('point updates keep prefix sums correct', () => {
  const heights = [56, 56, 56, 56, 56];
  const tree = new Fenwick(heights.length, 0);
  tree.build(() => 56);
  // Simulate measurement corrections streaming in out of order.
  const corrections = [[3, 120], [0, 12], [4, 80], [1, 56]];
  for (const [index, height] of corrections) {
    tree.add(index, height - heights[index]);
    heights[index] = height;
  }
  const ref = naive(heights);
  for (let i = 0; i <= heights.length; i++) assert.equal(tree.prefix(i), ref.prefix(i));
  for (let i = 0; i < heights.length; i++) assert.equal(tree.at(i), heights[i]);
});

test('lowerBound finds the row containing an offset', () => {
  const heights = [30, 30, 30, 30];
  const tree = new Fenwick(heights.length);
  tree.build(i => heights[i]);
  assert.equal(tree.lowerBound(-5), 0);
  assert.equal(tree.lowerBound(0), 0);
  assert.equal(tree.lowerBound(29), 0);
  assert.equal(tree.lowerBound(30), 1);
  assert.equal(tree.lowerBound(89), 2);
  assert.equal(tree.lowerBound(90), 3);
  // Past the end clamps to the last row rather than running off the array.
  assert.equal(tree.lowerBound(100000), 3);
});

test('randomized: prefix and lowerBound agree with naive across updates', () => {
  // Deterministic PRNG so a failure is reproducible.
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const n = 400;
  const heights = Array.from({ length: n }, () => 1 + Math.floor(rand() * 200));
  const tree = new Fenwick(n);
  tree.build(i => heights[i]);

  for (let round = 0; round < 200; round++) {
    const index = Math.floor(rand() * n);
    const height = 1 + Math.floor(rand() * 200);
    tree.add(index, height - heights[index]);
    heights[index] = height;

    const ref = naive(heights);
    const probeIndex = Math.floor(rand() * (n + 1));
    assert.equal(tree.prefix(probeIndex), ref.prefix(probeIndex), `round ${round} prefix`);
    const target = Math.floor(rand() * (ref.total + 50));
    assert.equal(tree.lowerBound(target), ref.lowerBound(target), `round ${round} lowerBound ${target}`);
  }
});

test('empty and single-element trees behave', () => {
  const empty = new Fenwick(0);
  assert.equal(empty.prefix(0), 0);
  assert.equal(empty.lowerBound(50), 0);

  const one = new Fenwick(1);
  one.build(() => 42);
  assert.equal(one.prefix(1), 42);
  assert.equal(one.lowerBound(0), 0);
  assert.equal(one.lowerBound(41), 0);
  assert.equal(one.lowerBound(9999), 0);
});

test('fill sets every element uniformly', () => {
  const tree = new Fenwick(7);
  tree.fill(10);
  assert.equal(tree.prefix(7), 70);
  assert.equal(tree.at(3), 10);
  assert.equal(tree.lowerBound(35), 3);
});
