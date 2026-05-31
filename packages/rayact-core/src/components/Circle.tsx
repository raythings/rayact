/**
 * Circle component
 */

import { Shape, ShapeProps, ShapeAttributes } from './Shape';

export interface CircleProps extends ShapeProps {
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export class Circle extends Shape {
  constructor(attributes: Partial<CircleProps> = {}) {
    super('circle', attributes as ShapeAttributes);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const {
      x = 0,
      y = 0,
      width = 0,
      height = 0,
      radius,
      startAngle = 0,
      endAngle = Math.PI * 2,
      color,
      opacity = 1
    } = this.instance.attributes;

    const circleRadius = radius ?? Math.min(width, height) / 2;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (this.instance.isVisible && circleRadius > 0) {
      ctx.beginPath();
      ctx.fillStyle = color || 'transparent';
      ctx.strokeStyle = color || 'transparent';
      ctx.arc(x + circleRadius, y + circleRadius, circleRadius, startAngle, endAngle);

      if (color) {
        ctx.fill();
      }
    }

    ctx.restore();
  }

  getBoundingRect(): { x: number; y: number; width: number; height: number } {
    const { x = 0, y = 0, width = 0, height = 0, radius } = this.instance.attributes;
    const circleRadius = radius ?? Math.min(width, height) / 2;
    return {
      x: x - circleRadius,
      y: y - circleRadius,
      width: circleRadius * 2,
      height: circleRadius * 2
    };
  }
}
