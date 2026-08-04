import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  adbInstall,
  adbLaunch,
  loadRayactConfig,
  minifyCssText,
  resolveAppName,
  resolveAndroidActivityName,
  resolveAndroidPackageName,
  resolveTransformFlag,
  writeRayactBuild
} from '@rayact/dev-server';
import type { RayactBuildMode, RayactConfig } from '@rayact/dev-server';
import {
  ensureDesktopPrebuilt,
  resolveToolBin,
  applyAndroidProjectIdentity,
  resolvePrebuiltAndroidDir,
  resolvePackageDir,
  prebuiltCacheDir,
  downloadPrebuilt,
  mergeNativeModules,
  resolveRayactPlugins,
  writeAndroidModuleBuildFiles,
  writeAndroidPlatformAutolinking,
  writeIosPlatformAutolinking,
} from '@rayact/prebuild';
import type { CliFlags } from '../parse.js';
import { resolveDesktopBin } from '../desktop.js';
import { isSlimmableFont, slimFont } from '../fonts/slimFont.js';

function assertModuleSupport(config: RayactConfig, platform: string): void {
  const modules = mergeNativeModules(config.nativeModules, resolveRayactPlugins(process.cwd()));
  const isOfficialDevApp = Boolean(
    process.env.RAYACT_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON
  );
  const unsupported = modules.filter(module =>
    module.platforms?.length &&
    !module.platforms.includes(platform) &&
    // The official development host intentionally declares the union of the
    // first-party modules available across mobile, desktop and Web. Each
    // platform build stages only artifacts that actually target it, while the
    // launcher advertises the full capability matrix. Keep strict rejection
    // for ordinary apps and for any non-official third-party module.
    !(isOfficialDevApp && module.officialDevApp)
  );
  if (unsupported.length) {
    throw new Error(
      `Native module(s) unavailable on ${platform}: ${unsupported.map(module => module.name).join(', ')}. ` +
      'Choose platform-compatible modules or provide a Web/WASM implementation.'
    );
  }
}

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
  // The bundled dev-client package can contribute its own trailing external
  // source-map directive. Native staging renames that bundle to app.js and
  // does not ship the package's dev-client.js.map, so retaining the directive
  // produces a misleading missing-map warning on every project load.
  const portableCode = code.replace(/\n?\/\/# sourceMappingURL=(?!data:)[^\r\n]*\s*$/, '');
  const rewritten = portableCode.replace(/importCSS\("([^"]+)"\)/g, (full, ref: string) => {
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

/**
 * Stage a stylesheet, minifying it on the way through.
 *
 * The engine parses CSS into a rule table and no native target has a CSS
 * inspector, so there is nothing to lose by shipping it compact. Anything
 * esbuild declines to minify is copied through byte-for-byte.
 */
async function copyCssInto(src: string, dest: string): Promise<void> {
  const original = await fs.readFile(src, 'utf8');
  const { css, originalBytes, minifiedBytes, skipped } = await minifyCssText(original, src);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, css, 'utf8');
  if (!skipped && minifiedBytes < originalBytes) {
    const pct = (100 * (1 - minifiedBytes / originalBytes)).toFixed(0);
    console.log(`  minified ${path.basename(src)} ${originalBytes} -> ${minifiedBytes} bytes (-${pct}%)`);
  } else if (skipped && skipped !== 'empty' && skipped !== 'no size win') {
    console.warn(`  warning: ${path.basename(src)} left unminified — ${skipped}`);
  }
}

/**
 * The bundled CBDT emoji font is only worth shipping where the platform has no
 * emoji rasterizer of its own. Android draws emoji through Paint/Canvas, Apple
 * through CoreText, and Windows through DirectWrite/D2D (see
 * EmojiFont::EnsureBackend), so on those targets the full ~10.7 MB file is dead
 * weight. Linux desktop still needs it as a fallback when the system has no
 * Noto emoji font, and the web build embeds it because wasm has no OS
 * rasterizer at all.
 *
 * Windows is a special case for country flags: Segoe UI Emoji has no ISO flag
 * glyphs (regional indicators render as "US"/"JP"), so we ship a small
 * `NotoColorEmoji-Flags.ttf` CBDT subset (~0.85 MB) alongside the OS rasterizer.
 *
 * An app that wants a specific emoji set on any platform can still ship one and
 * register it with `loadEmoji()`, which overrides the OS rasterizer.
 */
