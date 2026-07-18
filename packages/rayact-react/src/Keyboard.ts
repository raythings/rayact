import { useEffect, useRef } from 'react';
import type { AutoCapitalize, KeyboardType, ReturnKeyType } from './types.js';

export interface KeyboardKeyEvent<T extends 'keyDown' | 'keyUp' = 'keyDown' | 'keyUp'> {
  type: T;
  key: string;
  code?: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface KeyboardTextInputEvent {
  type: 'textInput';
  text: string;
}

export type RayactKeyboardEvent =
  | KeyboardKeyEvent<'keyDown'>
  | KeyboardKeyEvent<'keyUp'>
  | KeyboardTextInputEvent;
export type KeyboardEventType = RayactKeyboardEvent['type'];
export type KeyboardEventListener<T extends KeyboardEventType = KeyboardEventType> =
  (event: Extract<RayactKeyboardEvent, { type: T }>) => void;

export interface KeyboardCaptureOptions {
  keyboardType?: KeyboardType;
  returnKeyType?: ReturnKeyType;
  autoCapitalize?: AutoCapitalize;
  autoCorrect?: boolean;
}

export interface KeyboardSubscription {
  remove(): void;
}

type KeyboardHandlers = Partial<{
  [T in KeyboardEventType]: KeyboardEventListener<T>;
}>;

type KeyboardGlobals = typeof globalThis & {
  __rayactKeyboardCapture?: (options: KeyboardCaptureOptions) => void;
  __rayactKeyboardDismiss?: () => void;
  __rayactDrainKeyEvents?: (events: RayactKeyboardEvent[]) => void;
};

const listeners: {
  [T in KeyboardEventType]: Set<KeyboardEventListener<T>>;
} = {
  keyDown: new Set(),
  keyUp: new Set(),
  textInput: new Set(),
};

let captureCount = 0;

function addEventListener<T extends KeyboardEventType>(
  type: T,
  listener: KeyboardEventListener<T>,
): KeyboardSubscription {
  const set = listeners[type] as Set<KeyboardEventListener<T>>;
  set.add(listener);
  let removed = false;
  return {
    remove() {
      if (removed) return;
      removed = true;
      set.delete(listener);
    },
  };
}

function captureTextInput(options: KeyboardCaptureOptions = {}): KeyboardSubscription {
  captureCount += 1;
  (globalThis as KeyboardGlobals).__rayactKeyboardCapture?.(options);
  let removed = false;
  return {
    remove() {
      if (removed) return;
      removed = true;
      captureCount = Math.max(0, captureCount - 1);
      if (captureCount === 0) (globalThis as KeyboardGlobals).__rayactKeyboardDismiss?.();
    },
  };
}

function dismiss(): void {
  captureCount = 0;
  (globalThis as KeyboardGlobals).__rayactKeyboardDismiss?.();
}

function drainKeyEvents(events: RayactKeyboardEvent[]): void {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (!event || !listeners[event.type]) continue;
    for (const listener of [...listeners[event.type]] as KeyboardEventListener[]) {
      try {
        listener(event as never);
      } catch (error) {
        console.warn('[Keyboard] listener threw:', error);
      }
    }
  }
}

(globalThis as KeyboardGlobals).__rayactDrainKeyEvents = drainKeyEvents;

export const Keyboard = {
  addEventListener,
  captureTextInput,
  dismiss,
};

export interface UseKeyboardEventsOptions extends KeyboardCaptureOptions {
  enabled?: boolean;
  captureTextInput?: boolean;
}

export function useKeyboardEvents(
  handlers: KeyboardHandlers,
  options: UseKeyboardEventsOptions = {},
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const enabled = options.enabled ?? true;
  const shouldCapture = options.captureTextInput ?? false;

  useEffect(() => {
    if (!enabled) return;
    const subscriptions = (['keyDown', 'keyUp', 'textInput'] as const)
      .filter(type => handlersRef.current[type])
      .map(type => Keyboard.addEventListener(type, event => {
        const handler = handlersRef.current[type] as KeyboardEventListener<typeof type> | undefined;
        handler?.(event);
      }));
    const capture = shouldCapture
      ? Keyboard.captureTextInput({
          keyboardType: options.keyboardType,
          returnKeyType: options.returnKeyType,
          autoCapitalize: options.autoCapitalize,
          autoCorrect: options.autoCorrect,
        })
      : undefined;
    return () => {
      for (const subscription of subscriptions) subscription.remove();
      capture?.remove();
    };
  }, [
    enabled,
    shouldCapture,
    options.keyboardType,
    options.returnKeyType,
    options.autoCapitalize,
    options.autoCorrect,
  ]);
}
