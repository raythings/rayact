export type RayactModulePlatform = 'android' | 'ios' | 'darwin' | 'linux' | 'windows' | 'web';
export type RayactModuleArchitecture = 'arm64' | 'x86_64' | 'wasm32' | 'universal';

export interface RayactModuleArtifact {
  platform: RayactModulePlatform;
  architecture: RayactModuleArchitecture;
  path: string;
  sha256: string;
}

/** Canonical package-owned native metadata (`rayact.module.json`, schema v1). */
export interface RayactModuleManifest {
  $schema?: string;
  schemaVersion: 1;
  name: string;
  package: string;
  jsEntry: string;
  library: string;
  platforms: RayactModulePlatform[];
  architectures: RayactModuleArchitecture[];
  abiRange: string;
  engineRange: string;
  artifacts: RayactModuleArtifact[];
  linkage: 'dynamic' | 'static' | 'framework';
  permissions: string[];
  configurationSchema: Record<string, unknown>;
  officialDevApp: boolean;
  /**
   * Building this module from source instead of its prebuilt artifact.
   *
   * Published packages ship binaries, so consumers never need these. They matter
   * in a source checkout — the dev app builds first-party modules from source so
   * an edit to a plugin's C++ shows up on the next app build. Paths are relative
   * to the repository root that contains the module's package directory.
   */
  nativeSources?: string[];
  nativeIncludeDirs?: string[];
  /** Compile definitions for nativeSources, e.g. "RAYACT_SVG_USE_GPU_SHIM=1". */
  nativeDefines?: string[];
  /** Sources compiled into the Emscripten host; web has no dynamic loading. */
  webSources?: string[];
}

/** Modern rayact.config.json entry. Installed modules autolink unless disabled. */
export interface RayactNativeModuleConfig {
  package: string;
  enabled?: boolean;
  configuration?: Record<string, unknown>;
}

/** @deprecated Accepted through the 0.0.x stable line for migration only. */
export interface LegacyRayactNativeModuleConfig {
  name: string;
  lib?: string;
  jsPackage?: string;
  platforms?: string[];
  architectures?: string[];
  abiRange?: string;
  permissions?: string[];
  configuration?: Record<string, unknown>;
  officialDevApp?: boolean;
}

export type RayactNativeModuleSelection =
  | string
  | RayactNativeModuleConfig
  | LegacyRayactNativeModuleConfig;

/** Normalized host manifest entry retained for the stable native ABI. */
export interface RayactNativeModuleEntry {
  name: string;
  lib: string;
  jsPackage: string;
  platforms?: string[];
  architectures?: string[];
  abiRange?: string;
  engineRange?: string;
  permissions?: string[];
  configuration?: Record<string, unknown>;
  officialDevApp?: boolean;
}

export interface PrebuiltManifest {
  engineVersion: string;
  moduleAbiVersion: number;
  ndkVersion?: string;
  platform: string;
  arch: string;
  builtAt?: string;
}

export interface ResolvedPlugin {
  name: string;
  lib: string;
  jsPackage: string;
  packageDir: string;
  manifestPath: string;
  manifest: RayactModuleManifest;
}