const BUNDLED_EMOJI_FONT = 'NotoColorEmoji.ttf';
const BUNDLED_FLAGS_FONT = 'NotoColorEmoji-Flags.ttf';

function skipBundledEmojiFont(
  name: string,
  target: 'android' | 'ios' | 'desktop',
  desktopOs: NodeJS.Platform = process.platform
): boolean {
  const base = path.basename(name);
  if (base === BUNDLED_EMOJI_FONT) {
    // Keep only for Linux desktop builds. Android/iOS always skip; macOS/Windows
    // desktop hosts skip because those OSes provide an emoji rasterizer.
    return target !== 'desktop' || desktopOs !== 'linux';
  }
  if (base === BUNDLED_FLAGS_FONT) {
    // Only Windows needs the flags subset (Segoe has no country flags).
    return !(target === 'desktop' && desktopOs === 'win32');
  }
  return false;
}

/** Native hosts use the OS UI face — never stage Roboto TTF trees. */
function skipBundledRobotoFont(name: string): boolean {
  return /^Roboto/i.test(path.basename(name));
}

/**
 * Staging only ever copies *into* the destination, so a file we have stopped
 * shipping would otherwise sit there forever — a project that built with an
 * older rayact keeps a stale 10.7 MB emoji font in its app bundle and never
 * sees the size win. Prune it explicitly whenever we are skipping it.
 */
async function pruneUnusedEmojiFont(
  destFontsDir: string,
  target: 'android' | 'ios' | 'desktop',
  desktopOs: NodeJS.Platform = process.platform
): Promise<void> {
  for (const font of [BUNDLED_EMOJI_FONT, BUNDLED_FLAGS_FONT]) {
    if (!skipBundledEmojiFont(font, target, desktopOs)) continue;
    const stale = path.join(destFontsDir, font);
    if (!existsSync(stale)) continue;
    await fs.rm(stale, { force: true });
    console.log(`  removed stale ${font} (not needed on this platform)`);
  }
  // Native hosts use the OS UI face; never ship Roboto TTF trees.
  if (target === 'desktop' && desktopOs === 'linux') {
    // Linux desktop also uses system UI fonts — same prune.
  }
  await pruneRobotoFonts(destFontsDir);
}

/** Drop any Roboto*.ttf / Roboto/ directory left over from older packages. */
async function pruneRobotoFonts(destFontsDir: string): Promise<void> {
  if (!existsSync(destFontsDir)) return;
  const robotoDir = path.join(destFontsDir, 'Roboto');
  if (existsSync(robotoDir)) {
    await fs.rm(robotoDir, { recursive: true, force: true });
    console.log('  removed stale Roboto/ (native hosts use the OS UI font)');
  }
  for (const name of await fs.readdir(destFontsDir)) {
    if (!/^Roboto/i.test(name)) continue;
    await fs.rm(path.join(destFontsDir, name), { recursive: true, force: true });
    console.log(`  removed stale ${name} (native hosts use the OS UI font)`);
  }
}

/**
 * Stage a font, dropping tables the engine cannot read on the way through.
 *
 * The rasterizer is stb_truetype (via raylib LoadFontEx), which ignores
 * variable-font data entirely — in Material Symbols that unread `gvar` is ~88%
 * of the file. Slimming here rather than at the source keeps the win for
 * app-supplied fonts too. Anything that is not a recognized TTF/OTF, or that
 * slimFont declines to touch, is copied byte-for-byte.
 */
