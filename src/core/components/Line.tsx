/**
 * Line component
 */

import { Shape, ShapeProps, ShapeAttributes } from './Shape';

export interface LineProps extends ShapeProps {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  rotation?: number;
}

export class Line extends Shape {
  constructor(attributes: Partial<LineProps> = {}) {
    super('line', attributes as ShapeAttributes);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const {
      x = 0,
      y = 0,
      width = 0,
      height = 0,
      x1,
      y1,
      x2,
      y2,
      rotation = 0,
      color,
      opacity = 1
    } = this.instance.attributes;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (this.instance.isVisible && width > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color || 'transparent';
      ctx.lineWidth = Math.max(height, 1);

      const lineX1 = x1 ?? x;
      const lineY1 = y1 ?? y;
      const lineX2 = x2 ?? x + width;
      const lineY2 = y2 ?? y + height;

      ctx.translate(lineX1, lineY1);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.moveTo(0, 0);
      ctx.lineTo(lineX2 - lineX1, lineY2 - lineY1);
      ctx.stroke();
    }

    ctx.restore();
  }

  getBoundingRect(): { x: number; y: number; width: number; height: number } {
    const { x = 0, y = 0, width = 0, height = 0, x1, y1, x2, y2 } = this.instance.attributes;
    const startX = Math.min(x1 ?? x, x2 ?? x + width);
    const startY = Math.min(y1 ?? y, y2 ?? y + height);
    const endX = Math.max(x1 ?? x, x2 ?? x + width);
    const endY = Math.max(y1 ?? y, y2 ?? y + height);
    return {
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY
    };
  }
}
