import fs from 'node:fs';
import path from 'node:path';
import { RAYACT_ASSETS_DIR } from './constants.js';
import {
  mergeNativeModules,
  resolveRayactPlugins,
  selectedPlugins,
  verifyModuleArtifact,
} from './plugins.js';
import {
  copyDirRecursive,
  copyMatchingFiles,
  resolvePrebuiltAndroidDir,
  resolvePackageDir,
  resolveTemplateAndroidDir,
  resolveTemplateIosDir
} from './resolvePrebuilt.js';
import { downloadPrebuilt, prebuiltCacheDir } from './prebuiltHost.js';
import type { RayactNativeModuleEntry, RayactNativeModuleSelection } from './types.js';

export interface PrebuildOptions {
  projectRoot: string;
  /** Cross-platform display name. Falls back to legacy android.appName. */
  appName?: string;
  devClient?: boolean;
  configNativeModules?: RayactNativeModuleSelection[];
  android?: {
    projectDir?: string;
    packageName?: string;
    appName?: string;
  };
  ios?: {
    projectDir?: string;
    bundleId?: string;
  };
  /** When false, refuse to overwrite existing android/ios trees (monorepo safety). */
  force?: boolean;
}

function replaceInFile(filePath: string, replacements: Record<string, string>): void {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(filePath, content);
}

/** Apply consumer identity on every prebuild, including an existing native tree. */
export function applyAndroidProjectIdentity(
  androidDir: string,
  packageName: string,
  appName: string
): void {
  const gradlePath = path.join(androidDir, 'app/build.gradle');
  if (fs.existsSync(gradlePath)) {
    const gradle = fs.readFileSync(gradlePath, 'utf8').replace(
      /(\bapplicationId\s+)(['"])[^'"]+\2/,
      `$1'${packageName}'`
    );
    fs.writeFileSync(gradlePath, gradle);
  }
  const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8')
      .replace(
        /android:label="[^"]*"/,
        `android:label="${appName.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!)}"`
      )
      .replace('android:name=".DevLauncherActivity"', 'android:name="com.rayact.app.DevLauncherActivity"');
    fs.writeFileSync(manifestPath, manifest);
  }
}

/** Apply the public iOS identity while keeping the internal target name filesystem-safe. */
export function applyIosProjectIdentity(
  iosDir: string,
  bundleId: string,
  appName: string
): void {
  const targetName = appName.replace(/[^A-Za-z0-9_]/g, '') || 'RayactIOS';
  replaceInFile(path.join(iosDir, 'project.yml'), {
    'com.rayact.app': bundleId,
    'RayactIOS': targetName
  });
  const escapedAppName = appName.replace(
    /[&<>]/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!
  );
  for (const plist of ['Info.plist', 'Info-Release.plist']) {
    replaceInFile(path.join(iosDir, plist), {
      '<string>__RAYACT_APP_NAME__</string>': `<string>${escapedAppName}</string>`
    });
  }
}

async function copyAndroidPrebuilts(
  projectRoot: string,
  androidDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): Promise<void> {
  // Installed package (monorepo / explicit dep) first, then the per-user cache,
  // downloading the engine tarball from the GitHub release when neither exists —
  // consumers install nothing natively; the engine arrives prebuilt.
  let prebuiltDir = resolvePrebuiltAndroidDir(projectRoot);
  if (!prebuiltDir || !fs.existsSync(path.join(prebuiltDir, 'jni/arm64-v8a'))) {
    const cached = prebuiltCacheDir(undefined, 'android-arm64');
    prebuiltDir = fs.existsSync(path.join(cached, 'jni/arm64-v8a'))
      ? cached
      : await downloadPrebuilt('android-arm64');
  }

  const copyEngineVariant = (
    packageDir: string,
    abi: 'arm64-v8a' | 'x86_64',
    variant: 'debug' | 'release'
  ) => {
    // `jni/` remains the release payload for compatibility with 0.0.2 and
    // direct package consumers. Development clients must use the separately
    // compiled host: release-host engines intentionally omit synchronous dev
    // fetch, HMR, and the native DevTools entry points.
    const packageSubdir = variant === 'debug' ? 'jni-debug' : 'jni';
    const source = path.join(packageDir, packageSubdir, abi);
    if (!fs.existsSync(source)) {
      throw new Error(
        `@rayact/prebuilt-android-${abi === 'x86_64' ? 'x64' : 'arm64'} is missing ` +
          `${packageSubdir}/${abi}. Reinstall matching Rayact 0.0.3 packages; ` +
          'a release-host librayact.so cannot run a development client.'
      );
    }
    const destination = path.join(androidDir, `app/src/${variant}/jniLibs`, abi);
    fs.mkdirSync(destination, { recursive: true });
    copyMatchingFiles(source, destination, /\.so$/);
  };

  // Remove the pre-0.0.3 layout. Leaving a release-host engine in `main`
  // causes Gradle to pick it for Debug and the launcher crashes as soon as it
  // opens a project.
  for (const abi of ['arm64-v8a', 'x86_64'] as const) {
    for (const name of ['librayact.so', 'libc++_shared.so']) {
      fs.rmSync(path.join(androidDir, 'app/src/main/jniLibs', abi, name), { force: true });
    }
  }

  copyEngineVariant(prebuiltDir, 'arm64-v8a', 'debug');
  copyEngineVariant(prebuiltDir, 'arm64-v8a', 'release');

  const x64Package = resolvePrebuiltAndroidDir(projectRoot, 'x64');
  const x64Cache = prebuiltCacheDir(undefined, 'android-x64');
  const x64Source = x64Package && fs.existsSync(path.join(x64Package, 'jni/x86_64'))
    ? x64Package
    : fs.existsSync(path.join(x64Cache, 'jni/x86_64')) ? x64Cache : null;
  if (x64Source) {
    copyEngineVariant(x64Source, 'x86_64', 'debug');
    copyEngineVariant(x64Source, 'x86_64', 'release');
  }

  copyAndroidPluginArtifacts(androidDir, plugins);
}