async function copyFontInto(src: string, dest: string): Promise<void> {
  if (!isSlimmableFont(src) || !(await fs.stat(src)).isFile()) {
    await copyInto(src, dest);
    return;
  }
  const original = await fs.readFile(src);
  const { out, dropped } = slimFont(original);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, out);
  if (dropped.length) {
    const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2)} MB`;
    console.log(
      `  slimmed ${path.basename(src)} ${mb(original.length)} -> ${mb(out.length)} ` +
        `(dropped ${dropped.join(', ')})`
    );
  }
}

export async function runBuild(flags: CliFlags): Promise<void> {
  const config = loadRayactConfig();
  const targetPlatform = flags.android ? 'android' : flags.ios ? 'ios' : flags.platform;
  assertModuleSupport(config, targetPlatform === 'desktop'
    ? (process.platform === 'darwin' ? 'darwin' : process.platform)
    : targetPlatform);
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
  const bytecode = isRelease || resolveTransformFlag(
    config, 'bytecode', 'debug', flags.bytecode
  );
  const outDir = path.resolve(process.cwd(), flags.outDir);

  // Bytecode compile runs through the headless rayact_tool binary. Resolve it
  // first (env → source build → installed prebuilt → cache); only when nothing
  // is present at all do we download the host prebuilt (which ships rayact_tool
  // next to rayact_desktop from 0.0.4 on), so a consumer with no native
  // checkout still gets a working release build.
  let desktopBin = flags.desktopBin;
  let toolBin = flags.toolBin;
  if (bytecode) {
    let tool = resolveToolBin(process.cwd(), flags.toolBin);
    if (!tool) {
      const host = await ensureDesktopPrebuilt(process.cwd(), flags.desktopBin);
      desktopBin = host.bin;
      tool = resolveToolBin(process.cwd(), flags.toolBin);
    }
    if (!tool) {
      console.error('rayact_tool not found — cannot compile bytecode.');
      console.error('Run `rayact prebuild` to fetch the prebuilt, or set RAYACT_TOOL_BIN.');
      process.exitCode = 1;
      return;
    }
    toolBin = tool.bin;
    if (tool.fallbackDesktopHost) {
      console.warn(
        `Bytecode tool: falling back to the rayact_desktop host at ${tool.bin} ` +
          '(pre-0.0.4 prebuilt; works, but pulls in the GUI runtime).'
      );
    } else {
      console.log(`Bytecode tool: ${tool.bin} (${tool.source})`);
    }
  }

  const output = await writeRayactBuild({
    root: process.cwd(),
    entry: flags.entry,
    platform: flags.android ? 'android' : flags.ios ? 'ios' : flags.platform,
    mode: buildMode,
    outDir,
    minify,
    bytecode,
    desktopBin,
    toolBin
  });

  console.log(`Rayact ${output.mode} build written to ${outDir}`);
  console.log(`Bundle: ${output.bundleFormat === 'qjsbc' ? 'bundle.qjsbc' : 'bundle.js'}`);
  console.log(`Assets: ${output.assets.length}`);

  const { code, cssFiles } = normalizeCssRefs(output.code, process.cwd());
  if (output.bundleFormat === 'qjsbc' && code !== output.code) {
    console.warn('warning: bundle references CSS outside the project root; those paths cannot');
    console.warn('be rewritten inside a bytecode bundle — build with --no-bytecode to fix.');
  }

  if (flags.platform === 'web' && !flags.android && !flags.ios) {
    if (process.env.RAYACT_SKIP_WEB_HOST_ASSEMBLY === '1') {
      console.log('Skipping web host assembly (RAYACT_SKIP_WEB_HOST_ASSEMBLY=1)');
      return;
    }
    await assembleWebApp(
      output.bundleFormat, output.bytecode, code, cssFiles, output.assets, outDir, isRelease
    );
    return;
  }

  if (!flags.android && !flags.ios && !flags.desktopApp) return;
  if (code !== output.code) {
    const bundleName = output.mode === 'dev-client' ? 'dev-client.js' : 'bundle.js';
    await fs.writeFile(path.join(outDir, bundleName), code);
  }

  if (flags.android) {
    await buildAndroidApk(flags, config, code, cssFiles, output.bytecode, output.bundleFormat, outDir);
  } else if (flags.ios) {
    await buildIosApp(flags, config, code, cssFiles, output.bytecode, output.bundleFormat, outDir);
  } else {
    await packageDesktopApp(flags, config, cssFiles, output.bundleFormat, outDir, isRelease);
  }
}

/**
 * Record the native plugin modules the host bundles, so the dev client can show
 * them and check a project's required modules against what's installed. Mirrors
 * the `nativeModules` field the dev server publishes in its manifest.
 */
async function writeNativeModules(config: RayactConfig, destPath: string): Promise<void> {
  const nativeModules = mergeNativeModules(config.nativeModules, resolveRayactPlugins(process.cwd()));
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
  // Keep identity config-driven even for an existing native tree. This makes
  // the shared official host and generated custom clients follow the same rule.
  applyAndroidProjectIdentity(
    androidDir,
    resolveAndroidPackageName(config),
    resolveAppName(config),
  );

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
    await copyCssInto(ref.src, path.join(apkAssets, 'runtime', ref.rel));
  }

  // Native plugin manifest the dev client reads (extracted from runtime/ like CSS).
  await writeNativeModules(config, path.join(apkAssets, 'runtime', 'native-modules.json'));

  // Build wiring for modules that ship sources (a source checkout, e.g. the dev app).
  // Regenerated on every build so adding or removing a dependency is enough — there is
  // no target list to maintain in CMakeLists.txt or build.gradle.
  const selectedPlugins = resolveRayactPlugins(cwd);
  const sourceTargets = writeAndroidModuleBuildFiles(androidDir, selectedPlugins);
  writeAndroidPlatformAutolinking(androidDir, selectedPlugins);
  if (sourceTargets.length > 0) {
    console.log(`Native modules built from source: ${sourceTargets.join(', ')}`);
  }

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
        if (skipBundledEmojiFont(name, 'android') || skipBundledRobotoFont(name)) continue;
        await copyFontInto(path.join(fontsDir, name), path.join(apkAssets, 'runtime/resources/fonts', name));
      }
      await pruneUnusedEmojiFont(path.join(apkAssets, 'runtime/resources/fonts'), 'android');
    } else {
      console.warn('warning: no resources/fonts found in @rayact/prebuilt-android-arm64 — icons will render as tofu');
    }
  }

  const variant = flags.debug ? 'Debug' : 'Release';
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  console.log(`Building APK (:app:assemble${variant}) ...`);
  // Source modules and the engine live outside the generated Android project.
  // Gradle's native merge tasks do not consistently notice that CMake replaced
  // one of those external outputs, which can package yesterday's .so after a
  // successful native rebuild. Re-run the packaging graph for source builds;
  // prebuilt consumer apps retain the normal incremental path.
  const gradleArgs = [`:app:assemble${variant}`];
  if (sourceTargets.length > 0) gradleArgs.push('--rerun-tasks');
  const gradle = spawnSync(gradlew, gradleArgs, {
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
        resolveAndroidPackageName(config),
        resolveAndroidActivityName(config)
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
  cssFiles: CssRef[],
  bundleAssets: { outputName: string; kind: string }[],
  outDir: string,
  isRelease: boolean
): Promise<void> {
  const { ensureWebHost } = await import('@rayact/prebuild');
  const hostDir = await ensureWebHost();
  const webDir = path.join(outDir, 'web');
  await fs.mkdir(webDir, { recursive: true });
  const releaseHost = ['html', 'js', 'wasm'].every((ext) =>
    existsSync(path.join(hostDir, `rayact_release.${ext}`))
  );
  const hostBase = isRelease && releaseHost ? 'rayact_release' : 'rayact';
  for (const ext of ['html', 'js', 'wasm']) {
    await fs.copyFile(path.join(hostDir, `${hostBase}.${ext}`), path.join(webDir, `rayact.${ext}`));
  }
  // The trio is always staged as rayact.{html,js,wasm}, but the shell and the
  // emscripten glue refer to each other by their *upstream* names. Left alone,
  // the glue fetches `<hostBase>.wasm`, gets a 404 and aborts with "both async
  // and sync fetching of the wasm failed", so the page never leaves the loading
  // overlay. These are plain filename constants, so a literal swap is safe.
  if (hostBase !== 'rayact') {
    const glue = path.join(webDir, 'rayact.js');
    const js = await fs.readFile(glue, 'utf8');
    await fs.writeFile(glue, js.split(`${hostBase}.wasm`).join('rayact.wasm'));
  }
  // index.html so `serve dist/web` just works.
  await fs.copyFile(path.join(hostDir, `${hostBase}.html`), path.join(webDir, 'index.html'));
  // Static releases have no discovery/HMR/bootstrap-prefetch path. Remove the
  // development-only shell code instead of leaving it dormant behind ?dev=.
  if (isRelease) {
    if (!releaseHost) {
      console.warn('warning: release-only Web host is not installed; sanitizing the legacy host shell');
    }
    for (const name of ['rayact.html', 'index.html']) {
      const file = path.join(webDir, name);
      let html = sanitizeReleaseWebHtml(await fs.readFile(file, 'utf8'));
      // The host trio is staged as rayact.{html,js,wasm} whatever it was called
      // upstream, so the shell's own <script src="rayact_release.js"> would 404
      // and the module would never boot — the page just sits on the loading
      // overlay. Point it at the staged name.
      if (hostBase !== 'rayact') {
        html = html.split(`${hostBase}.js`).join('rayact.js');
      }
      await fs.writeFile(file, html);
    }
  }
  // Browser-side module code (manifest `web.script`), the web peer of the
  // Android/iOS registration classes and the desktop dylibs. Copied next to the
  // app and loaded with a <script> tag — app-assets.json cannot serve these
  // because it targets MEMFS, and a <script> needs a real HTTP path.
  const webPlugins = resolveRayactPlugins(process.cwd());
  const webModules = webPlugins.filter(plugin => plugin.manifest.web?.script);
  // Native web modules: Emscripten side modules the host dlopens at boot, the peer
  // of the desktop dylibs staged into <outDir>/modules.
  const webWasmModules = webPlugins.flatMap(plugin => {
    const artifact = plugin.manifest.artifacts?.find(candidate => candidate.platform === 'web');
    return artifact ? [{ plugin, artifact }] : [];
  });
  if (webModules.length || webWasmModules.length) {
    const modulesDir = path.join(webDir, 'modules');
    await fs.mkdir(modulesDir, { recursive: true });
    const tags: string[] = [];
    const wasmUrls: string[] = [];
    for (const { plugin, artifact } of webWasmModules) {
      const source = path.join(plugin.packageDir, artifact.path);
      if (!existsSync(source)) {
        console.warn(`warning: ${plugin.jsPackage} declares a web artifact but ${source} is missing`);
        continue;
      }
      // Copy the artifact alone rather than its directory: unlike a browser script,
      // a side module fetches no siblings — everything it does not define itself it
      // imports from the host — and the directory also holds its C++ sources.
      const destination = path.join(modulesDir, plugin.name, path.basename(artifact.path));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      wasmUrls.push(`modules/${plugin.name}/${path.basename(artifact.path)}`);
    }
    if (wasmUrls.length) {
      // Consumed by the shell's preRun, which fetches each module and holds main()
      // back until it has registered. Dev gets the same list from the manifest.
      tags.push(
        `<script>window.__rayactWebModules=${JSON.stringify(wasmUrls)}</script>`
      );
    }
    for (const plugin of webModules) {
      const script = plugin.manifest.web?.script;
      if (!script) continue;
      const source = path.join(plugin.packageDir, script);
      if (!existsSync(source)) {
        console.warn(`warning: ${plugin.jsPackage} declares web.script but ${source} is missing`);
        continue;
      }
      // Stage the script's whole directory, not just the file. A browser module
      // is often more than one file — a .wasm it instantiates, a worker script,
      // a glue file — and those are fetched at runtime by URL, so they need real
      // paths next to the script rather than a place in app-assets.json (which
      // targets MEMFS and cannot serve a fetch()). Copying the directory keeps
      // every sibling reachable at the same relative path it has in the package,
      // so a module's own `./thing.wasm` just works.
      await fs.cp(path.dirname(source), path.join(modulesDir, plugin.name), {
        recursive: true
      });
      tags.push(`<script src="modules/${plugin.name}/${path.basename(script)}"></script>`);
    }
    if (tags.length) {
      // Injected before the emscripten-emitted <script src="rayact.js">, which
      // the shell template puts last in the body. Ordering is a nicety, not a
      // requirement: the registry parks creates for kinds whose factory has not
      // registered yet and replays them when it does.
      for (const name of ['rayact.html', 'index.html']) {
        const file = path.join(webDir, name);
        const html = await fs.readFile(file, 'utf8');
        // emcc minifies the shell, so the engine tag is `<script async
        // src=rayact.js>` — unquoted. Match either form rather than a literal,
        // or the tags land after the engine via the fallback below.
        const engineTag = /<script[^>]*\ssrc=["']?rayact\.js["']?[^>]*>/.exec(html);
        await fs.writeFile(
          file,
          engineTag
            ? `${html.slice(0, engineTag.index)}${tags.join('')}${html.slice(engineTag.index)}`
            : html.replace('</body>', `${tags.join('')}</body>`)
        );
      }
      const staged = [
        ...webModules.map(plugin => plugin.name),
        ...webWasmModules.map(entry => `${entry.plugin.name} (wasm)`)
      ];
      console.log(`Web modules: ${staged.join(', ')}`);
    }
  }
  if (bundleFormat === 'qjsbc' && bytecode) {
    await fs.writeFile(path.join(webDir, 'app.qjsbc'), bytecode);
  } else {
    await fs.writeFile(path.join(webDir, 'app.js'), code);
  }
  // Runtime files the bundle reads: stage under webDir and list in
  // app-assets.json — the host shell fetches each entry into MEMFS before boot
  // (web analog of the Android assets/runtime/<rel> staging).
  const assetList: string[] = [];
  for (const ref of cssFiles) {
    if (!existsSync(ref.src)) {
      console.warn(`warning: bundle references missing CSS file: ${ref.src}`);
      continue;
    }
    await copyCssInto(ref.src, path.join(webDir, ref.rel));
    assetList.push(ref.rel);
  }
  // Bundled assets (worker .wasm, images, …) were written to <outDir>/assets
  // with content-hashed names the bundle references — stage every one of them,
  // not just CSS, or spawnWorker/asset loads fail with a missing MEMFS file.
  for (const asset of bundleAssets) {
    const rel = `assets/${asset.outputName}`;
    const src = path.join(outDir, rel);
    if (!existsSync(src)) {
      console.warn(`warning: bundle references missing asset: ${rel}`);
      continue;
    }
    await copyInto(src, path.join(webDir, rel));
    assetList.push(rel);
  }
  await fs.writeFile(path.join(webDir, 'app-assets.json'), JSON.stringify(assetList));
  console.log(`Web app assembled: ${webDir}`);
  console.log('Serve with COOP/COEP headers (required for WebGPU):');
  console.log(`  rayact serve ${path.relative(process.cwd(), webDir) || 'dist/web'}`);
  console.log('For live dev with HMR:');
  console.log('  rayact dev --web');
}

