import { createTheming } from '@callstack/react-theme-provider';
import type { RayactTheme } from './tokens';
import { darkTheme } from './tokens';

export const {
  ThemeProvider,
  useTheme,
  withTheme
} = createTheming<RayactTheme>(darkTheme);
