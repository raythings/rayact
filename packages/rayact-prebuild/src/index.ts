export {
  RAYACT_ENGINE_VERSION,
  RAYACT_MODULE_ABI_VERSION,
  RAYACT_NDK_VERSION,
  RAYACT_REPO,
  PREBUILT_PACKAGES,
  RAYACT_ASSETS_DIR
} from './constants.js';

export {
  hostDesktopKey,
  desktopBinName,
  prebuiltCacheDir,
  prebuiltTarballName,
  checkPrebuiltAbi,
  resolveDesktopBin as resolveDesktopBinPrebuilt,
  downloadReleaseAsset,
  downloadPrebuilt,
  ensureDesktopPrebuilt,
  devAppCacheDir,
  ensureDevApp,
  ensureWebHost
} from './prebuiltHost.js';
export type { DesktopHostKey, ResolvedDesktop, DevAppPlatform } from './prebuiltHost.js';

export type {
  RayactModuleManifest,
  RayactModuleArtifact,
  RayactModulePlatform,
  RayactModuleArchitecture,
  RayactNativeModuleConfig,
  LegacyRayactNativeModuleConfig,
  RayactNativeModuleSelection,
  RayactNativeModuleEntry,
  PrebuiltManifest,
  ResolvedPlugin
} from './types.js';

export {
  resolveRayactPlugins,
  mergeNativeModules,
  selectedPlugins,
  assertModuleCompatibility,
  verifyModuleArtifact,
  readPluginManifest
} from './plugins.js';

export {
  resolvePackageDir,
  readPrebuiltManifest,
  resolvePrebuiltAndroidDir,
  resolvePrebuiltWebDir,
  resolvePrebuiltDarwinDir,
  resolveTemplateAndroidDir,
  resolveTemplateIosDir,
  copyDirRecursive,
  copyMatchingFiles
} from './resolvePrebuilt.js';

export {
  runPrebuild,
  applyAndroidProjectIdentity,
  applyIosProjectIdentity,
  copyAndroidPluginArtifacts,
  copyIosPluginArtifacts,
  copyDesktopPluginArtifacts,
  type PrebuildOptions
} from './prebuild.js';

export {
  DEFAULT_WEB_ENGINE_PORT,
  startCoepStaticServer,
  startCoepDevProxy,
  webDevOpenUrl,
  type CoepServerHandle,
  type CoepStaticServerOptions,
  type CoepDevProxyOptions
} from './webServe.js';
