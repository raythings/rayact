import React from 'react';

export type EasingFn = (t: number) => number;

export interface AnimatedValueOptions {
  duration?: number;
  easing?: EasingFn;
  /**
   * Fired when the animation reaches its target (t >= 1) — i.e. the value
   * has settled. Used by the navigation system to drive lifecycle events
   * (deferred release, engine-stack trim) exactly when the user sees the
   * animation finish. Optional; if omitted, the callback never fires.
   */
  onSettled?: (value: number) => void;
}

export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function useAnimatedValue(
  target: number,
  options: AnimatedValueOptions = {}
): number {
  const { duration = 300, easing = easeInOutCubic, onSettled } = options;

  const [value, setValue] = React.useState(target);
  const valueRef = React.useRef(target);
  const frameRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number | null>(null);
  const fromRef = React.useRef(target);
  // Keep the latest onSettled in a ref so the step closure (built per
  // effect run) always sees the current callback without re-running the
  // effect when the consumer swaps the function reference.
  const onSettledRef = React.useRef(onSettled);
  onSettledRef.current = onSettled;
  const settledRef = React.useRef(true); // start "settled" — initial value

  React.useEffect(() => {
    if (target === valueRef.current) {
      // No movement needed. Don't fire onSettled here — it would fire on
      // every render where target == current, which is the steady state.
      return;
    }

    fromRef.current = valueRef.current;
    startRef.current = null;
    settledRef.current = false;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      const next = fromRef.current + (target - fromRef.current) * easing(t);
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else if (!settledRef.current) {
        settledRef.current = true;
        // Schedule the callback outside the rAF step to avoid re-entrancy
        // surprises (the consumer might want to setState synchronously).
        const cb = onSettledRef.current;
        if (cb) queueMicrotask(() => cb(next));
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, easing]);

  return value;
}
