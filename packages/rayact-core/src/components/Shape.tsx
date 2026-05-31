/**
 * Shape base component
 */

import type { CSSProperties } from '@rayact/shared';

export interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  opacity?: number;
}

export interface ShapeAttributes extends ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
}

export interface ShapeInstance {
  id: string;
  type: 'rect' | 'circle' | 'line';
  attributes: Partial<ShapeAttributes>;
  isVisible: boolean;
  zIndex: number;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onClick?: (e: PointerEvent) => void;
}

export abstract class Shape {
  protected instance: ShapeInstance;

  constructor(
    public readonly type: 'rect' | 'circle' | 'line',
    attributes: Partial<ShapeAttributes> = {}
  ) {
    this.instance = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      attributes,
      isVisible: attributes.visible !== false,
      zIndex: attributes.zIndex || 0,
      ...attributes
    };
  }

  abstract render(ctx: CanvasRenderingContext2D): void;

  updateProps(props: Partial<ShapeProps>): void {
    this.instance.attributes = {
      ...this.instance.attributes,
      ...props
    };
  }

  show(): void {
    this.instance.isVisible = true;
  }

  hide(): void {
    this.instance.isVisible = false;
  }

  setZIndex(zIndex: number): void {
    this.instance.zIndex = zIndex;
  }

  getBoundingRect(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.instance.attributes.x || 0,
      y: this.instance.attributes.y || 0,
      width: this.instance.attributes.width || 0,
      height: this.instance.attributes.height || 0
    };
  }

  containsPoint(x: number, y: number): boolean {
    const rect = this.getBoundingRect();
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  setPointerEvents(onPointerDown?: (e: PointerEvent) => void,
                    onPointerUp?: (e: PointerEvent) => void,
                    onClick?: (e: PointerEvent) => void): void {
    this.instance.onPointerDown = onPointerDown;
    this.instance.onPointerUp = onPointerUp;
    this.instance.onClick = onClick;
  }
}
