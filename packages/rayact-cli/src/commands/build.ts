import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  adbInstall,
  adbLaunch,
  loadRayactConfig,
  resolveTransformFlag,
  writeRayactBuild
} from '@rayact/dev-server';
import type { RayactBuildMode, RayactConfig } from '@rayact/dev-server';
import {
  ensureDesktopPrebuilt,
  resolvePrebuiltAndroidDir,
  resolvePackageDir,
  prebuiltCacheDir,
  downloadPrebuilt
} from '@rayact/prebuild';
import type { CliFlags } from '../parse.js';
import { resolveDesktopBin } from '../desktop.js';

/**
 * Locate the Gradle Android project. Order: rayact.config.json android.projectDir,
 * then android/ or apps/android under the project root, then the same two names
 * walking up parent directories (covers apps living inside the rayact monorepo).
 * A directory only qualifies if it contains the gradlew wrapper.
 */
function resolveAndroidProjectDir(cwd: string, config: RayactConfig): string | null {
  const hasGradle = (dir: string) =>
    existsSync(path.join(dir, 'gradlew')) || existsSync(path.join(dir, 'gradlew.bat'));

  if (config.android?.projectDir) {
    const dir = path.resolve(cwd, config.android.projectDir);
    return hasGradle(dir) ? dir : null;
  }

  let dir = cwd;
  for (;;) {
    for (const name of ['android', 'apps/android']) {
      const candidate = path.join(dir, name);
      if (hasGradle(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveIosProjectDir(cwd: string, config: RayactConfig): string | null {
  if (config.ios?.projectDir) {
    const dir = path.resolve(cwd, config.ios.projectDir);
    return existsSync(path.join(dir, 'project.yml')) ? dir : null;
  }
  let dir = cwd;
  for (;;) {
    for (const name of ['ios', 'apps/ios']) {
      const candidate = path.join(dir, name);
      if (existsSync(path.join(candidate, 'project.yml'))) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

interface CssRef {
  /** Absolute path of the CSS file on the build machine. */
  src: string;
  /** Runtime-relative path the (possibly rewritten) bundle reads. */
  rel: string;
}

function hashPath(p: string): string {
  let hash = 5381;
  for (let i = 0; i < p.length; i++) hash = ((hash * 33) ^ p.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/**
 * Collect importCSS("...") refs the bundle reads from the filesystem at runtime.
 * Paths that escape the project root (absolute, or ../ — e.g. file: workspace deps)
 * don't exist on a device or in a packaged app dir, so those refs are rewritten
 * in the bundle to portable ./css/<hash>-<name> paths.
 */
function normalizeCssRefs(code: string, root: string): { code: string; cssFiles: CssRef[] } {
  const cssFiles: CssRef[] = [];
  const rewritten = code.replace(/importCSS\("([^"]+)"\)/g, (full, ref: string) => {
    const src = path.resolve(root, ref);
    const insideRoot = !path.relative(root, src).startsWith('..') && !path.isAbsolute(path.relative(root, src));
    if (insideRoot) {
      cssFiles.push({ src, rel: path.relative(root, src).split(path.sep).join('/') });
      return full;
    }
    const rel = `css/${hashPath(src)}-${path.basename(src)}`;
    cssFiles.push({ src, rel });
    return `importCSS("./${rel}")`;
  });
  const seen = new Set<string>();
  return {
    code: rewritten,
    cssFiles: cssFiles.filter(ref => !seen.has(ref.rel) && seen.add(ref.rel))
  };
}

async function copyInto(src: string, dest: string): Promise<void> {
  const stat = await fs.stat(src);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (stat.isDirectory()) {
    await fs.cp(src, dest, { recursive: true, force: true });
    return;
  }
  await fs.copyFile(src, dest);
}

export async function runBuild(flags: CliFlags): Promise<void> {
  const config = loadRayactConfig();
  let buildMode: RayactBuildMode = flags.command === 'export' || flags.mode === 'release'
    ? 'release'
    : flags.mode === 'development' ? 'release' : flags.mode;

  if (flags.android && flags.debug && buildMode === 'release') {
    buildMode = 'dev-client';
  }
  if (flags.ios && flags.debug && buildMode === 'release') {
    buildMode = 'dev-client';
  }

  const isRelease = buildMode === 'release';
  const minify = resolveTransformFlag(
    config, 'minify', isRelease ? 'release' : 'debug', flags.minify
  );
  const bytecode = resolveTransformFlag(
    config, 'bytecode', isRelease ? 'release' : 'debug', flags.bytecode
  );
  const outDir = path.resolve(process.cwd(), flags.outDir);

  // Bytecode compile runs through the rayact_desktop host. Ensure it's present
  // (source build → installed prebuilt → cache → download) before bundling, so
  // a consumer with no native checkout still gets a working release build.
  let desktopBin = flags.desktopBin;
  if (bytecode) {
    const host = await ensureDesktopPrebuilt(process.cwd(), flags.desktopBin);
    desktopBin = host.bin;
    console.log(`Bytecode host: ${host.bin} (${host.source})`);
  }

  const output = await writeRayactBuild({
    root: process.cwd(),
    entry: flags.entry,
    platform: flags.android ? 'android' : flags.ios ? 'ios' : flags.platform,
    mode: buildMode,
    outDir,
    minify,
    bytecode,
    desktopBin
  });

  console.log(`Rayact ${output.mode} build written to ${outDir}`);
  console.log(`Bundle: ${output.bundleFormat === 'qjsbc' ? 'bundle.qjsbc' : 'bundle.js'}`);
  console.log(`Assets: ${output.assets.length}`);

  if (flags.platform === 'web' && !flags.android && !flags.ios) {
    if (process.env.RAYACT_SKIP_WEB_HOST_ASSEMBLY === '1') {
      console.log('Skipping web host assembly (RAYACT_SKIP_WEB_HOST_ASSEMBLY=1)');
      return;
    }
    await assembleWebApp(output.bundleFormat, output.bytecode, output.code, outDir);
    return;
  }

  if (!flags.android && !flags.ios && !flags.desktopApp) return;

  const { code, cssFiles } = normalizeCssRefs(output.code, process.cwd());
  if (output.bundleFormat === 'qjsbc' && code !== output.code) {
    console.warn('warning: bundle references CSS outside the project root; those paths cannot');
    console.warn('be rewritten inside a bytecode bundle — build with --no-bytecode to fix.');
  }
  if (code !== output.code) {
    const bundleName = output.mode === 'dev-client' ? 'dev-client.js' : 'bundle.js';
    await fs.writeFile(path.join(outDir, bundleName), code);
  }

  if (flags.android) {
    await buildAndroidApk(flags, config, code, cssFiles, output.bytecode, output.bundleFormat, outDir);
  } else if (flags.ios) {
    await buildIosApp(flags, config, code, cssFiles, output.bytecode, output.bundleFormat, outDir);
  } else {
    await packageDesktopApp(flags, config, cssFiles, output.bundleFormat, outDir);
  }
}

/**
 * Record the native plugin modules the host bundles, so the dev client can show
 * them and check a project's required modules against what's installed. Mirrors
 * the `nativeModules` field the dev server publishes in its manifest.
 */
async function writeNativeModules(config: RayactConfig, destPath: string): Promise<void> {
  const nativeModules = config.nativeModules ?? [];
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, JSON.stringify({ nativeModules }, null, 2));
}

async function buildAndroidApk(
  flags: CliFlags,
  config: RayactConfig,
  code: string,
  cssFiles: CssRef[],
  bytecode: Buffer | undefined,
  bundleFormat: 'js' | 'qjsbc',
  outDir: string
): Promise<void> {
  const cwd = process.cwd();
  const androidDir = resolveAndroidProjectDir(cwd, config);
  if (!androidDir) {
    console.error('Android project not found (looked for android/ or apps/android with gradlew,');
    console.error('here and in parent directories). Set android.projectDir in rayact.config.json.');
    process.exit(1);
  }
  console.log(`Android project: ${androidDir}`);

  // Template-scaffolded projects (rayact prebuild) pull assets from the app's
  // rayact-assets/ dir via a gradle srcDir — write there, or the same files
  // land in both srcDirs and gradle fails with "Duplicate resources". The
  // monorepo engine project has no such srcDir and uses app/src/main/assets.
  const appGradle = path.join(androidDir, 'app/build.gradle');
  const usesRayactAssets =
    existsSync(appGradle) && (await fs.readFile(appGradle, 'utf8')).includes('rayact-assets');
  const apkAssets = usesRayactAssets
    ? path.resolve(androidDir, '..', 'rayact-assets')
    : path.join(androidDir, 'app/src/main/assets');
  await fs.mkdir(apkAssets, { recursive: true });
  // Remove the other bundle form first: the standalone loader prefers
  // app.qjsbc, so a stale one would shadow a fresh app.js build (and vice
  // versa a stale dev-client app.js must not ride along in a release APK).
  await fs.rm(path.join(apkAssets, 'app.js'), { force: true });
  await fs.rm(path.join(apkAssets, 'app.qjsbc'), { force: true });
  if (bundleFormat === 'qjsbc' && bytecode) {
    await fs.writeFile(path.join(apkAssets, 'app.qjsbc'), bytecode);
  } else {
    await fs.writeFile(path.join(apkAssets, 'app.js'), code);
  }

  // CSS the bundle reads at runtime: pack under assets/runtime/<relpath> —
  // RayactBundledAssets extracts that tree into filesDir, where importCSS looks.
  for (const ref of cssFiles) {
    if (!existsSync(ref.src)) {
      console.warn(`warning: bundle references missing CSS file: ${ref.src}`);
      continue;
    }
    await copyInto(ref.src, path.join(apkAssets, 'runtime', ref.rel));
  }

  // Native plugin manifest the dev client reads (extracted from runtime/ like CSS).
  await writeNativeModules(config, path.join(apkAssets, 'runtime', 'native-modules.json'));

  // Bundle assets (images etc.) — runtime resolves both assets/<name> and assets/assets/<name>.
  const distAssets = path.join(outDir, 'assets');
  if (existsSync(distAssets)) {
    for (const name of await fs.readdir(distAssets)) {
      const src = path.join(distAssets, name);
      if (!(await fs.stat(src)).isFile()) continue;
      await copyInto(src, path.join(apkAssets, 'runtime/assets', name));
      await copyInto(src, path.join(apkAssets, 'runtime/assets/assets', name));
    }
  }

  // Icon/emoji fonts: RayactBundledAssets.kt extracts assets/runtime/* -> filesDir
  // at first launch, and the engine looks for resources/fonts/ there. Sourced
  // from @rayact/prebuilt-android-arm64 (falls back to the per-user prebuilt
  // cache / GitHub download, same resolution chain `rayact prebuild` uses for
  // the .so). Without this, release APKs ship with zero fonts (tofu icons).
  {
    let androidPrebuiltDir = resolvePrebuiltAndroidDir(cwd);
    if (!androidPrebuiltDir || !existsSync(path.join(androidPrebuiltDir, 'resources/fonts'))) {
      const cached = prebuiltCacheDir(undefined, 'android-arm64');
      androidPrebuiltDir = existsSync(path.join(cached, 'resources/fonts'))
        ? cached
        : await downloadPrebuilt('android-arm64');
    }
    const fontsDir = path.join(androidPrebuiltDir, 'resources/fonts');
    if (existsSync(fontsDir)) {
      for (const name of await fs.readdir(fontsDir)) {
        await copyInto(path.join(fontsDir, name), path.join(apkAssets, 'runtime/resources/fonts', name));
      }
    } else {
      console.warn('warning: no resources/fonts found in @rayact/prebuilt-android-arm64 — icons will render as tofu');
    }
  }

  const variant = flags.debug ? 'Debug' : 'Release';
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  console.log(`Building APK (:app:assemble${variant}) ...`);
  const gradle = spawnSync(gradlew, [`:app:assemble${variant}`], {
    cwd: androidDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (gradle.status !== 0) process.exit(gradle.status ?? 1);

  const apkName = flags.debug ? 'debug/app-debug.apk' : 'release/app-release.apk';
  const apk = path.join(androidDir, 'app/build/outputs/apk', apkName);
  if (!existsSync(apk)) {
    console.error(`Gradle succeeded but APK not found at ${apk}`);
    process.exit(1);
  }
  await copyInto(apk, path.join(outDir, path.basename(apk)));
  console.log(`APK: ${path.join(outDir, path.basename(apk))}`);

  if (flags.install) {
    if (adbInstall(apk)) {
      adbLaunch(
        config.android?.package ?? 'com.rayact.app',
        config.android?.activity ?? '.DevLauncherActivity'
      );
    } else {
      console.error('adb install failed — is a device connected?');
      process.exit(1);
    }
  }
}

/**
 * `rayact build --web`: pair the app bundle with the prebuilt WASM/WebGPU host
 * (downloaded from the GitHub release) into a servable <outDir>/web directory.
 * The host's shell fetches ./app.qjsbc or ./app.js into its filesystem at boot.
 */
async function assembleWebApp(
  bundleFormat: 'js' | 'qjsbc',
  bytecode: Buffer | undefined,
  code: string,
  outDir: string
): Promise<void> {
  const { ensureWebHost } = await import('@rayact/prebuild');
  const hostDir = await ensureWebHost();
  const webDir = path.join(outDir, 'web');
  await fs.mkdir(webDir, { recursive: true });
  for (const name of ['rayact.html', 'rayact.js', 'rayact.wasm']) {
    await fs.copyFile(path.join(hostDir, name), path.join(webDir, name));
  }
  // index.html so `serve dist/web` just works.
  await fs.copyFile(path.join(hostDir, 'rayact.html'), path.join(webDir, 'index.html'));
  if (bundleFormat === 'qjsbc' && bytecode) {
    await fs.writeFile(path.join(webDir, 'app.qjsbc'), bytecode);
  } else {
    await fs.writeFile(path.join(webDir, 'app.js'), code);
  }
  console.log(`Web app assembled: ${webDir}`);
  console.log('Serve with COOP/COEP headers (required for WebGPU):');
  console.log(`  rayact serve ${path.relative(process.cwd(), webDir) || 'dist/web'}`);
  console.log('For live dev with HMR:');
  console.log('  rayact dev --web');
}

async function buildIosApp(
  flags: CliFlags,
  config: RayactConfig,
  code: string,
  cssFiles: CssRef[],
  bytecode: Buffer | undefined,
  bundleFormat: 'js' | 'qjsbc',
  outDir: string
): Promise<void> {
  const cwd = process.cwd();
  const iosDir = resolveIosProjectDir(cwd, config);
  if (!iosDir) {
    console.error('iOS project not found (looked for ios/ or apps/ios with project.yml).');
    console.error('Set ios.projectDir in rayact.config.json.');
    process.exit(1);
  }
  console.log(`iOS project: ${iosDir}`);

  // Template-scaffolded projects (rayact prebuild) bundle assets from the
  // app's rayact-assets/ via the SyncRayactAssets build phase — write there.
  // The monorepo engine project shares the Android assets dir instead.
  const projectYml = path.join(iosDir, 'project.yml');
  const ymlText = existsSync(projectYml) ? await fs.readFile(projectYml, 'utf8') : '';
  const usesRayactAssets = ymlText.includes('rayact-assets');
  const iosAssets = usesRayactAssets
    ? path.resolve(iosDir, '..', 'rayact-assets')
    : path.resolve(iosDir, '../../android/app/src/main/assets');
  await fs.mkdir(iosAssets, { recursive: true });
  // Same stale-bundle guard as Android: never let app.js and app.qjsbc from
  // different builds coexist in the staged assets.
  await fs.rm(path.join(iosAssets, 'app.js'), { force: true });
  await fs.rm(path.join(iosAssets, 'app.qjsbc'), { force: true });
  if (bundleFormat === 'qjsbc' && bytecode) {
    await fs.writeFile(path.join(iosAssets, 'app.qjsbc'), bytecode);
  } else {
    await fs.writeFile(path.join(iosAssets, 'app.js'), code);
  }

  for (const ref of cssFiles) {
    if (!existsSync(ref.src)) {
      console.warn(`warning: bundle references missing CSS file: ${ref.src}`);
      continue;
    }
    await copyInto(ref.src, path.join(iosAssets, 'runtime', ref.rel));
  }
  await writeNativeModules(config, path.join(iosAssets, 'runtime', 'native-modules.json'));

  const distAssets = path.join(outDir, 'assets');
  if (existsSync(distAssets)) {
    for (const name of await fs.readdir(distAssets)) {
      const src = path.join(distAssets, name);
      if (!(await fs.stat(src)).isFile()) continue;
      await copyInto(src, path.join(iosAssets, 'runtime/assets', name));
      await copyInto(src, path.join(iosAssets, 'runtime/assets/assets', name));
    }
  }

  // Icon/emoji fonts: IOSBundledAssets.swift extracts runtime/* -> Documents
  // at launch (same runtime/ prefix convention as Android), and the engine
  // looks for resources/fonts/ there. Sourced from @rayact/prebuilt-ios-arm64.
  // Without this, release builds ship with zero fonts (tofu icons).
  {
    let iosPrebuiltDir = resolvePackageDir(cwd, '@rayact/prebuilt-ios-arm64');
    if (!iosPrebuiltDir || !existsSync(path.join(iosPrebuiltDir, 'resources/fonts'))) {
      const cached = prebuiltCacheDir(undefined, 'ios-arm64');
      iosPrebuiltDir = existsSync(path.join(cached, 'resources/fonts'))
        ? cached
        : await downloadPrebuilt('ios-arm64');
    }
    const fontsDir = path.join(iosPrebuiltDir, 'resources/fonts');
    if (existsSync(fontsDir)) {
      for (const name of await fs.readdir(fontsDir)) {
        await copyInto(path.join(fontsDir, name), path.join(iosAssets, 'runtime/resources/fonts', name));
      }
    } else {
      console.warn('warning: no resources/fonts found in @rayact/prebuilt-ios-arm64 — icons will render as tofu');
    }
  }

  // The scheme/target is the project name — rayact prebuild renames the
  // template's "RayactIOS" to the app name (no spaces).
  const scheme = ymlText.match(/^name:\s*(\S+)/m)?.[1] ?? 'RayactIOS';

  // Template projects link the prebuilt engine as RayactEngine.xcframework.
  // The current release ships only a placeholder there (no Info.plist) — the
  // real iOS engine framework isn't published yet, so fail with guidance
  // instead of a cryptic xcodebuild error.
  if (usesRayactAssets) {
    const fw = path.join(iosDir, 'Frameworks/RayactEngine.xcframework');
    if (!existsSync(path.join(fw, 'Info.plist'))) {
      console.error('iOS custom dev-client builds are not supported yet: the prebuilt');
      console.error('RayactEngine.xcframework has not been published (placeholder only).');
      console.error('Use the prebuilt dev app instead:  rayact dev-app --ios-simulator');
      process.exit(1);
    }
  }

  console.log('Generating Xcode project (xcodegen)...');
  const xcodegen = spawnSync('xcodegen', ['generate'], { cwd: iosDir, stdio: 'inherit' });
  if (xcodegen.status !== 0) process.exit(xcodegen.status ?? 1);

  const configuration = flags.debug ? 'Debug' : 'Release';
  console.log(`Building iOS app (${configuration})...`);
  const derivedDataPath = path.join(iosDir, '.xcode-derived', configuration.toLowerCase());
  const simulatorArchArgs = usesRayactAssets
    ? ['-sdk', 'iphonesimulator', 'ONLY_ACTIVE_ARCH=YES', 'ARCHS=arm64', 'EXCLUDED_ARCHS=x86_64']
    : [];
  const xcodebuild = spawnSync(
    'xcodebuild',
    [
      '-scheme', scheme,
      '-configuration', configuration,
      '-destination', 'generic/platform=iOS Simulator',
      '-derivedDataPath', derivedDataPath,
      ...simulatorArchArgs,
      'build'
    ],
    { cwd: iosDir, stdio: 'inherit' }
  );
  if (xcodebuild.status !== 0) process.exit(xcodebuild.status ?? 1);

  const derived = path.join(
    iosDir,
    'build',
    configuration + '-iphonesimulator',
    `${scheme}.app`
  );
  const fallback = spawnSync('xcodebuild', ['-showBuildSettings', '-scheme', scheme, '-configuration', configuration, '-derivedDataPath', derivedDataPath, ...simulatorArchArgs], {
    cwd: iosDir,
    encoding: 'utf8'
  });
  let appPath = derived;
  if (fallback.stdout) {
    const match = fallback.stdout.match(/TARGET_BUILD_DIR = (.+)/);
    const nameMatch = fallback.stdout.match(/FULL_PRODUCT_NAME = (.+)/);
    if (match && nameMatch) {
      appPath = path.join(match[1].trim(), nameMatch[1].trim());
    }
  }

  if (existsSync(appPath)) {
    await copyInto(appPath, path.join(outDir, `${scheme}.app`));
    console.log(`iOS app: ${path.join(outDir, `${scheme}.app`)}`);
  }

  if (flags.install) {
    const simId = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {
      encoding: 'utf8'
    });
    let deviceId = '';
    if (simId.stdout) {
      try {
        const data = JSON.parse(simId.stdout) as { devices: Record<string, Array<{ udid: string; isAvailable: boolean }>> };
        for (const runtime of Object.values(data.devices)) {
          for (const d of runtime) {
            if (d.isAvailable) {
              deviceId = d.udid;
              break;
            }
          }
          if (deviceId) break;
        }
      } catch { /* ignore */ }
    }
    if (!deviceId || !existsSync(appPath)) {
      console.error('simctl install skipped — no simulator or app bundle path');
      return;
    }
    spawnSync('xcrun', ['simctl', 'install', deviceId, appPath], { stdio: 'inherit' });
    // config wins; else the scaffolded project.yml's PRODUCT_BUNDLE_IDENTIFIER
    // (rayact prebuild patches it to the app's package name); else the engine default.
    const ymlBundleId = ymlText.match(/PRODUCT_BUNDLE_IDENTIFIER:\s*(\S+)/)?.[1];
    const bundleId = config.ios?.bundleId ?? ymlBundleId ?? 'com.rayact.ios';
    spawnSync('xcrun', ['simctl', 'launch', deviceId, bundleId], { stdio: 'inherit' });
  }
}

/**
 * Self-contained desktop app dir: native host binary next to the bundle,
 * plus runtime CSS and fonts the host reads from CWD-relative paths.
 */
async function packageDesktopApp(
  flags: CliFlags,
  config: RayactConfig,
  cssFiles: CssRef[],
  bundleFormat: 'js' | 'qjsbc',
  outDir: string
): Promise<void> {
  const cwd = process.cwd();
  const bin = resolveDesktopBin(cwd, flags.desktopBin);
  if (!bin) {
    console.error('rayact_desktop not found — cannot package the desktop app.');
    console.error('Run `rayact prebuild` to fetch the host, or set RAYACT_DESKTOP_BIN.');
    process.exit(1);
  }

  const binName = path.basename(bin);
  const destBin = path.join(outDir, binName);
  await fs.copyFile(bin, destBin);
  await fs.chmod(destBin, 0o755);

  // Bundled native plugins: copy librayact_*.{dylib,so,dll} into outDir/modules so
  // the host's RAYACT_MODULE_PATH=<exeDir>/modules hook (main.cpp) dlopen's them.
  const ext = process.platform === 'darwin' ? '.dylib'
    : process.platform === 'win32' ? '.dll' : '.so';
  const isPlugin = (n: string) =>
    (n.startsWith('librayact_') || n.startsWith('rayact_')) && n.endsWith(ext);
  const moduleDirs = [
    process.env.RAYACT_MODULE_DIR,
    path.join(path.dirname(bin), '../modules'),
    path.join(cwd, 'modules')
  ].filter((d): d is string => Boolean(d));
  for (const dir of moduleDirs) {
    if (!existsSync(dir)) continue;
    for (const name of await fs.readdir(dir)) {
      if (isPlugin(name)) await copyInto(path.join(dir, name), path.join(outDir, 'modules', name));
    }
    break;
  }
  await writeNativeModules(config, path.join(outDir, 'native-modules.json'));

  const bundleName = bundleFormat === 'qjsbc' ? 'bundle.qjsbc' : 'bundle.js';
  const hostBundleName = bundleFormat === 'qjsbc' ? 'app.qjsbc' : 'app.js';
  const bundlePath = path.join(outDir, bundleName);
  if (existsSync(bundlePath)) {
    await copyInto(bundlePath, path.join(outDir, hostBundleName));
  }

  for (const ref of cssFiles) {
    if (!existsSync(ref.src)) {
      console.warn(`warning: bundle references missing CSS file: ${ref.src}`);
      continue;
    }
    await copyInto(ref.src, path.join(outDir, ref.rel));
  }

  // Icon/emoji fonts: the host loads resources/fonts/* relative to CWD.
  const binRoot = path.resolve(path.dirname(bin), '../..');
  for (const fontsDir of [path.join(cwd, 'resources/fonts'), path.join(binRoot, 'resources/fonts')]) {
    if (!existsSync(fontsDir)) continue;
    for (const name of await fs.readdir(fontsDir)) {
      await copyInto(path.join(fontsDir, name), path.join(outDir, 'resources/fonts', name));
    }
    break;
  }

  // Material icon metadata: ship the generated lookup table too so the desktop
  // host can resolve `Icon name="..."` even when launched from a packaged app.
  const iconMapCandidates = [
    path.join(cwd, 'packages/rayact-shared/dist/material_icons.js'),
    path.join(cwd, 'packages/rayact-shared/dist/material_icons.jsc'),
    path.join(binRoot, 'packages/rayact-shared/dist/material_icons.js'),
    path.join(binRoot, 'packages/rayact-shared/dist/material_icons.jsc'),
  ];
  for (const src of iconMapCandidates) {
    if (!existsSync(src)) continue;
    await copyInto(src, path.join(outDir, 'resources/fonts', path.basename(src)));
    break;
  }

  const pack = path.join(outDir, 'app.rayactpack');
  const packResult = spawnSync(destBin, ['--pack', outDir, pack], { cwd: outDir, stdio: 'inherit' });
  if (packResult.status !== 0) process.exit(packResult.status ?? 1);

  console.log(`Desktop app packaged: ${outDir}`);
  console.log(`Run: cd ${path.relative(cwd, outDir) || '.'} && ./${binName} app.rayactpack`);
}