export function copyAndroidPluginArtifacts(
  androidDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  for (const plugin of plugins) {
    for (const artifact of plugin.manifest.artifacts.filter(item => item.platform === 'android')) {
      const abi = artifact.architecture === 'x86_64' ? 'x86_64' : 'arm64-v8a';
      const jniDest = path.join(androidDir, 'app/src/main/jniLibs', abi);
      fs.mkdirSync(jniDest, { recursive: true });
      const source = verifyModuleArtifact(plugin, artifact);
      fs.copyFileSync(source, path.join(jniDest, path.basename(source)));
    }
  }
}

function writeNativeModulesManifest(
  projectRoot: string,
  modules: RayactNativeModuleEntry[]
): void {
  const assetsDir = path.join(projectRoot, RAYACT_ASSETS_DIR, 'runtime');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(
    path.join(assetsDir, 'native-modules.json'),
    JSON.stringify({ nativeModules: modules }, null, 2) + '\n'
  );
}

export function copyIosPluginArtifacts(
  iosDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const dependencies: string[] = [];
  for (const plugin of plugins) {
    for (const artifact of plugin.manifest.artifacts.filter(item => item.platform === 'ios')) {
      const source = verifyModuleArtifact(plugin, artifact);
      const entryName = path.basename(source);
      const destination = path.join(iosDir, 'Frameworks/Modules', entryName);
      if (fs.statSync(source).isDirectory()) copyDirRecursive(source, destination);
      else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
      dependencies.push(`      - framework: Frameworks/Modules/${entryName}\n        embed: false`);
    }
  }
  if (!dependencies.length) return;
  const projectFile = path.join(iosDir, 'project.yml');
  const marker = '    # RAYACT_AUTOLINKED_MODULES';
  replaceInFile(projectFile, { [marker]: `${dependencies.join('\n')}\n${marker}` });
}

/**
 * The generic iOS engine must not reference optional module symbols. Generate
 * the application-owned registration entry point from the selected installed
 * packages instead, so an unselected module has no binary or registration in
 * the final app.
 */
export function writeIosModuleRegistry(
  iosDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const declarations = plugins
    .map(plugin => `extern "C" int ${plugin.manifest.library}_register(const RayactHost* host);`)
    .join('\n');
  const calls = plugins
    .map(plugin => `    { const int rc = ${plugin.manifest.library}_register(host); if (rc != 0) return rc; }`)
    .join('\n');
  const source = `struct RayactHost;\n\n${declarations}${declarations ? '\n\n' : '\n'}extern "C" int rayact_module_register(const RayactHost* host) {\n${calls}${calls ? '\n' : ''}    return 0;\n}\n`;
  fs.writeFileSync(path.join(iosDir, 'RayactModules.mm'), source);
}

export function copyDesktopPluginArtifacts(
  projectRoot: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform;
  const arch = process.arch === 'x64' ? 'x86_64' : 'arm64';
  const destination = path.join(projectRoot, RAYACT_ASSETS_DIR, 'modules');
  for (const plugin of plugins) {
    for (const artifact of plugin.manifest.artifacts.filter(
      item => item.platform === platform && item.architecture === arch
    )) {
      const source = verifyModuleArtifact(plugin, artifact);
      fs.mkdirSync(destination, { recursive: true });
      fs.copyFileSync(source, path.join(destination, path.basename(source)));
    }
  }
}

