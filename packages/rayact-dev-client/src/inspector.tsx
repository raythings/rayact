import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Icon } from '@rayact/react';
import { useDevLauncher } from './DevLauncherContext.js';

export interface InspectorTreeNode {
  id: number;
  type: string;
  component?: string;
  name?: string;
  text?: string;
  layout?: { x: number; y: number; width: number; height: number };
  children?: InspectorTreeNode[];
}

declare const getNodeTree: (() => string) | undefined;
declare const setInspectorHighlight: ((id: number) => void) | undefined;
declare const getInspectorPickedNode: (() => number) | undefined;

export function clearInspectorHighlight(): void {
  if (typeof setInspectorHighlight === 'function') setInspectorHighlight(-1);
}

function parseTree(raw: string): InspectorTreeNode[] {
  try {
    return JSON.parse(raw) as InspectorTreeNode[];
  } catch {
    return [];
  }
}

// Path from a root node down to `id` (inclusive), or null when absent.
function findTreePath(nodes: InspectorTreeNode[], id: number): InspectorTreeNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const childPath = findTreePath(node.children ?? [], id);
    if (childPath) return [node, ...childPath];
  }
  return null;
}

// Prefer the app-code component name reported by the dev reconciler, then
// the explicit id prop, then the host kind.
function nodeLabel(node: InspectorTreeNode): string {
  return node.component || node.name || node.type;
}

function selectionKey(path: InspectorTreeNode[] | null): string {
  if (!path || path.length === 0) return '';
  const node = path[path.length - 1];
  const l = node.layout;
  return `${path.map(n => `${n.id}:${nodeLabel(n)}`).join('>')}|${node.text ?? ''}|${l ? `${l.x},${l.y},${l.width},${l.height}` : ''}`;
}

// Polls the native inspector for the currently picked node while pick mode is
// active, resolving it against the node tree for type/name/layout details.
function useInspectorSelection(active: boolean): InspectorTreeNode[] | null {
  const [selectedPath, setSelectedPath] = useState<InspectorTreeNode[] | null>(null);
  const keyRef = useRef('');
  useEffect(() => {
    if (!active) {
      keyRef.current = '';
      setSelectedPath(null);
      return;
    }
    const tick = () => {
      const picked = typeof getInspectorPickedNode === 'function' ? getInspectorPickedNode() : -1;
      let next: InspectorTreeNode[] | null = null;
      if (picked >= 0 && typeof getNodeTree === 'function') {
        next = findTreePath(parseTree(getNodeTree()), picked);
      }
      const key = selectionKey(next);
      if (key !== keyRef.current) {
        keyRef.current = key;
        setSelectedPath(next);
      }
    };
    tick();
    const timer = setInterval(tick, 400);
    return () => clearInterval(timer);
  }, [active]);
  return selectedPath;
}

const colors = {
  surface: 0xF5292929FF,
  text: 0xFFF5F5F5FF,
  muted: 0xFFA6A6A6FF,
  accent: 0xFFB9A2FFFF,
  detail: 0xFFD8D0E8FF,
};

// Floating "Tap an element to inspect it" bar shown while inspector pick mode
// is active. Draggable (via layout position, so hit testing and the native
// pick-mode pass-through both track it) to get it out of the way of elements
// it would otherwise cover. Shows details for the picked element and a Done
// button that leaves pick mode.
export function InspectorPickBar() {
  const launcher = useDevLauncher();
  const active = launcher.inspectorPickMode && !launcher.devMenuOpen;
  const selected = useInspectorSelection(active);

  const [pos, setPos] = useState({ x: 18, y: 18 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragOrigin = useRef({ x: 18, y: 18 });
  const bounds = useRef({ width: 0, height: 0 });

  if (!active) return null;

  const clampPos = (x: number, y: number) => {
    const maxX = bounds.current.width > 80 ? bounds.current.width - 80 : x;
    const maxY = bounds.current.height > 80 ? bounds.current.height - 80 : y;
    return {
      x: Math.min(Math.max(0, x), Math.max(0, maxX)),
      y: Math.min(Math.max(0, y), Math.max(0, maxY)),
    };
  };

  return (
    <View
      id="__rayact_devtools_inspector_layer"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2_000_003, pointerEvents: 'none' }}
      onLayout={(e: { nativeEvent: { layout: { width: number; height: number } } }) => {
        bounds.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
    >
      <View
        id="__rayact_devtools_inspector_bar"
        style={{
          position: 'absolute', top: pos.y, left: pos.x,
          minWidth: 250, maxWidth: 340,
          backgroundColor: colors.surface, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 10, gap: 6,
        }}
        capturesInput
        onDragStart={() => { dragOrigin.current = posRef.current; }}
        onDragMove={(e: { x: number; y: number }) => {
          setPos(clampPos(dragOrigin.current.x + e.x, dragOrigin.current.y + e.y));
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <Icon name="drag_indicator" size={16} color={colors.muted} />
            <Text style={{ text: { color: colors.text, fontSize: 12, fontWeight: 600 } }}>
              Tap an element to inspect it
            </Text>
          </View>
          <Text
            style={{ text: { color: colors.accent, fontSize: 12, fontWeight: 600 } }}
            onPress={() => {
              clearInspectorHighlight();
              launcher.setInspectorPickMode(false);
              launcher.setInspectorOpen(false);
            }}
          >
            Done
          </Text>
        </View>
        {selected && selected.length > 0 ? (() => {
          const node = selected[selected.length - 1];
          // Ancestor chain (closest last), deduping consecutive identical
          // component labels — one source component usually owns several
          // nested host views.
          const crumbs: string[] = [];
          for (const n of selected) {
            const label = nodeLabel(n);
            if (crumbs[crumbs.length - 1] !== label) crumbs.push(label);
          }
          const shown = crumbs.slice(-5);
          const breadcrumb = `${crumbs.length > shown.length ? '... > ' : ''}${shown.join(' > ')}`;
          return (
            <View style={{ gap: 2 }}>
              <Text style={{ text: { color: colors.accent, fontSize: 11, fontWeight: 600 } }}>
                {`${nodeLabel(node)} #${node.id}${node.component ? ` · ${node.type}` : ''}`}
              </Text>
              <Text style={{ text: { color: colors.muted, fontSize: 9 } }}>{breadcrumb}</Text>
              {node.layout ? (
                <Text style={{ text: { color: colors.muted, fontSize: 10 } }}>
                  {`x ${Math.round(node.layout.x)}  y ${Math.round(node.layout.y)}  ${Math.round(node.layout.width)} × ${Math.round(node.layout.height)}`}
                </Text>
              ) : null}
              {node.text ? (
                <Text style={{ text: { color: colors.detail, fontSize: 10 } }}>{node.text}</Text>
              ) : null}
            </View>
          );
        })() : null}
      </View>
    </View>
  );
}
