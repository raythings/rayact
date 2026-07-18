import React from 'react';
import { darkTheme } from './tokens.js';
import type { RayactTheme } from './tokens.js';

const ThemeContext = React.createContext<RayactTheme>(darkTheme);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: RayactTheme;
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): RayactTheme {
  return React.useContext(ThemeContext);
}

export function withTheme<TProps extends { theme: RayactTheme }>(
  Component: React.ComponentType<TProps>,
) {
  return function ThemeWrapped(props: Omit<TProps, 'theme'>): React.ReactElement {
    const theme = useTheme();
    return React.createElement(Component, { ...(props as TProps), theme });
  };
}