export async function runPrebuild(options: PrebuildOptions): Promise<{
  androidDir: string | null;
  iosDir: string | null;
  nativeModules: RayactNativeModuleEntry[];
}> {
  const { projectRoot } = options;
  const plugins = resolveRayactPlugins(projectRoot);
  const nativeModules = mergeNativeModules(options.configNativeModules, plugins);
  const enabledPlugins = selectedPlugins(nativeModules, plugins);

  const androidRel = options.android?.projectDir ?? 'android';
  const iosRel = options.ios?.projectDir ?? 'ios';
  const androidDir = path.resolve(projectRoot, androidRel);
  const iosDir = path.resolve(projectRoot, iosRel);

  const isMonorepoEngineAndroid = (dir: string) =>
    fs.existsSync(path.join(dir, 'app/src/main/cpp/CMakeLists.txt'));

  if (fs.existsSync(androidDir) && isMonorepoEngineAndroid(androidDir) && !options.force) {
    throw new Error(
      `Refusing to overwrite engine Android project at ${androidDir}. ` +
        'Use android.projectDir under your app root (e.g. "./android") or pass force: true.'
    );
  }

  const isMonorepoEngineIos = (dir: string) => {
    const yml = path.join(dir, 'project.yml');
    if (!fs.existsSync(yml)) return false;
    try {
      return fs.readFileSync(yml, 'utf8').includes('../../native/desktop');
    } catch {
      return false;
    }
  };

  if (fs.existsSync(iosDir) && isMonorepoEngineIos(iosDir) && !options.force) {
    throw new Error(
      `Refusing to overwrite engine iOS project at ${iosDir}. ` +
        'Use ios.projectDir under your app root (e.g. "./ios") or pass force: true.'
    );
  }

  const templateAndroid = resolveTemplateAndroidDir(projectRoot);
  if (!templateAndroid) {
    throw new Error('Missing @rayact/template-android package.');
  }

  const packageName = options.android?.packageName ?? 'com.rayact.app';
  const appName = options.appName?.trim() || options.android?.appName?.trim() || 'Rayact';
  const devClient = options.devClient !== false;

  if (fs.existsSync(androidDir) && !options.force && fs.existsSync(path.join(androidDir, 'gradlew'))) {
    console.warn(`Updating prebuilt jniLibs in existing Android project: ${androidDir}`);
    await copyAndroidPrebuilts(projectRoot, androidDir, enabledPlugins);
  } else {
    if (fs.existsSync(androidDir)) {
      fs.rmSync(androidDir, { recursive: true, force: true });
    }
    copyDirRecursive(templateAndroid, androidDir);
    if (!devClient) {
      replaceInFile(path.join(androidDir, 'app/build.gradle'), {
        'buildConfigField "boolean", "RAYACT_DEV_CLIENT", "true"':
          'buildConfigField "boolean", "RAYACT_DEV_CLIENT", "false"'
      });
    }
    await copyAndroidPrebuilts(projectRoot, androidDir, enabledPlugins);
  }
  applyAndroidProjectIdentity(androidDir, packageName, appName);

  const templateIos = resolveTemplateIosDir(projectRoot);
  if (templateIos) {
    if (fs.existsSync(iosDir)) {
      fs.rmSync(iosDir, { recursive: true, force: true });
    }
    copyDirRecursive(templateIos, iosDir);
    const bundleId = options.ios?.bundleId ?? packageName;
    applyIosProjectIdentity(iosDir, bundleId, appName);
    // Installed package first, then cache, then download from the release —
    // same ladder as the Android engine libs above. The framework is optional
    // (iOS scaffolding still succeeds without it; Xcode build needs it).
    let iosPrebuilt = resolvePackageDir(projectRoot, '@rayact/prebuilt-ios-arm64');
    if (!iosPrebuilt || !fs.existsSync(path.join(iosPrebuilt, 'RayactEngine.xcframework'))) {
      const cached = prebuiltCacheDir(undefined, 'ios-arm64');
      if (fs.existsSync(path.join(cached, 'RayactEngine.xcframework'))) {
        iosPrebuilt = cached;
      } else if (process.platform === 'darwin') {
        try {
          iosPrebuilt = await downloadPrebuilt('ios-arm64');
        } catch (err) {
          console.warn(`warning: iOS engine prebuilt unavailable (${(err as Error).message})`);
          iosPrebuilt = null;
        }
      } else {
        iosPrebuilt = null;
      }
    }
    if (iosPrebuilt) {
      const fwSrc = path.join(iosPrebuilt, 'RayactEngine.xcframework');
      if (fs.existsSync(fwSrc)) {
        copyDirRecursive(fwSrc, path.join(iosDir, 'Frameworks/RayactEngine.xcframework'));
      }
    }
    copyIosPluginArtifacts(iosDir, enabledPlugins);
    writeIosModuleRegistry(iosDir, enabledPlugins);
  }

  writeNativeModulesManifest(projectRoot, nativeModules);
  copyDesktopPluginArtifacts(projectRoot, enabledPlugins);
  fs.mkdirSync(path.join(projectRoot, RAYACT_ASSETS_DIR), { recursive: true });

  return { androidDir, iosDir: templateIos ? iosDir : null, nativeModules };
}
