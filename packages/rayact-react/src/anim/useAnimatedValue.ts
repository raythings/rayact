import React from 'react';

export type EasingFn = (t: number) => number;

export interface AnimatedValueOptions {
  duration?: number;
  easing?: EasingFn;
}

export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function useAnimatedValue(
  target: number,
  options: AnimatedValueOptions = {}
): number {
  const { duration = 300, easing = easeInOutCubic } = options;

  const [value, setValue] = React.useState(target);
  const valueRef = React.useRef(target);
  const frameRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number | null>(null);
  const fromRef = React.useRef(target);

  React.useEffect(() => {
    if (target === valueRef.current) return;

    fromRef.current = valueRef.current;
    startRef.current = null;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      const next = fromRef.current + (target - fromRef.current) * easing(t);
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, easing]);

  return value;
}
