/**
 * Rectangle component
 */

import { Shape, ShapeProps, ShapeAttributes } from './Shape';

export interface RectProps extends ShapeProps {
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

export class Rect extends Shape {
  constructor(attributes: Partial<RectProps> = {}) {
    super('rect', attributes as ShapeAttributes);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const {
      x = 0,
      y = 0,
      width = 0,
      height = 0,
      color,
      opacity = 1,
      borderRadius = 0,
      borderWidth = 0,
      borderColor
    } = this.instance.attributes;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (this.instance.isVisible) {
      ctx.beginPath();
      ctx.fillStyle = color || 'transparent';
      ctx.strokeStyle = borderColor || 'transparent';
      ctx.lineWidth = borderWidth;

      // Rounded rectangle
      if (borderRadius > 0) {
        const r = Math.min(borderRadius, width / 2, height / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      } else {
        ctx.rect(x, y, width, height);
      }

      if (color) {
        ctx.fill();
      }
      if (borderWidth > 0 && borderColor) {
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  getBoundingRect(): { x: number; y: number; width: number; height: number } {
    const { x = 0, y = 0, width = 0, height = 0 } = this.instance.attributes;
    return { x, y, width, height };
  }
}
