export type RayactModulePlatform = 'android' | 'ios' | 'darwin' | 'linux' | 'windows' | 'web';
export type RayactModuleArchitecture = 'arm64' | 'x86_64' | 'wasm32' | 'universal';

export interface RayactModuleArtifact {
  platform: RayactModulePlatform;
  architecture: RayactModuleArchitecture;
  path: string;
  sha256: string;
}

export interface RayactAndroidModule {
  /** Package-relative Gradle library project directory. */
  project?: string;
  /** Fully-qualified class implementing RayactPlatformModuleRegistration. */
  registrationClass?: string;
  /** Maven coordinates added to the application when no Gradle project is used. */
  dependencies?: string[];
  /** Package-relative AndroidManifest.xml fragment merged into the application. */
  manifest?: string;
  /** Package-relative Java/Kotlin source directories compiled by the application. */
  sourceDirs?: string[];
  /** Package-relative Android resource directories. */
  resourceDirs?: string[];
}

export interface RayactIosModule {
  /** Package-relative Swift/Objective-C/C++ source files or directories. */
  sources?: string[];
  /** Swift type conforming to RayactPlatformModuleRegistration. */
  registrationType?: string;
  /** Apple system frameworks linked by the generated application target. */
  frameworks?: string[];
  /** Package-relative resources copied into the application bundle. */
  resources?: string[];
  /** Info.plist keys contributed only while this package is selected. */
  infoPlist?: Record<string, string | number | boolean | string[]>;
}

/** Canonical package-owned native metadata (`rayact.module.json`, schema v1). */
/**
 * Web integration a module contributes — one or both of:
 *
 * `script`: browser JavaScript, staged next to the app and loaded with a <script>
 * tag; registers platform view factories through window.__rayactModuleRegistrations
 * (never touching Module, so its load order relative to the wasm host is free).
 *
 * `sources`: native C/C++ built into an Emscripten SIDE_MODULE
 * (web/wasm32/rayact_<name>.wasm, by scripts/build-web-module-artifacts.sh) that the host
 * dlopens at boot, exactly as desktop dlopens the .dylib. The artifact appears in
 * `artifacts` with platform "web" / architecture "wasm32", which is what staging
 * and the dev server key on.
 */
export interface RayactWebModule {
  /** Package-relative path, e.g. "web/register.js". */
  script?: string;
  /** Repo-relative side-module sources, e.g. "packages/rayact-svg/native/web_register.cpp". */
  sources?: string[];
  /**
   * Defines for the side-module build only. nativeDefines configures the desktop
   * dylib and is deliberately not inherited (RAYACT_SVG_USE_GPU_SHIM is right for
   * every dynamically loaded artifact, wrong for the statically linked iOS build).
   */
  defines?: string[];
  /** @deprecated The side module exports rayact_module_register instead. Ignored. */
  register?: string;
}

export interface RayactModuleManifest {
  $schema?: string;
  schemaVersion: 1;
  name: string;
  package: string;
  jsEntry: string;
  library: string;
  /** False for platform-only packages that do not publish a C ABI module. */
  nativeBus?: boolean;
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
  /** @deprecated No consumer reads this. Use `web.script` for browser code. */
  webSources?: string[];
  /** Optional browser integration owned by this package. */
  web?: RayactWebModule;
  /** Optional Android UI/platform integration owned by this package. */
  android?: RayactAndroidModule;
  /** Optional iOS UI/platform integration owned by this package. */
  ios?: RayactIosModule;
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
  nativeBus?: boolean;
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
