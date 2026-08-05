import React, { useMemo } from 'react';
import { ThemeProvider } from './theming.js';
import { useIsDarkColorScheme } from './colorSchemeStore.js';
import { getNativeTheme } from './tokens.js';

/**
 * Publishes the active native colour scheme to React. Material surfaces and
 * nav indicators refresh in-place via native `refreshStylesForColorScheme`
 * (raym3_bridge); this provider only feeds `useTheme()` consumers so their
 * explicit Text/Icon colours update without remounting the tree.
 */
export function RayactThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const isDark = useIsDarkColorScheme();
  const theme = useMemo(() => getNativeTheme(isDark), [isDark]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
