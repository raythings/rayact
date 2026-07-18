/**
 * App identity + bundled-module metadata for every Rayact dev client.
 *
 * The bundler injects these via __RAYACT_OFFICIAL_APP__ and
 * __RAYACT_BUNDLED_MODULES__. Name and modules come from rayact.config.json;
 * the official app supplements the shared shape with credit/resource links.
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
    if (typeof __RAYACT_BUNDLED_MODULES__ === 'undefined' || !Array.isArray(__RAYACT_BUNDLED_MODULES__)) {
      return [];
    }
    const normalized: BundledModule[] = [];
    for (const item of __RAYACT_BUNDLED_MODULES__ as unknown[]) {
      if (typeof item === 'string' && item) {
        normalized.push({ name: item, jsPackage: item });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const module = item as Record<string, unknown>;
      const name = typeof module.name === 'string' ? module.name : '';
      if (!name) continue;
      normalized.push({
        name,
        lib: typeof module.lib === 'string' ? module.lib : undefined,
        jsPackage: typeof module.jsPackage === 'string' ? module.jsPackage : undefined,
      });
    }
    return normalized;
  } catch {
    return [];
  }
}

export function getBundledModuleNames(): string[] {
  return getBundledModules().map(m => m.name);
}