export function sanitizeReleaseWebHtml(input: string): string {
  const releasePreRun = 'preRun:[function(){addRunDependency("rayact-app-bundle");var load=function(name,fallback){fetch(name).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.arrayBuffer()}).then(function(bytes){FS.writeFile("/"+name,new Uint8Array(bytes));removeRunDependency("rayact-app-bundle")}).catch(function(){if(fallback)fallback();else removeRunDependency("rayact-app-bundle")})};load("app.qjsbc",function(){load("app.js",null)});addRunDependency("rayact-app-assets");fetch("app-assets.json").then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json()}).then(function(list){if(!Array.isArray(list))return;return Promise.all(list.map(function(rel){return fetch(rel).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.arrayBuffer()}).then(function(bytes){var dir="/"+rel.split("/").slice(0,-1).join("/");if(dir!=="/")FS.mkdirTree(dir);FS.writeFile("/"+rel,new Uint8Array(bytes))})}))}).catch(function(){}).then(function(){removeRunDependency("rayact-app-assets")})}],';
  let html = input.replace(
    /preRun\s*:\s*\[[\s\S]*?\]\s*,\s*__rayactPrefetchCache\s*:\s*[^,]+,\s*__rayactActiveRevision\s*:\s*[^,]+,/,
    releasePreRun
  );
  html = html.replace(
    /(?:\/\/ Browsers cannot browse raw mDNS\.[\s\S]*?)?var\s+rayactDevMatch\s*=[\s\S]*?var\s+Module\s*=\s*\{/,
    'var Module={'
  );
  const forbidden = ['rayactDevBase', '__rayactPrefetchCache', '/rayact/manifest.json', '?dev='];
  const remaining = forbidden.filter((marker) => html.includes(marker));
  if (remaining.length > 0) {
    throw new Error(`Release Web host still contains development bootstrap markers: ${remaining.join(', ')}`);
  }
  return html;
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
  writeIosPlatformAutolinking(iosDir, resolveRayactPlugins(cwd));

  // Template-scaffolded projects (rayact prebuild) bundle assets from the
  // app's rayact-assets/ via the SyncRayactAssets build phase — write there.
  // The monorepo engine project shares the Android assets dir instead.
  const projectYml = path.join(iosDir, 'project.yml');
  const ymlText = existsSync(projectYml) ? await fs.readFile(projectYml, 'utf8') : '';
  const usesRayactAssets = ymlText.includes('rayact-assets');
  const iosAssets = usesRayactAssets
    ? path.resolve(iosDir, '..', 'rayact-assets')
    : path.resolve(iosDir, '../android/app/src/main/assets');
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
    await copyCssInto(ref.src, path.join(iosAssets, 'runtime', ref.rel));
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
        if (skipBundledEmojiFont(name, 'ios') || skipBundledRobotoFont(name)) continue;
        await copyFontInto(path.join(fontsDir, name), path.join(iosAssets, 'runtime/resources/fonts', name));
      }
      await pruneUnusedEmojiFont(path.join(iosAssets, 'runtime/resources/fonts'), 'ios');
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
    derivedDataPath,
    'Build',
    'Products',
    configuration + '-iphonesimulator',
    `${scheme}.app`
  );
  // -showBuildSettings defaults to iphoneos without an explicit SDK, which
  // resolves TARGET_BUILD_DIR to Debug-iphoneos even though the actual build
  // above targeted the simulator (generic/platform=iOS Simulator) — pass
  // -sdk iphonesimulator here regardless of simulatorArchArgs so the queried
  // path matches where the app was actually built.
  const fallback = spawnSync('xcodebuild', ['-showBuildSettings', '-scheme', scheme, '-configuration', configuration, '-derivedDataPath', derivedDataPath, '-sdk', 'iphonesimulator', ...simulatorArchArgs], {
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
    const stagedApp = path.join(outDir, `${scheme}.app`);
    // Mirror rather than merge: fs.cp overwrites but never deletes, so anything
    // the build has stopped producing (e.g. a resource dropped from the bundle)
    // would linger in the copy forever and misreport the app's real size.
    await fs.rm(stagedApp, { recursive: true, force: true });
    await copyInto(appPath, stagedApp);
    console.log(`iOS app: ${stagedApp}`);
  }

  if (flags.install) {
    const simId = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {
      encoding: 'utf8'
    });
    let deviceId = '';
    if (simId.stdout) {
      try {
        const data = JSON.parse(simId.stdout) as { devices: Record<string, Array<{ udid: string; isAvailable: boolean; state?: string }>> };
        let availableId = '';
        for (const runtime of Object.values(data.devices)) {
          for (const d of runtime) {
            if (d.isAvailable && d.state === 'Booted') {
              deviceId = d.udid;
              break;
            }
            if (d.isAvailable && !availableId) availableId = d.udid;
          }
          if (deviceId) break;
        }
        deviceId ||= availableId;
      } catch { /* ignore */ }
    }
    if (!deviceId || !existsSync(appPath)) {
      console.error('simctl install skipped — no simulator or app bundle path');
      return;
    }
    spawnSync('xcrun', ['simctl', 'boot', deviceId], { stdio: 'ignore' });
    const install = spawnSync('xcrun', ['simctl', 'install', deviceId, appPath], { stdio: 'inherit' });
    if (install.status !== 0) process.exit(install.status ?? 1);
    // config wins; else the scaffolded project.yml's PRODUCT_BUNDLE_IDENTIFIER
    // (rayact prebuild patches it to the app's package name); else the engine default.
    const ymlBundleId = ymlText.match(/PRODUCT_BUNDLE_IDENTIFIER:\s*(\S+)/)?.[1];
    const bundleId = config.ios?.bundleId ?? ymlBundleId ?? 'com.rayact.app';
    const launch = spawnSync('xcrun', ['simctl', 'launch', '--terminate-running-process', deviceId, bundleId], { stdio: 'inherit' });
    if (launch.status !== 0) process.exit(launch.status ?? 1);
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
  outDir: string,
  isRelease: boolean
): Promise<void> {
  const cwd = process.cwd();
  let bin = resolveDesktopBin(cwd, flags.desktopBin);
  if (!bin) {
    console.error('rayact_desktop not found — cannot package the desktop app.');
    console.error('Run `rayact prebuild` to fetch the host, or set RAYACT_DESKTOP_BIN.');
    process.exit(1);
  }

  if (isRelease) {
    const releaseSibling = path.join(path.dirname(bin), process.platform === 'win32' ? 'rayact_release.exe' : 'rayact_release');
    if (existsSync(releaseSibling)) bin = releaseSibling;
    else console.warn('warning: release-only desktop host unavailable; using compatibility host');
  }
  const binName = path.basename(bin);
  const destBin = path.join(outDir, binName);
  await fs.copyFile(bin, destBin);
  await fs.chmod(destBin, 0o755);

  // Bundled native plugins and their adjacent runtime dependencies go into
  // outDir/modules. Some plugins are a single library; CEF additionally ships
  // libcef.dll, a subprocess executable, resources and locales in this folder.
  const ext = process.platform === 'darwin' ? '.dylib'
    : process.platform === 'win32' ? '.dll' : '.so';
  const isPlugin = (n: string) =>
    (n.startsWith('librayact_') || n.startsWith('rayact_')) && n.endsWith(ext);
  const moduleDirs = [
    process.env.RAYACT_MODULE_DIR,
    path.join(cwd, 'rayact-assets/modules'),
    path.join(path.dirname(bin), '../modules'),
    path.join(cwd, 'modules')
  ].filter((d): d is string => Boolean(d));
  for (const dir of moduleDirs) {
    if (!existsSync(dir)) continue;
    const names = await fs.readdir(dir);
    if (!names.some(isPlugin)) continue;
    await copyInto(dir, path.join(outDir, 'modules'));
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
    await copyCssInto(ref.src, path.join(outDir, ref.rel));
  }

  // Icon/emoji fonts: the host loads resources/fonts/* relative to CWD.
  const binRoot = path.resolve(path.dirname(bin), '../..');
  const prebuiltRoot = path.resolve(path.dirname(bin), '..');
  for (const fontsDir of [
    path.join(cwd, 'resources/fonts'),
    path.join(prebuiltRoot, 'resources/fonts'),
    path.join(binRoot, 'resources/fonts')
  ]) {
    if (!existsSync(fontsDir)) continue;
    for (const name of await fs.readdir(fontsDir)) {
      if (skipBundledEmojiFont(name, 'desktop') || skipBundledRobotoFont(name)) continue;
      await copyFontInto(path.join(fontsDir, name), path.join(outDir, 'resources/fonts', name));
    }
    await pruneUnusedEmojiFont(path.join(outDir, 'resources/fonts'), 'desktop');
    break;
  }

  // Material icon metadata: ship the generated lookup table too so the desktop
  // host can resolve `Icon name="..."` even when launched from a packaged app.
  const iconMapCandidates = [
    path.join(cwd, 'node_modules/rayact/dist/shared/material_icons.js'),
    path.join(cwd, 'node_modules/rayact/shared-material-icons.js'),
    path.join(cwd, 'packages/rayact-shared/dist/material_icons.js'),
    path.join(cwd, 'packages/rayact-shared/dist/material_icons.jsc'),
    path.join(prebuiltRoot, 'resources/fonts/material_icons.js'),
    path.join(prebuiltRoot, 'resources/fonts/material_icons.jsc'),
    path.join(binRoot, 'packages/rayact-shared/dist/material_icons.js'),
    path.join(binRoot, 'packages/rayact-shared/dist/material_icons.jsc'),
  ];
  for (const src of iconMapCandidates) {
    if (!existsSync(src)) continue;
    await copyInto(src, path.join(outDir, 'resources/fonts', path.basename(src)));
    break;
  }

  const pack = path.join(outDir, 'app.rayactpack');
  // Pack via the headless rayact_tool when available; the copied host binary
  // accepts the same flags and covers pre-0.0.4 prebuilts.
  const tool = resolveToolBin(cwd, flags.toolBin);
  const packBin = tool && !tool.fallbackDesktopHost ? tool.bin : destBin;
  const packResult = spawnSync(packBin, ['--pack', outDir, pack], { cwd: outDir, stdio: 'inherit' });
  if (packResult.status !== 0) process.exit(packResult.status ?? 1);

  console.log(`Desktop app packaged: ${outDir}`);
  console.log(`Run: cd ${path.relative(cwd, outDir) || '.'} && ./${binName} app.rayactpack`);
}
