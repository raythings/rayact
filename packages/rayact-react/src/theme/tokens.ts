import type { ColorValue } from '../types.js';

export interface RayactTheme {
  dark: boolean;
  primary: ColorValue;
  onPrimary: ColorValue;
  primaryContainer: ColorValue;
  onPrimaryContainer: ColorValue;
  secondary: ColorValue;
  onSecondary: ColorValue;
  secondaryContainer: ColorValue;
  onSecondaryContainer: ColorValue;
  tertiary: ColorValue;
  onTertiary: ColorValue;
  tertiaryContainer: ColorValue;
  onTertiaryContainer: ColorValue;
  error: ColorValue;
  onError: ColorValue;
  errorContainer: ColorValue;
  onErrorContainer: ColorValue;
  surface: ColorValue;
  onSurface: ColorValue;
  surfaceVariant: ColorValue;
  onSurfaceVariant: ColorValue;
  surfaceContainerLowest: ColorValue;
  surfaceContainerLow: ColorValue;
  surfaceContainer: ColorValue;
  surfaceContainerHigh: ColorValue;
  surfaceContainerHighest: ColorValue;
  outline: ColorValue;
  outlineVariant: ColorValue;
  shadow: ColorValue;
  scrim: ColorValue;
  inverseSurface: ColorValue;
  inverseOnSurface: ColorValue;
  inversePrimary: ColorValue;
}

export interface NativeColorScheme extends Omit<RayactTheme, 'dark'> {
  isDark: boolean;
}

const COLOR_ROLES: (keyof Omit<RayactTheme, 'dark'>)[] = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant', 'shadow', 'scrim',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary'
];

function pack(r: number, g: number, b: number, a = 255): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function buildTheme(dark: boolean, colors: Record<string, [number, number, number, number?]>): RayactTheme {
  const theme = { dark } as RayactTheme;
  for (const role of COLOR_ROLES) {
    const c = colors[role];
    theme[role] = c ? pack(c[0], c[1], c[2], c[3] ?? 255) : 0xff0000ff;
  }
  return theme;
}

export const lightTheme: RayactTheme = buildTheme(false, {
  primary: [103, 80, 164],
  onPrimary: [255, 255, 255],
  primaryContainer: [234, 221, 255],
  onPrimaryContainer: [33, 0, 93],
  secondary: [98, 91, 113],
  onSecondary: [255, 255, 255],
  secondaryContainer: [232, 222, 248],
  onSecondaryContainer: [30, 25, 43],
  tertiary: [125, 82, 96],
  onTertiary: [255, 255, 255],
  tertiaryContainer: [255, 216, 228],
  onTertiaryContainer: [55, 11, 30],
  error: [186, 26, 26],
  onError: [255, 255, 255],
  errorContainer: [255, 218, 214],
  onErrorContainer: [65, 0, 2],
  surface: [255, 251, 254],
  onSurface: [28, 27, 31],
  surfaceVariant: [231, 224, 236],
  onSurfaceVariant: [73, 69, 79],
  surfaceContainerLowest: [255, 255, 255],
  surfaceContainerLow: [247, 242, 250],
  surfaceContainer: [243, 237, 247],
  surfaceContainerHigh: [236, 230, 240],
  surfaceContainerHighest: [230, 224, 233],
  outline: [121, 116, 126],
  outlineVariant: [196, 199, 197],
  shadow: [0, 0, 0],
  scrim: [0, 0, 0],
  inverseSurface: [49, 48, 51],
  inverseOnSurface: [244, 239, 244],
  inversePrimary: [208, 188, 255]
});

export const darkTheme: RayactTheme = buildTheme(true, {
  primary: [208, 188, 255],
  onPrimary: [56, 30, 114],
  primaryContainer: [79, 55, 139],
  onPrimaryContainer: [234, 221, 255],
  secondary: [204, 194, 220],
  onSecondary: [51, 45, 65],
  secondaryContainer: [74, 68, 88],
  onSecondaryContainer: [232, 222, 248],
  tertiary: [239, 184, 200],
  onTertiary: [73, 37, 50],
  tertiaryContainer: [99, 59, 72],
  onTertiaryContainer: [255, 216, 228],
  error: [255, 180, 171],
  onError: [105, 0, 5],
  errorContainer: [147, 0, 10],
  onErrorContainer: [255, 218, 214],
  surface: [28, 27, 31],
  onSurface: [230, 225, 229],
  surfaceVariant: [73, 69, 79],
  onSurfaceVariant: [202, 196, 208],
  surfaceContainerLowest: [15, 13, 19],
  surfaceContainerLow: [29, 27, 32],
  surfaceContainer: [33, 31, 38],
  surfaceContainerHigh: [43, 41, 48],
  surfaceContainerHighest: [54, 52, 59],
  outline: [147, 143, 153],
  outlineVariant: [73, 69, 79],
  shadow: [0, 0, 0],
  scrim: [0, 0, 0],
  inverseSurface: [230, 225, 229],
  inverseOnSurface: [49, 48, 51],
  inversePrimary: [103, 80, 164]
});

export function themeFromNativeScheme(scheme: NativeColorScheme): RayactTheme {
  const theme = { dark: scheme.isDark } as RayactTheme;
  for (const role of COLOR_ROLES) {
    const value = scheme[role as keyof NativeColorScheme];
    theme[role] = typeof value === 'number' ? value : darkTheme[role];
  }
  return theme;
}

export function getNativeTheme(fallbackDark?: boolean): RayactTheme {
  const g = globalThis as {
    __rayactGetColorScheme?: () => NativeColorScheme;
  };
  if (typeof g.__rayactGetColorScheme === 'function') {
    try {
      const scheme = g.__rayactGetColorScheme();
      if (scheme && typeof scheme.isDark === 'boolean') {
        return themeFromNativeScheme(scheme);
      }
    } catch {
      // fall through to static fallback
    }
  }
  const dark = fallbackDark ?? true;
  return dark ? darkTheme : lightTheme;
}

export function lerpPackedColor(from: number, to: number, t: number): number {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const fr = (from >>> 24) & 0xff;
  const fg = (from >>> 16) & 0xff;
  const fb = (from >>> 8) & 0xff;
  const fa = from & 0xff;
  const tr = (to >>> 24) & 0xff;
  const tg = (to >>> 16) & 0xff;
  const tb = (to >>> 8) & 0xff;
  const ta = to & 0xff;
  return (
    (clamp(fr + (tr - fr) * t) << 24) |
    (clamp(fg + (tg - fg) * t) << 16) |
    (clamp(fb + (tb - fb) * t) << 8) |
    clamp(fa + (ta - fa) * t)
  ) >>> 0;
}

export function lerpTheme(from: RayactTheme, to: RayactTheme, t: number): RayactTheme {
  const result = { ...to, dark: t >= 0.5 ? to.dark : from.dark } as RayactTheme;
  for (const role of COLOR_ROLES) {
    const a = from[role];
    const b = to[role];
    if (typeof a === 'number' && typeof b === 'number') {
      result[role] = lerpPackedColor(a, b, t);
    } else {
      result[role] = t >= 0.5 ? b : a;
    }
  }
  return result;
}

export { COLOR_ROLES };
