import { useCallback, useRef } from 'react';

declare global {
  function rayactRegisterAnimatedNode(nodeId: number): void;
  function rayactSetAnimatedStyle(nodeId: number, prop: string, value: number): void;
}

export function useWorklet<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export function useAnimatedStyle(factory: () => Record<string, number>) {
  const nodeRef = useRef<number | null>(null);
  return useCallback(() => {
    const styles = factory();
    if (nodeRef.current != null) {
      for (const [key, value] of Object.entries(styles)) {
        rayactSetAnimatedStyle(nodeRef.current, key, value);
      }
    }
    return styles;
  }, [factory]);
}

export function withSpring(to: number, _config?: { stiffness?: number; damping?: number }) {
  return to;
}

export function withTiming(to: number, _config?: { duration?: number }) {
  return to;
}

export function registerWorkletNode(nodeId: number) {
  nodeRefGuard(nodeId);
  rayactRegisterAnimatedNode(nodeId);
}

const nodeRefGuard = (nodeId: number) => nodeId;
