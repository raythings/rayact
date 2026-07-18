import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider } from './theming.js';
import { useColorScheme } from './colorSchemeStore.js';
import { getNativeTheme, lerpTheme, type RayactTheme } from './tokens.js';
import { useAnimatedValue } from '../anim/useAnimatedValue.js';

export function RayactThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const isDark = useColorScheme();
  const targetTheme = useMemo(() => getNativeTheme(isDark), [isDark]);
  const stableThemeRef = useRef(targetTheme);
  const [blend, setBlend] = useState<{ from: RayactTheme; to: RayactTheme } | null>(null);
  const progress = useAnimatedValue(blend ? 1 : 0, { duration: blend ? 350 : 0 });

  useEffect(() => {
    if (stableThemeRef.current.dark === targetTheme.dark) {
      stableThemeRef.current = targetTheme;
      return;
    }
    setBlend({ from: stableThemeRef.current, to: targetTheme });
  }, [targetTheme]);

  useEffect(() => {
    if (!blend || progress < 1) return;
    stableThemeRef.current = blend.to;
    setBlend(null);
  }, [blend, progress]);

  const displayTheme = useMemo(() => {
    if (!blend) return targetTheme;
    return lerpTheme(blend.from, blend.to, progress);
  }, [blend, targetTheme, progress]);

  return <ThemeProvider theme={displayTheme}>{children}</ThemeProvider>;
}
