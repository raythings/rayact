import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../../packages/rayact-runtime/dist/index.js';
import { setAccessibilityFocus } from '../../packages/rayact-react/dist/accessibility.js';

test('accessibility props serialize through create and update paths', () => {
  let created;
  let updated;
  const bridge = createBridge({
    createView: props => { created = props; return 41; },
    setStyle: (_id, props) => { updated = props; },
  });
  const node = bridge.createNode('view', {
    accessibilityRole: 'button',
    accessibilityLabel: 'Save',
    accessibilityHint: 'Stores changes',
    accessibilityState: { disabled: false },
    accessibilityValue: { text: 'Ready' },
    accessibilityActions: [{ name: 'activate', label: 'Save' }],
    focusable: true,
    tabIndex: 2,
    accessibilityLiveRegion: 'polite',
    allowFontScaling: true,
    maxFontSizeMultiplier: 2,
  });
  assert.equal(created.accessibilityRole, 'button');
  assert.equal(created.tabIndex, 2);
  assert.deepEqual(created.accessibilityActions, [{ name: 'activate', label: 'Save' }]);

  bridge.updateNode(node, { accessibilityLabel: 'Saved', accessibilityLiveRegion: 'assertive' });
  assert.equal(updated.accessibilityLabel, 'Saved');
  assert.equal(updated.accessibilityLiveRegion, 'assertive');
});

test('programmatic accessibility focus uses the host contract', () => {
  const previous = globalThis.__rayactSetAccessibilityFocus;
  let focused;
  globalThis.__rayactSetAccessibilityFocus = id => { focused = id; };
  try {
    setAccessibilityFocus({ node: { id: 73 } });
    assert.equal(focused, 73);
    assert.throws(() => setAccessibilityFocus(null), /mounted Rayact node/);
  } finally {
    globalThis.__rayactSetAccessibilityFocus = previous;
  }
});
