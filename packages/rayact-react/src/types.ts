import type React from 'react';
import type { HostBridge, HostNode, HostNodeType, RayactRuntime } from '@rayact/runtime';

export type RayactElementType = 'View' | 'Text' | 'Button' | 'Image' | 'Icon' | HostNodeType;

export interface RayactHostInstance {
  kind: 'instance';
  type: HostNodeType;
  node: HostNode;
  props: Record<string, unknown>;
  parent?: RayactHostInstance | RayactContainer;
  children: Array<RayactHostInstance | RayactTextInstance>;
}

export interface RayactTextInstance {
  kind: 'text';
  text: string;
  parent?: RayactHostInstance | RayactContainer;
}

export interface RayactContainer {
  kind: 'container';
  rootNode: HostNode;
  bridge: HostBridge;
  runtime: RayactRuntime;
  children: Array<RayactHostInstance | RayactTextInstance>;
}

export interface RayactRoot {
  readonly container: RayactContainer;
  render(element: React.ReactNode): void;
  unmount(): void;
}

export interface BaseProps {
  children?: React.ReactNode;
  className?: string;
  style?: Record<string, unknown>;
  onPress?: () => void;
  onClick?: () => void;
}

export interface TextProps extends BaseProps {
  text?: string;
}

export interface ButtonProps extends BaseProps {
  label?: string;
  text?: string;
}

export interface ImageProps extends BaseProps {
  src: string;
}

export interface IconProps extends BaseProps {
  name?: string;
  icon?: string;
  size?: number;
  color?: number;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      View: BaseProps;
      Text: TextProps;
      Button: ButtonProps;
      Image: ImageProps;
      Icon: IconProps;
      'rayact-view': BaseProps;
      'rayact-text': TextProps;
      'rayact-button': ButtonProps;
      'rayact-image': ImageProps;
      'rayact-icon': IconProps;
    }
  }
}
