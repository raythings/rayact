/**
 * React reconciler for Rayact
 * Inspired by proton-native's approach
 */

import { Shape } from '../components/Shape';
import { Rect } from '../components/Rect';
import { Circle } from '../components/Circle';
import { Line } from '../components/Line';

const Reconciler = require('react-reconciler');

interface RenderContext {
  root: Shape;
  shapes: Map<string, Shape>;
  context: CanvasRenderingContext2D;
  animationFrameId: number | null;
}

const DEBUG = false;

/**
 * Create a native shape instance from React props
 */
function createInstance(type: string, props: any): Shape {
  if (DEBUG) console.log('createInstance:', type, props);

  switch (type) {
    case 'rect':
      return new Rect(props);
    case 'circle':
      return new Circle(props);
    case 'line':
      return new Line(props);
    default:
      throw new Error(`Unknown component type: ${type}`);
  }
}

/**
 * Create a text instance
 */
function createTextInstance(text: string): Shape {
  if (DEBUG) console.log('createTextInstance:', text);
  return { text, type: 'text' } as any;
}

/**
 * Insert a child into parent
 */
function insertChild(parent: RenderContext['root'], child: Shape, beforeChild?: Shape): void {
  const operation = beforeChild ? 'insertChild' : 'appendChild';
  const params = beforeChild ? [child, beforeChild] : [child];

  if (parent[operation]) {
    parent[operation](...params);
    child.element?.show?.();
  } else {
    throw new Error(`Can't append child to ${parent.constructor.name}`);
  }
}

/**
 * Remove a child from parent
 */
function removeChild(parent: RenderContext['root'], child: Shape): void {
  if (DEBUG) console.log('removeChild:', child);
  if (parent.removeChild) {
    parent.removeChild(child);
  } else {
    throw new Error(`Can't remove child from ${parent.constructor.name}`);
  }
}

/**
 * Insert child before another
 */
function insertBefore(parent: RenderContext['root'], child: Shape, beforeChild: Shape): void {
  if (DEBUG) console.log('insertBefore:', child, beforeChild);
  if (parent.insertChild) {
    parent.insertChild(child, beforeChild);
  } else {
    throw new Error(`Can't insert before ${parent.constructor.name}`);
  }
}

/**
 * Commit props update to native shape
 */
function commitUpdate(instance: Shape, updatePayload: any): void {
  if (DEBUG) console.log('commitUpdate:', instance, updatePayload);
  instance.updateProps(updatePayload);
}

/**
 * Commit text update
 */
function commitTextUpdate(textInstance: any, oldText: string, newText: string): void {
  if (DEBUG) console.log('commitTextUpdate:', newText);
  textInstance.text = newText;
  textInstance.parent?.updateText();
}

/**
 * Append initial child
 */
function appendInitialChild(parent: RenderContext['root'], child: Shape): void {
  if (DEBUG) console.log('appendInitialChild');
  insertChild(parent, child);
}

/**
 * Prepare for commit
 */
function prepareForCommit(root: RenderContext): void {
  if (DEBUG) console.log('prepareForCommit');
  // noop
}

/**
 * Reset after commit
 */
function resetAfterCommit(root: RenderContext): void {
  if (DEBUG) console.log('resetAfterCommit');
  // Trigger rendering
  requestAnimationFrame(() => {
    if (root.context && root.root) {
      root.context.clearRect(0, 0, root.context.canvas.width, root.context.canvas.height);
      // This would trigger actual rendering in the native backend
    }
  });
}

/**
 * Get root host context
 */
function getRootHostContext(): any {
  if (DEBUG) console.log('getRootHostContext');
  return {};
}

/**
 * Get child host context
 */
function getChildHostContext(hostContext: any, type: string, rootContainer: any): any {
  if (DEBUG) console.log('getChildHostContext:', type);
  return {};
}

/**
 * Should text content
 */
function shouldSetTextContent(type: string, props: any): boolean {
  if (DEBUG) console.log('shouldSetTextContent:', type);
  return false;
}

/**
 * Now function
 */
function now(): number {
  return performance.now();
}

