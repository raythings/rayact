import { registerHostNodeType } from '@rayact/renderer';
import { registerModuleNodeHandlers, type ModuleNodeHandlers } from '@rayact/runtime';

/**
 * Register a component backed by a native module's node kind (ABI 2).
 *
 * Built-in components are wired through the engine at compile time. A module cannot
 * be, so it calls this at import scope and the two registries it needs are updated
 * together: the reconciler learns the element type is legal, and the bridge learns
 * how to build and update it.
 *
 * Registration is guaranteed to precede the first render by construction — the only
 * way to render the component is to import it from the module that registers it.
 *
 * ```ts
 * // inside @rayact/svg
 * registerNativeComponent('svg', {
 *   create: (native, props, style) =>
 *     native.createModuleNode!('svg', style, JSON.stringify(payload(props))),
 *   update: (native, nodeId, props) =>
 *     native.setModuleNodeProps!(nodeId, JSON.stringify(payload(props))),
 * });
 * export const Svg = (props: SvgProps) => React.createElement('rayact-svg', props);
 * ```
 */
export function registerNativeComponent(type: string, handlers: ModuleNodeHandlers): void {
  registerHostNodeType(type);
  registerModuleNodeHandlers(type, handlers);
}

export type { ModuleNodeHandlers };
