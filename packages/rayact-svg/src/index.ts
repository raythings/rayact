import React from 'react';
import { registerNativeComponent } from 'rayact/react';
import { resolveImageSource, type RayactGlobal } from '@rayact/runtime';

/**
 * Vector artwork rendered by raysvg.
 *
 * The document is parsed once and retained natively, so animating it is a channel
 * write rather than a reparse: `channels` maps an element id to
 * `[translateX, translateY, rotationDeg, scaleX, scaleY]` in the document's own user
 * units, applied about that element's `transform-origin`.
 */
export interface SvgProps {
  /** Bundler asset, file path, or inline SVG markup. */
  source?: unknown;
  src?: unknown;
  /**
   * CSS custom properties the document references through `var()`.
   *
   * Values parse with raysvg's own colour syntax — `#hex`, `rgb()`/`rgba()`, `hsl()`,
   * named colours — or a packed `0xRRGGBBAA` number. That is the same parser every
   * other paint in the document uses.
   */
  vars?: Record<string, string | number>;
  /** Per-element transforms, keyed by element id. */
  channels?: Record<string, [number, number, number, number, number] | number[]>;
  /** Groups to draw a synthesized dilate-style outline beneath. */
  outline?: Array<string | { id: string; color?: string | number; radius?: number }>;
  style?: Record<string, unknown>;
  className?: string;
  [key: string]: unknown;
}

// Only the props the native side reads are serialized; style and layout stay with the
// engine, which owns them exactly as for a built-in component.
function nativePayload(props: Record<string, unknown>, includeSource: boolean): string {
  const payload: Record<string, unknown> = {};
  if (includeSource) {
    const raw = props.source ?? props.src ?? '';
    payload.source = typeof raw === 'string' ? raw : undefined;
  }
  if (props.vars !== undefined) payload.vars = props.vars;
  if (props.channels !== undefined) payload.channels = props.channels;
  if (props.outline !== undefined) payload.outline = props.outline;
  return JSON.stringify(payload);
}

function requireModuleNode(native: RayactGlobal): void {
  if (typeof native.createModuleNode !== 'function') {
    throw new Error(
      '@rayact/svg needs a Rayact engine with module ABI 2 (createModuleNode). ' +
      'Update the rayact runtime, or rebuild your dev client.'
    );
  }
}

registerNativeComponent('svg', {
  create(native, props, style) {
    requireModuleNode(native);
    // A non-string source is a bundler asset; resolve it to a path the way <Image> does.
    const raw = props.source ?? props.src ?? '';
    const source = typeof raw === 'string' ? raw : resolveImageSource(raw, native);
    const payload = JSON.parse(nativePayload(props, false)) as Record<string, unknown>;
    payload.source = source;
    return native.createModuleNode!('svg', style, JSON.stringify(payload));
  },
  update(native, nodeId, props) {
    if (typeof native.setModuleNodeProps !== 'function') return;
    // `source` is create-time only: swapping it would mean a different document, which
    // React expresses by remounting (give the element a different key).
    if (props.vars === undefined && props.channels === undefined && props.outline === undefined) {
      return;
    }
    native.setModuleNodeProps(nodeId, nativePayload(props, false));
  },
});

/**
 * Renders an SVG document.
 *
 * ```tsx
 * import { Svg } from '@rayact/svg';
 *
 * <Svg
 *   source={markup}
 *   style={{ width: 240, height: 240 }}
 *   vars={{ '--skin': '#ffe76a' }}
 *   outline={['outline-group']}
 *   channels={{ 'arm-left': [0, 0, 22, 1, 1] }}
 * />
 * ```
 */
export function Svg(props: SvgProps): React.ReactElement {
  return React.createElement('rayact-svg', props);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'rayact-svg': SvgProps;
    }
  }
}
