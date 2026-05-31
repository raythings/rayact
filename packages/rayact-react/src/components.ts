import React from 'react';
import type { BaseProps, ButtonProps, IconProps, ImageProps, TextProps } from './types';

export function View(props: BaseProps): React.ReactElement {
  return React.createElement('rayact-view', props);
}

export function Text(props: TextProps): React.ReactElement {
  return React.createElement('rayact-text', props);
}

export function Button(props: ButtonProps): React.ReactElement {
  return React.createElement('rayact-button', props);
}

export function Image(props: ImageProps): React.ReactElement {
  return React.createElement('rayact-image', props);
}

export function Icon(props: IconProps): React.ReactElement {
  return React.createElement('rayact-icon', props);
}
