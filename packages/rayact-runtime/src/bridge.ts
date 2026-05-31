import type { HostBridge, HostEventName, HostNode, HostNodeType, RayactGlobal } from './types';

function toStyleProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const style = typeof props.style === 'object' && props.style !== null
    ? { ...(props.style as Record<string, unknown>) }
    : {};

  if (typeof props.className === 'string') {
    style.className = props.className;
  }

  return style;
}

function requireFunction<T extends Function>(value: T | undefined, name: string): T {
  if (typeof value !== 'function') {
    throw new Error(`Rayact native bridge is missing global ${name}()`);
  }
  return value;
}

function asHostNode(id: number | null, type: HostNodeType): HostNode {
  if (typeof id !== 'number') {
    throw new Error(`Failed to create native ${type} node`);
  }
  return { id, type };
}

export function createBridge(globalObject: RayactGlobal = globalThis as RayactGlobal): HostBridge {
  const native = globalObject;

  const bridge: HostBridge = {
    createNode(type, props = {}) {
      const style = toStyleProps(props);

      switch (type) {
        case 'root':
        case 'view':
          return asHostNode(requireFunction(native.createView, 'createView')(style), type);
        case 'text': {
          const text = String(props.text ?? props.children ?? '');
          return asHostNode(requireFunction(native.createText, 'createText')(text, style), type);
        }
        case 'button': {
          const label = String(props.label ?? props.text ?? props.children ?? '');
          return asHostNode(requireFunction(native.createButton, 'createButton')(label, style), type);
        }
        case 'image':
          return asHostNode(requireFunction(native.createImage, 'createImage')(String(props.src ?? ''), style), type);
        case 'icon':
          return asHostNode(
            requireFunction(native.createIcon, 'createIcon')(
              String(props.name ?? props.icon ?? ''),
              typeof props.size === 'number' ? props.size : undefined,
              typeof props.color === 'number' ? props.color : undefined,
              style
            ),
            type
          );
        default:
          throw new Error(`Unsupported Rayact host node type: ${type}`);
      }
    },

    updateNode(node, props) {
      const style = toStyleProps(props);
      if (Object.keys(style).length > 0) {
        requireFunction(native.setStyle, 'setStyle')(node.id, style);
      }

      if (node.type === 'text' && ('text' in props || 'children' in props)) {
        requireFunction(native.setText, 'setText')(node.id, String(props.text ?? props.children ?? ''));
      }

      if (node.type === 'button' && ('label' in props || 'text' in props || 'children' in props)) {
        requireFunction(native.setText, 'setText')(node.id, String(props.label ?? props.text ?? props.children ?? ''));
      }
    },

    appendChild(parent, child) {
      requireFunction(native.appendChild, 'appendChild')(parent.id, child.id);
    },

    removeChild(parent, child) {
      requireFunction(native.removeChild, 'removeChild')(parent.id, child.id);
    },

    insertBefore(parent, child, beforeChild) {
      requireFunction(native.insertBefore, 'insertBefore')(parent.id, child.id, beforeChild.id);
    },

    setRoot(node) {
      if (node) {
        requireFunction(native.setRootNode, 'setRootNode')(node.id);
      } else if (typeof native.clearRootNode === 'function') {
        native.clearRootNode();
      } else {
        requireFunction(native.setRootNode, 'setRootNode')(null);
      }
    },

    setEventHandler(node, eventName: HostEventName, handler) {
      if (eventName === 'press' || eventName === 'click') {
        requireFunction(native.setOnPress, 'setOnPress')(node.id, handler ?? null);
      }
    },

    disposeNode(node) {
      if (typeof native.disposeNode === 'function') {
        native.disposeNode(node.id);
      }
    },

    async reload(source) {
      if (!source) return;
      if (typeof native.eval !== 'function') {
        throw new Error('Rayact reload requires global eval()');
      }
      native.eval(source);
    },

    showError(message, stack) {
      const detail = stack ? `${message}\n\n${stack}` : message;
      try {
        const root = bridge.createNode('view', {
          style: {
            backgroundColor: 0x2B1111FF,
            padding: 24,
            gap: 12,
            flexGrow: 1
          }
        });
        const title = bridge.createNode('text', {
          text: 'Rayact runtime error',
          style: { text: { color: 0xFFFFFFFF, fontSize: 24 } }
        });
        const body = bridge.createNode('text', {
          text: detail,
          style: { text: { color: 0xFFB4B4FF, fontSize: 14 } }
        });
        bridge.appendChild(root, title);
        bridge.appendChild(root, body);
        bridge.setRoot(root);
      } catch (overlayError) {
        native.console?.error?.('Failed to show Rayact error overlay', overlayError);
      }
    }
  };

  return bridge;
}
