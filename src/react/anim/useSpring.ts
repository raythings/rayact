import { useAnimatedValue, type AnimatedValueOptions } from './useAnimatedValue';

export interface SpringOptions extends AnimatedValueOptions {
  stiffness?: number;
  damping?: number;
}

export function useSpring(target: number, options: SpringOptions = {}): number {
  const stiffness = options.stiffness ?? 170;
  const damping = options.damping ?? 26;
  const mass = 1;
  const duration = options.duration ?? Math.max(200, Math.min(600, (2 * Math.PI * Math.sqrt(mass / stiffness)) * 1000));

  return useAnimatedValue(target, {
    duration,
    easing: options.easing,
    onSettled: options.onSettled,
    from: options.from,
  });
}