const DesktopRenderer = Reconciler({
  appendInitialChild,
  createInstance,
  createTextInstance,
  finalizeInitialChildren() {
    if (DEBUG) console.log('finalizeInitialChildren');
    return false;
  },
  getPublicInstance(instance: any) {
    if (DEBUG) console.log('getPublicInstance');
    return instance;
  },
  prepareForCommit,
  prepareUpdate(instance: any, type: string, oldProps: any, newProps: any) {
    if (DEBUG) console.log('prepareUpdate:', type);
    const propKeys = Object.keys(newProps).concat(Object.keys(oldProps));
    const diff: any = {};
    for (const key of propKeys) {
      if (oldProps[key] !== newProps[key]) {
        diff[key] = newProps[key];
      }
    }
    return diff;
  },
  resetAfterCommit,
  resetTextContent() {
    if (DEBUG) console.log('resetTextContent');
    // noop
  },
  getRootHostContext,
  getChildHostContext,
  shouldSetTextContent,
  now,
  useSyncScheduling: true,
  supportsMutation: true,
  supportsPersistence: false,

  appendChild(parent: RenderContext['root'], child: Shape): void {
    if (DEBUG) console.log('appendChild');
    insertChild(parent, child);
  },

  appendChildToContainer(parent: RenderContext['root'], child: Shape): void {
    if (DEBUG) console.log('appendChildToContainer');
    insertChild(parent, child);
  },

  removeChild(parent: RenderContext['root'], child: Shape): void {
    if (DEBUG) console.log('removeChild');
    removeChild(parent, child);
  },

  removeChildFromContainer(parent: RenderContext['root'], child: Shape): void {
    if (DEBUG) console.log('removeChildFromContainer');
    removeChild(parent, child);
  },

  insertBefore(parent: RenderContext['root'], child: Shape, beforeChild: Shape): void {
    if (DEBUG) console.log('insertBefore');
    insertBefore(parent, child, beforeChild);
  },

  commitUpdate(instance: Shape, updatePayload: any): void {
    if (DEBUG) console.log('commitUpdate');
    commitUpdate(instance, updatePayload);
  },

  commitMount(root: RenderContext): void {
    if (DEBUG) console.log('commitMount');
    // Render the initial state
    requestAnimationFrame(() => {
      if (root.context && root.root) {
        root.context.clearRect(0, 0, root.context.canvas.width, root.context.canvas.height);
      }
    });
  },

  commitTextUpdate(textInstance: any, oldText: string, newText: string): void {
    if (DEBUG) console.log('commitTextUpdate');
    commitTextUpdate(textInstance, oldText, newText);
  }
});

/**
 * Render context utility
 */
export function createRenderContext(canvas: HTMLCanvasElement): RenderContext {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get 2D context');
  }

  const root = new Shape('rect', { x: 0, y: 0, width: canvas.width, height: canvas.height });
  const shapes = new Map<string, Shape>();

  return {
    root,
    shapes,
    context,
    animationFrameId: null
  };
}

/**
 * Get or create shape instance by ID
 */
export function getShapeById(renderContext: RenderContext, id: string): Shape | undefined {
  return renderContext.shapes.get(id);
}

/**
 * Render all shapes in the context
 */
export function renderAllShapes(renderContext: RenderContext): void {
  if (!renderContext.context || !renderContext.root) return;

  const { context, root } = renderContext;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);

  // This would recursively render all shapes from the root
  // For now, we just render the root's direct children
  const children = root.children || [];
  children.forEach((shape: Shape) => {
    shape.render(context);
  });
}

/**
 * Start the render loop
 */
export function startRenderLoop(renderContext: RenderContext, renderCallback: () => void): void {
  function render() {
    if (renderCallback) {
      renderCallback();
    }
    renderContext.animationFrameId = requestAnimationFrame(render);
  }

  render();
}

/**
 * Stop the render loop
 */
export function stopRenderLoop(renderContext: RenderContext): void {
  if (renderContext.animationFrameId) {
    cancelAnimationFrame(renderContext.animationFrameId);
    renderContext.animationFrameId = null;
  }
}

export default DesktopRenderer;
