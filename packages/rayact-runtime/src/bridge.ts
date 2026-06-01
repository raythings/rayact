import type { HostBridge, HostEventName, HostNode, HostNodeType, RayactGlobal } from './types';
import { isRayactAsset, resolveAssetUrl } from './assets';

function flattenStyleValue(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyleValue));
  }
  if (!style || typeof style !== 'object') return {};
  return { ...(style as Record<string, unknown>) };
}

function toStyleProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const style = flattenStyleValue(props.style);

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

function resolveImageSource(value: unknown, native: RayactGlobal): string {
  if (isRayactAsset(value)) {
    return typeof native.resolveAssetPath === 'function'
      ? native.resolveAssetPath(value)
      : resolveAssetUrl(value, native);
  }
  return String(value ?? '');
}

const materialHostTypes = new Set<HostNodeType>([
  'appBar',
  'badge',
  'banner',
  'bottomAppBar',
  'bottomSheet',
  'dataTable',
  'dockedToolbar',
  'floatingToolbar',
  'buttonGroup',
  'card',
  'carousel',
  'checkbox',
  'chip',
  'datePicker',
  'dialog',
  'divider',
  'extendedFab',
  'fab',
  'fabMenu',
  'iconButton',
  'loadingIndicator',
  'menu',
  'navigationBar',
  'navigationBarItem',
  'navigationDrawer',
  'navigationRail',
  'progressIndicator',
  'radioButton',
  'searchBar',
  'segmentedButton',
  'sideSheet',
  'slider',
  'snackbar',
  'splitButton',
  'switch',
  'tabs',
  'toolbar',
  'tooltip'
]);

function materialProps(type: HostNodeType, props: Record<string, unknown>, style: Record<string, unknown>): Record<string, unknown> {
  const childLabel = typeof props.children === 'string' || typeof props.children === 'number'
    ? props.children
    : undefined;
  return {
    ...style,
    ...props,
    component: type,
    label: props.label ?? props.text ?? props.title ?? childLabel
  };
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
          return asHostNode(requireFunction(native.createImage, 'createImage')(resolveImageSource(props.source ?? props.src, native), style), type);
        case 'icon':
          return asHostNode(
            requireFunction(native.createIcon, 'createIcon')(
              String(props.name ?? props.icon ?? ''),
              typeof props.size === 'number' ? props.size : undefined,
              typeof props.color === 'number' || typeof props.color === 'string' ? props.color : undefined,
              style,
              typeof props.variant === 'string' ? props.variant : undefined
            ),
            type
          );
        case 'textInput':
          return asHostNode(
            requireFunction(native.createTextInput, 'createTextInput')(
              String(props.value ?? props.defaultValue ?? ''),
              { ...style, ...props }
            ),
            type
          );
        case 'scrollView':
          return asHostNode(requireFunction(native.createScrollView, 'createScrollView')({ ...style, ...props }), type);
        case 'modal':
          return asHostNode(requireFunction(native.createModal, 'createModal')({ ...style, ...props }), type);
        case 'safeArea':
          return asHostNode(
            (native.createSafeArea ?? native.createView ?? requireFunction(native.createView, 'createView'))({ ...style, ...props }),
            type
          );
        case 'statusBar':
          return asHostNode(
            (native.createStatusBar ?? native.createView ?? requireFunction(native.createView, 'createView'))({ ...style, ...props }),
            type
          );
        case 'activityIndicator':
          return asHostNode(requireFunction(native.createActivityIndicator, 'createActivityIndicator')({ ...style, ...props }), type);
        case 'avoidKeyboard':
          return asHostNode(
            (native.createAvoidKeyboard ?? native.createView ?? requireFunction(native.createView, 'createView'))({ ...style, ...props }),
            type
          );
        default:
          if (materialHostTypes.has(type)) {
            return asHostNode(
              requireFunction(native.createMaterialComponent, 'createMaterialComponent')(type, materialProps(type, props, style)),
              type
            );
          }
          throw new Error(`Unsupported Rayact host node type: ${type}`);
      }
    },

    updateNode(node, props) {
      const style = toStyleProps(props);
      if (materialHostTypes.has(node.type) && typeof native.setMaterialComponentProps === 'function') {
        native.setMaterialComponentProps(node.id, materialProps(node.type, props, style));
      }

      if (Object.keys(style).length > 0) {
        requireFunction(native.setStyle, 'setStyle')(node.id, style);
      }

      if (node.type === 'text' && ('text' in props || 'children' in props)) {
        requireFunction(native.setText, 'setText')(node.id, String(props.text ?? props.children ?? ''));
      }

      if (
        (node.type === 'button' || materialHostTypes.has(node.type)) &&
        ('label' in props || 'text' in props || 'title' in props ||
          typeof props.children === 'string' || typeof props.children === 'number')
      ) {
        requireFunction(native.setText, 'setText')(node.id, String(props.label ?? props.text ?? props.title ?? props.children ?? ''));
      }

      if (node.type === 'textInput' && ('value' in props) && typeof native.setValue === 'function') {
        native.setValue(node.id, String(props.value ?? ''));
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
      } else if (eventName === 'changeText' && typeof native.setOnChangeText === 'function') {
        native.setOnChangeText(node.id, handler as ((value: string) => void) | null);
      } else if (eventName === 'changeValue' && typeof native.setOnChangeValue === 'function') {
        native.setOnChangeValue(node.id, handler as ((value: number) => void) | null);
      } else if (eventName === 'scroll' && typeof native.setOnScroll === 'function') {
        native.setOnScroll(node.id, handler as ((event: unknown) => void) | null);
      } else if (eventName === 'requestClose' && typeof native.setOnRequestClose === 'function') {
        native.setOnRequestClose(node.id, handler ?? null);
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
