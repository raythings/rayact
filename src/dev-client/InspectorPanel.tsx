import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from '../react/index.js';
import { useDevLauncher } from './DevLauncherContext.js';

interface TreeNode {
  id: number;
  type: string;
  name?: string;
  text?: string;
  layout?: { x: number; y: number; width: number; height: number };
  children?: TreeNode[];
}

declare const getNodeTree: (() => string) | undefined;
declare const setInspectorHighlight: ((id: number) => void) | undefined;

function parseTree(raw: string): TreeNode[] {
  try {
    return JSON.parse(raw) as TreeNode[];
  } catch {
    return [];
  }
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const label = node.name || node.text || node.type;
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <View style={{ gap: 2 }}>
      <View
        style={{ paddingLeft: depth * 12, paddingVertical: 4 }}
        onPress={() => {
          if (hasChildren) setOpen(v => !v);
          if (typeof setInspectorHighlight === 'function') setInspectorHighlight(node.id);
        }}
      >
        <Text style={{ text: { color: 0xFFE0E0E0FF, fontSize: 12 } }}>
          {`${hasChildren ? (open ? '▼ ' : '▶ ') : '  '}${node.type} #${node.id} ${label}`}
        </Text>
      </View>
      {open && node.children?.map(child => (
        <TreeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </View>
  );
}

export function InspectorPanel() {
  const launcher = useDevLauncher();
  const [tree, setTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    if (!launcher.inspectorOpen) return;
    const tick = () => {
      if (typeof getNodeTree === 'function') {
        setTree(parseTree(getNodeTree()));
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [launcher.inspectorOpen]);

  if (!launcher.inspectorOpen) return null;

  return (
    <View style={{
      position: 'absolute',
      top: 24,
      left: 24,
      bottom: 120,
      width: 280,
      backgroundColor: 0xEE1A1A1AFF,
      padding: 12,
      gap: 8
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 14 } }}>Element Inspector</Text>
      <ScrollView style={{ flexGrow: 1 }}>
        {tree.length === 0 ? (
          <Text style={{ text: { color: 0xFF888888FF, fontSize: 12 } }}>No nodes</Text>
        ) : tree.map(node => (
          <TreeRow key={node.id} node={node} depth={0} />
        ))}
      </ScrollView>
      <Text
        style={{ text: { color: 0xFF80CBC4FF, fontSize: 12 } }}
        onPress={() => launcher.setInspectorOpen(false)}
      >
        Close
      </Text>
    </View>
  );
}
