import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider } from './theming.js';
import { useIsDarkColorScheme } from './colorSchemeStore.js';
import { getNativeTheme, lerpTheme, type RayactTheme } from './tokens.js';
import { useAnimatedValue } from '../anim/useAnimatedValue.js';

/**
 * Mount-keyed blender so each scheme change animates 0→1 from the previous
 * palette. Reusing a single useAnimatedValue across changes left progress at 0
 * (or stalled mid-rAF) and kept title/nav colours on the old scheme until a
 * navigation remount forced a fresh tree.
 */
function ThemeBlend({
  from,
  to,
  onSettled,
  children,
}: {
  from: RayactTheme;
  to: RayactTheme;
  onSettled: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const progress = useAnimatedValue(1, { duration: 350, from: 0, onSettled });
  const theme = useMemo(() => lerpTheme(from, to, progress), [from, to, progress]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

export function RayactThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const isDark = useIsDarkColorScheme();
  const targetTheme = useMemo(() => getNativeTheme(isDark), [isDark]);
  const stableThemeRef = useRef(targetTheme);
  const [blend, setBlend] = useState<{ from: RayactTheme; to: RayactTheme } | null>(null);

  useEffect(() => {
    if (stableThemeRef.current.dark === targetTheme.dark) {
      stableThemeRef.current = targetTheme;
      return;
    }
    const from = stableThemeRef.current;
    stableThemeRef.current = targetTheme;
    setBlend({ from, to: targetTheme });
  }, [targetTheme]);

  if (blend) {
    return (
      <ThemeBlend
        key={blend.to.dark ? 'to-dark' : 'to-light'}
        from={blend.from}
        to={blend.to}
        onSettled={() => setBlend(null)}
      >
        {children}
      </ThemeBlend>
    );
  }

  return <ThemeProvider theme={targetTheme}>{children}</ThemeProvider>;
}
