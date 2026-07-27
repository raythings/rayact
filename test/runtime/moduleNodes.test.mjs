import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, registerModuleNodeHandlers } from '../../packages/rayact-runtime/dist/index.js';

// Native modules contribute element types at import time (ABI 2 node kinds). These
// cover the bridge half: create/update must route to the module's handlers instead
// of throwing. The reconciler half (registerHostNodeType admitting the element type)
// is not reachable from here — importing @rayact/renderer pulls in react-reconciler,
// which does not resolve under bare node ESM — so it is covered by rendering a real
// module component on device.

test('module node handlers receive create and update through the bridge', () => {
  const calls = [];
  registerModuleNodeHandlers('fakeSvg', {
    create(native, props, style) {
      calls.push(['create', props.source, style.width]);
      return native.createModuleNode('fakeSvg', style, JSON.stringify({ source: props.source }));
    },
    update(native, nodeId, props) {
      calls.push(['update', nodeId, props.source]);
      native.setModuleNodeProps(nodeId, JSON.stringify({ source: props.source }));
    },
  });

  const native = [];
  const bridge = createBridge({
    createModuleNode: (kind, style, propsJson) => {
      native.push(['createModuleNode', kind, propsJson]);
      return 77;
    },
    setModuleNodeProps: (nodeId, propsJson) => {
      native.push(['setModuleNodeProps', nodeId, propsJson]);
    },
    setStyle: () => {},
  });

  const node = bridge.createNode('fakeSvg', { source: '<svg/>', style: { width: 24 } });
  assert.equal(node.id, 77);
  assert.equal(node.type, 'fakeSvg');
  assert.deepEqual(calls[0], ['create', '<svg/>', 24]);
  assert.deepEqual(native[0], ['createModuleNode', 'fakeSvg', JSON.stringify({ source: '<svg/>' })]);

  bridge.updateNode(node, { source: '<svg id="b"/>' });
  assert.deepEqual(calls[1], ['update', 77, '<svg id="b"/>']);
  assert.deepEqual(native[1], ['setModuleNodeProps', 77, JSON.stringify({ source: '<svg id="b"/>' })]);
});

test('an unregistered element type is still rejected, with a hint about modules', () => {
  const bridge = createBridge({ createView: () => 1, setStyle: () => {} });
  assert.throws(() => bridge.createNode('neverRegistered', {}),
    /Unsupported Rayact host node type: neverRegistered/);
});
