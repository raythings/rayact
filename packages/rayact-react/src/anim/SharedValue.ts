import React from 'react';

const globalObj = globalThis as any;
const SLAB_SIZE = 8;
const OFFSETS = {
  translateX: 0,
  translateY: 1,
  scale: 2,
  opacity: 3,
  rotation: 4,
  dirty: 5,
};

let sharedFloatArray: Float32Array | null = null;

export interface AnimationConfig {
  type: 'spring' | 'timing';
  target: number;
  duration: number;
  stiffness?: number;
  damping?: number;
}

export function withTiming(target: number, duration = 300): AnimationConfig {
  return { type: 'timing', target, duration };
}

export function withSpring(target: number, stiffness = 170, damping = 26): AnimationConfig {
  return { type: 'spring', target, duration: 300, stiffness, damping };
}

export class SharedValue {
  private nodeId: number | null = null;
  private propertyOffset: number = -1;
  private index: number = -1;
  private dirtyIndex: number = -1;
  private initialValue: number;
  private fallbackFrameId: number | null = null;

  constructor(initialValue: number) {
    this.initialValue = initialValue;
  }

  // Automatically called by the reconciler when styles are parsed
  bindToNode(nodeId: number, property: string) {
    const propOffset = OFFSETS[property as keyof typeof OFFSETS];
    if (propOffset !== undefined) {
      this.nodeId = nodeId;
      this.propertyOffset = propOffset;
      this.index = nodeId * SLAB_SIZE + propOffset;
      this.dirtyIndex = nodeId * SLAB_SIZE + OFFSETS.dirty;

      const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray) {
        sharedFloatArray = new Float32Array(buffer);
      }

      if (sharedFloatArray) {
        sharedFloatArray[this.index] = this.initialValue;
        sharedFloatArray[this.dirtyIndex] = 1.0;
      }
      if (typeof globalObj.__rayactRegisterAnimatedNode === 'function') {
        globalObj.__rayactRegisterAnimatedNode(nodeId, { [property]: this.initialValue });
      }
    }
  }

  get value(): number {
    const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
    if (buffer && !sharedFloatArray) {
      sharedFloatArray = new Float32Array(buffer);
    }
    return (this.index !== -1 && sharedFloatArray) ? sharedFloatArray[this.index] : this.initialValue;
  }

  set value(newValue: number | AnimationConfig) {
    const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
    if (buffer && !sharedFloatArray) {
      sharedFloatArray = new Float32Array(buffer);
    }

    if (typeof newValue === 'number') {
      if (this.fallbackFrameId !== null) {
        cancelAnimationFrame(this.fallbackFrameId);
        this.fallbackFrameId = null;
      }
      this.initialValue = newValue;
      if (this.index !== -1 && sharedFloatArray) {
        sharedFloatArray[this.index] = newValue;
        sharedFloatArray[this.dirtyIndex] = 1.0;
      }
      if (this.nodeId !== null && this.propertyOffset !== -1 && typeof globalObj.__rayactSetAnimatedStyle === 'function') {
        globalObj.__rayactSetAnimatedStyle(this.nodeId, { [this.propertyName()]: newValue });
      }
    } else {
      if (this.index !== -1) {
        if (this.nodeId !== null && this.propertyOffset !== -1 && typeof globalObj.__rayactStartStyleAnimation === 'function') {
          globalObj.__rayactStartStyleAnimation(
            this.nodeId,
            { [this.propertyName()]: newValue.target },
            newValue,
          );
        } else {
          this.runFallbackAnimation(newValue);
        }
      } else {
        // If not bound yet, hold the target as initial value
        this.initialValue = newValue.target;
      }
    }
  }

  private runFallbackAnimation(config: AnimationConfig) {
    if (this.fallbackFrameId !== null) {
      cancelAnimationFrame(this.fallbackFrameId);
    }

    const start = performance.now();
    const fromVal = this.value;
    const diff = config.target - fromVal;

    const step = (timestamp: number) => {
      const elapsed = timestamp - start;
      const t = config.duration <= 0 ? 1 : Math.min(1, elapsed / config.duration);
      
      // Easing: easeInOutCubic curve
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const val = fromVal + diff * eased;

      const buffer = globalObj.__rayactAnimatedStyleBuffer ?? globalObj.__rayactSharedStyleBuffer;
      if (buffer && !sharedFloatArray) {
        sharedFloatArray = new Float32Array(buffer);
      }

      if (this.index !== -1 && sharedFloatArray) {
        sharedFloatArray[this.index] = val;
        sharedFloatArray[this.dirtyIndex] = 1.0;
      } else {
        this.initialValue = val;
      }

      if (t < 1) {
        this.fallbackFrameId = requestAnimationFrame(step);
      } else {
        if (this.index !== -1 && sharedFloatArray) {
          sharedFloatArray[this.index] = config.target;
          sharedFloatArray[this.dirtyIndex] = 1.0;
        } else {
          this.initialValue = config.target;
        }
        this.fallbackFrameId = null;
      }
    };

    this.fallbackFrameId = requestAnimationFrame(step);
  }

  private propertyName(): string {
    switch (this.propertyOffset) {
      case OFFSETS.translateX: return 'translateX';
      case OFFSETS.translateY: return 'translateY';
      case OFFSETS.scale: return 'scale';
      case OFFSETS.opacity: return 'opacity';
      case OFFSETS.rotation: return 'rotation';
      default: return 'opacity';
    }
  }
}

export function useSharedValue(initialValue: number): SharedValue {
  return React.useMemo(() => new SharedValue(initialValue), []);
}
