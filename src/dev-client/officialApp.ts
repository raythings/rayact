/**
 * Branding + bundled-module metadata for a prebuilt dev app (Expo-Go-style).
 *
 * The dev-app build pipeline injects these via bundler defines
 * (__RAYACT_OFFICIAL_APP__ / __RAYACT_BUNDLED_MODULES__), sourced from the app's
 * official-app.json and rayact.config.json nativeModules. A normal app build
 * leaves them empty, so the launcher falls back to generic Rayact branding.
 */

export interface OfficialAppLink {
  id: string;
  icon?: string;
  set?: string;
  label: string;
  url: string;
}

export interface OfficialApp {
  displayName?: string;
  packageLabel?: string;
  source?: string;
  androidPackageId?: string;
  creditTitle?: string;
  links?: OfficialAppLink[];
}

export interface BundledModule {
  name: string;
  lib?: string;
  jsPackage?: string;
}

declare const __RAYACT_OFFICIAL_APP__: OfficialApp | undefined;
declare const __RAYACT_BUNDLED_MODULES__: BundledModule[] | undefined;

export function getOfficialApp(): OfficialApp {
  try {
    return typeof __RAYACT_OFFICIAL_APP__ !== 'undefined' && __RAYACT_OFFICIAL_APP__
      ? __RAYACT_OFFICIAL_APP__
      : {};
  } catch {
    return {};
  }
}

export function getBundledModules(): BundledModule[] {
  try {
    return typeof __RAYACT_BUNDLED_MODULES__ !== 'undefined' && Array.isArray(__RAYACT_BUNDLED_MODULES__)
      ? __RAYACT_BUNDLED_MODULES__
      : [];
  } catch {
    return [];
  }
}

export function getBundledModuleNames(): string[] {
  return getBundledModules().map(m => m.name);
}
