export interface DevLauncherTheme {
  primary?: string;
  primaryDark?: string;
  background?: string;
  surface?: string;
  surfaceContainer?: string;
  onSurface?: string;
  onSurfaceVariant?: string;
  secondaryContainer?: string;
  onSecondaryContainer?: string;
  isDark?: boolean;
}

export const FALLBACK_THEME: DevLauncherTheme = {
  surface: '#121212',
  surfaceContainer: '#1e1e1e',
  primary: '#80cbc4',
  primaryDark: '#4db6ac',
  background: '#121212',
  onSurface: '#ffffff',
  onSurfaceVariant: '#b0b0b0',
  secondaryContainer: '#1a3538',
  onSecondaryContainer: '#80cbc4',
  isDark: true,
};

export const LIGHT_FALLBACK: DevLauncherTheme = {
  surface: '#f5f5f5',
  surfaceContainer: '#e8e8e8',
  primary: '#007aff',
  primaryDark: '#0051d5',
  background: '#ffffff',
  onSurface: '#000000',
  onSurfaceVariant: '#6b6b6b',
  secondaryContainer: '#cce8e5',
  onSecondaryContainer: '#005f5a',
  isDark: false,
};

export function resolveTheme(theme: DevLauncherTheme | null | undefined): DevLauncherTheme {
  if (theme == null) return FALLBACK_THEME;
  return {
    surface: theme.surface ?? FALLBACK_THEME.surface,
    surfaceContainer: theme.surfaceContainer ?? FALLBACK_THEME.surfaceContainer,
    primary: theme.primary ?? FALLBACK_THEME.primary,
    primaryDark: theme.primaryDark ?? FALLBACK_THEME.primaryDark,
    background: theme.background ?? FALLBACK_THEME.background,
    onSurface: theme.onSurface ?? FALLBACK_THEME.onSurface,
    onSurfaceVariant: theme.onSurfaceVariant ?? FALLBACK_THEME.onSurfaceVariant,
    secondaryContainer: theme.secondaryContainer ?? FALLBACK_THEME.secondaryContainer,
    onSecondaryContainer: theme.onSecondaryContainer ?? FALLBACK_THEME.onSecondaryContainer,
    isDark: theme.isDark ?? FALLBACK_THEME.isDark,
  };
}

export function hexToRayactColor(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

export function themeColors(theme: DevLauncherTheme | null | undefined) {
  const t = resolveTheme(theme);
  return {
    surface: hexToRayactColor(t.surface!),
    surfaceContainer: hexToRayactColor(t.surfaceContainer!),
    primary: hexToRayactColor(t.primary!),
    onSurface: hexToRayactColor(t.onSurface!),
    onSurfaceVariant: hexToRayactColor(t.onSurfaceVariant!),
    onPrimary: hexToRayactColor(t.isDark ? '#121212' : '#ffffff'),
    error: hexToRayactColor('#ef4444'),
    online: hexToRayactColor('#22c55e'),
    offline: hexToRayactColor('#ef4444'),
    checking: hexToRayactColor('#737373'),
    mismatch: hexToRayactColor('#f59e0b'),
    isDark: t.isDark ?? true,
  };
}
