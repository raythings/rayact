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
  await fs.mkdir(path.dirname(dest), { recursive: true });
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

  const isRelease = buildMode === 'release';
  const minify = resolveTransformFlag(
    config, 'minify', isRelease ? 'release' : 'debug', flags.minify
  );
  const bytecode = resolveTransformFlag(
    config, 'bytecode', isRelease ? 'release' : 'debug', flags.bytecode
  );
  const outDir = path.resolve(process.cwd(), flags.outDir);

  const output = await writeRayactBuild({
    root: process.cwd(),
    entry: flags.entry,
    platform: flags.android ? 'android' : flags.platform,
    mode: buildMode,
    outDir,
    minify,
    bytecode,
    desktopBin: flags.desktopBin
  });

  console.log(`Rayact ${output.mode} build written to ${outDir}`);
  console.log(`Bundle: ${output.bundleFormat === 'qjsbc' ? 'bundle.qjsbc' : 'bundle.js'}`);
  console.log(`Assets: ${output.assets.length}`);

  if (!flags.android && !flags.desktopApp) return;

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
  } else {
    await packageDesktopApp(flags, config, cssFiles, outDir);
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

  const apkAssets = path.join(androidDir, 'app/src/main/assets');
  await fs.mkdir(apkAssets, { recursive: true });
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
 * Self-contained desktop app dir: native host binary next to the bundle,
 * plus runtime CSS and fonts the host reads from CWD-relative paths.
 */
async function packageDesktopApp(
  flags: CliFlags,
  config: RayactConfig,
  cssFiles: CssRef[],
  outDir: string
): Promise<void> {
  const cwd = process.cwd();
  const bin = resolveDesktopBin(cwd, flags.desktopBin);
  if (!bin) {
    console.error('rayact_desktop not found — cannot package the desktop app.');
    console.error('Build the native host (e.g. ./build_macos.sh) or set RAYACT_DESKTOP_BIN.');
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

  console.log(`Desktop app packaged: ${outDir}`);
  console.log(`Run: cd ${path.relative(cwd, outDir) || '.'} && ./${binName} bundle.js`);
}
