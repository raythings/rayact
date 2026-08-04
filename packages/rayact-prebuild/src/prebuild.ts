import fs from 'node:fs';
import path from 'node:path';
import { RAYACT_ASSETS_DIR, RAYACT_ENGINE_VERSION } from './constants.js';
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
import type {
  RayactNativeModuleEntry,
  RayactNativeModuleSelection,
  ResolvedPlugin,
} from './types.js';

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
  linking?: {
    schemes?: string[];
  };
  /** When false, refuse to overwrite existing android/ios trees (monorepo safety). */
  force?: boolean;
}

function validateLinkingSchemes(schemes: readonly string[]): string[] {
  const normalized = [...new Set(schemes.map(value => value.trim().toLowerCase()).filter(Boolean))];
  for (const scheme of normalized) {
    if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
      throw new Error(`Invalid linking scheme "${scheme}"`);
    }
  }
  return normalized;
}

/**
 * Native project directories are intentionally reusable, but the registry,
 * platform-view host, and dev launcher are Rayact-owned infrastructure. Keep
 * those files current when prebuilding an existing app so newly installed
 * optional modules compile against the same host contract as the template.
 */
export function updateAndroidHostInfrastructure(templateDir: string, androidDir: string): void {
  const managedFiles = [
    'app/src/main/java/com/rayact/engine/RayactPlatformRegistry.kt',
    'app/src/main/java/com/rayact/engine/RayactPlatformViews.kt',
    'app/src/main/java/com/rayact/engine/RayactMobileNetwork.kt',
    'app/src/main/java/com/rayact/app/DevLauncherActivity.kt',
  ];
  for (const relative of managedFiles) {
    const source = path.join(templateDir, relative);
    const destination = path.join(androidDir, relative);
    if (!fs.existsSync(source) || !fs.existsSync(path.dirname(destination))) continue;
    fs.copyFileSync(source, destination);
  }
}

function insertBeforeRootPlistClose(xml: string, entries: string): string {
  const close = xml.lastIndexOf('</dict>');
  if (close < 0) throw new Error('Invalid plist: missing root </dict>');
  return `${xml.slice(0, close)}${entries}\n${xml.slice(close)}`;
}

function appendPlistArray(xml: string, key: string, entries: string): string {
  const keyIndex = xml.indexOf(`<key>${key}</key>`);
  if (keyIndex < 0) {
    return insertBeforeRootPlistClose(xml, `\t<key>${key}</key>\n\t<array>\n${entries}\n\t</array>`);
  }
  const open = xml.indexOf('<array>', keyIndex);
  if (open < 0) throw new Error(`Invalid plist array for ${key}`);
  const tags = /<\/?array>/g;
  tags.lastIndex = open;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(xml))) {
    if (match[0] === '<array>') depth += 1;
    else {
      depth -= 1;
      if (depth === 0) {
        return `${xml.slice(0, match.index)}${entries}\n\t${xml.slice(match.index)}`;
      }
    }
  }
  throw new Error(`Invalid plist array for ${key}: missing closing tag`);
}

export function applyLinkingConfiguration(
  androidDir: string | null,
  iosDir: string | null,
  schemesInput: readonly string[] = []
): void {
  const schemes = validateLinkingSchemes(schemesInput);
  if (androidDir && schemes.length) {
    const filters = schemes.map(scheme => [
      '            <intent-filter>',
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      `                <data android:scheme="${scheme}" />`,
      '            </intent-filter>',
    ].join('\n')).join('\n');
    for (const relative of ['app/src/main/AndroidManifest.xml', 'app/src/release/AndroidManifest.xml']) {
      const file = path.join(androidDir, relative);
      if (!fs.existsSync(file)) continue;
      let xml = fs.readFileSync(file, 'utf8');
      if (xml.includes('<!-- RAYACT_LINKING_INTENT_FILTERS -->')) {
        xml = xml.replace(
          /\s*<intent-filter>[\s\S]*?<\/intent-filter>/g,
          block => schemes.some(scheme =>
            block.includes(`<data android:scheme="${scheme}" />`)
          ) ? '' : block
        );
        xml = xml.replace('<!-- RAYACT_LINKING_INTENT_FILTERS -->', `${filters}\n            <!-- RAYACT_LINKING_INTENT_FILTERS -->`);
      } else {
        xml = xml.replace(
          /(<activity\b(?![^>]*\/>)[^>]*)(>)/,
          `$1>\n${filters}\n            <!-- RAYACT_LINKING_INTENT_FILTERS -->`
        );
      }
      fs.writeFileSync(file, xml);
    }
  }
  if (iosDir && schemes.length) {
    for (const name of ['Info.plist', 'Info-Release.plist']) {
      const file = path.join(iosDir, name);
      if (!fs.existsSync(file)) continue;
      let xml = fs.readFileSync(file, 'utf8');
      const missing = schemes.filter(scheme =>
        !xml.includes(`<array><string>${scheme}</string></array>`)
      );
      if (!missing.length) continue;
      const value = missing.map(scheme => [
          '\t<dict>',
          '\t\t<key>CFBundleURLName</key>',
          `\t\t<string>${scheme}</string>`,
          '\t\t<key>CFBundleURLSchemes</key>',
          `\t\t<array><string>${scheme}</string></array>`,
          '\t</dict>',
        ].join('\n')).join('\n');
      xml = appendPlistArray(xml, 'CFBundleURLTypes', value);
      fs.writeFileSync(file, xml);
    }
  }
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
          `${packageSubdir}/${abi}. Reinstall matching Rayact 0.0.5 packages; ` +
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
  writeAndroidModuleBuildFiles(androidDir, plugins);
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
      if (fs.statSync(source).isDirectory()) {
        copyDirRecursive(source, destination);
        // Static module XCFrameworks all expose the same RayactModule ABI
        // header. Xcode copies public XCFramework headers into one product
        // include directory, so selecting two packages otherwise creates
        // duplicate-output build commands. App code never imports these
        // private registration headers; remove them from the copied artifact.
        const infoFile = path.join(destination, 'Info.plist');
        if (fs.existsSync(infoFile)) {
          const info = fs.readFileSync(infoFile, 'utf8')
            .replace(/\s*<key>HeadersPath<\/key>\s*<string>Headers<\/string>/g, '');
          fs.writeFileSync(infoFile, info);
          for (const slice of fs.readdirSync(destination)) {
            fs.rmSync(path.join(destination, slice, 'Headers'), { recursive: true, force: true });
          }
        }
      }
      else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
      dependencies.push(`      - framework: Frameworks/Modules/${entryName}\n        embed: false`);
    }
  }
  const projectFile = path.join(iosDir, 'project.yml');
  const marker = '    # RAYACT_AUTOLINKED_MODULES';
  let project = fs.readFileSync(projectFile, 'utf8');
  // The CLI may autolink again during `rayact build` after `prebuild`.
  // Remove the previous generated module block before inserting the current
  // one so repeated runs do not duplicate Xcode dependencies.
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  project = project.replace(
    new RegExp(
      `(?:      - framework: Frameworks/Modules/[^\\n]+\\n        embed: false\\n)*${escapedMarker}`,
    ),
    `${dependencies.length ? `${dependencies.join('\n')}\n` : ''}${marker}`,
  );
  fs.writeFileSync(projectFile, project);
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
  const busPlugins = plugins.filter(plugin => plugin.manifest.nativeBus !== false);
  const declarations = busPlugins
    .map(plugin => `extern "C" int ${plugin.manifest.library}_register(const RayactHost* host);`)
    .join('\n');
  const calls = busPlugins
    .map(plugin => `    { const int rc = ${plugin.manifest.library}_register(host); if (rc != 0) return rc; }`)
    .join('\n');
  const source = `struct RayactHost;\n\n${declarations}${declarations ? '\n\n' : '\n'}extern "C" int rayact_module_register(const RayactHost* host) {\n${calls}${calls ? '\n' : ''}    return 0;\n}\n`;
  fs.writeFileSync(path.join(iosDir, 'RayactModules.mm'), source);
}

/**
 * Generate the Android build wiring for modules that ship sources.
 *
 * Consumers link prebuilt `.so` files copied into jniLibs, so they need nothing here.
 * A source checkout (the dev app) instead compiles first-party plugins alongside the
 * engine, and that list used to be hand-maintained in two places — a CMake block per
 * module and a target name in build.gradle — which silently went stale whenever a
 * module was added. Both are now derived from the installed dependencies.
 *
 * Writes two files, each a no-op when no installed module declares `nativeSources`:
 *   <cpp>/rayact-modules.cmake     an add_library() per module, included by CMakeLists
 *   <android>/rayact-module-targets.txt   target names, read by build.gradle
 */
export function writeAndroidModuleBuildFiles(
  androidDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): string[] {
  const buildable = plugins.filter(plugin => (plugin.manifest.nativeSources ?? []).length > 0);
  const cppDir = path.join(androidDir, 'app/src/main/cpp');
  const blocks = buildable.map(plugin => {
    const lib = plugin.manifest.library;
    const sources = (plugin.manifest.nativeSources ?? [])
      .map(item => `    \${RAYACT_REPO_ROOT}/${item}`)
      .join('\n');
    const includes = [
      'native/core',
      ...(plugin.manifest.nativeIncludeDirs ?? []),
    ]
      .map(item => `    \${RAYACT_REPO_ROOT}/${item}`)
      .join('\n');
    return [
      `# ${plugin.jsPackage}`,
      `add_library(${lib} SHARED`,
      sources,
      `)`,
      `target_include_directories(${lib} PRIVATE`,
      includes,
      `)`,
      `target_link_libraries(${lib} log)`,
      ...((plugin.manifest.nativeDefines ?? []).length > 0
        ? [`target_compile_definitions(${lib} PRIVATE ${(plugin.manifest.nativeDefines ?? []).join(' ')})`]
        : []),
    ].join('\n');
  });

  const header = [
    '# Generated by rayact prebuild — do not edit.',
    '# One shared library per installed native module that ships sources.',
    '# Set RAYACT_REPO_ROOT before including this file.',
    '',
  ].join('\n');
  fs.mkdirSync(cppDir, { recursive: true });
  fs.writeFileSync(path.join(cppDir, 'rayact-modules.cmake'), `${header}${blocks.join('\n\n')}\n`);

  const targets = buildable.map(plugin => plugin.manifest.library);
  fs.writeFileSync(
    path.join(androidDir, 'rayact-module-targets.txt'),
    targets.length > 0 ? `${targets.join('\n')}\n` : ''
  );
  return targets;
}

function gradleString(value: string): string {
  return `'${value.replace(/\\/g, '/').replace(/'/g, "\\'")}'`;
}

function packagePath(plugin: ResolvedPlugin, relative: string): string {
  return path.resolve(plugin.packageDir, relative);
}

/**
 * Generate dependency-driven Android source/project/manifest wiring.
 *
 * The template contains only two stable `apply from:` hooks. Everything that
 * names an optional package lives in these generated files and disappears on
 * the next prebuild after the dependency is removed.
 */
export function writeAndroidPlatformAutolinking(
  androidDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const androidPlugins = plugins.filter(plugin => plugin.manifest.platforms.includes('android'));
  const settings: string[] = ['// Generated by rayact prebuild — do not edit.'];
  const app: string[] = ['// Generated by rayact prebuild — do not edit.'];
  const projectDependencies: string[] = [];
  const sourceDirs: string[] = [];
  const resourceDirs: string[] = [];
  const mavenDependencies: string[] = [];
  const registrations: string[] = [];
  const usesEntries: string[] = [];
  const applicationEntries: string[] = [];

  for (const plugin of androidPlugins) {
    const android = plugin.manifest.android;
    if (!android) continue;
    if (android.project) {
      const projectName = `rayact_${plugin.manifest.name.replace(/-/g, '_')}`;
      settings.push(
        `include ':${projectName}'`,
        `project(':${projectName}').projectDir = file(${gradleString(packagePath(plugin, android.project))})`,
      );
      projectDependencies.push(`    implementation project(':${projectName}')`);
    }
    for (const dependency of android.dependencies ?? []) {
      mavenDependencies.push(`    implementation ${gradleString(dependency)}`);
    }
    for (const source of android.sourceDirs ?? []) sourceDirs.push(packagePath(plugin, source));
    for (const resource of android.resourceDirs ?? []) resourceDirs.push(packagePath(plugin, resource));
    if (android.registrationClass) registrations.push(android.registrationClass);
    if (android.manifest) {
      const manifestPath = packagePath(plugin, android.manifest);
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`Missing ${plugin.jsPackage} Android manifest: ${android.manifest}`);
      }
      const xml = fs.readFileSync(manifestPath, 'utf8');
      usesEntries.push(...(xml.match(/<uses-(?:permission|feature)\b[^>]*\/>/g) ?? []));
      const application = xml.match(/<application\b[^>]*>([\s\S]*?)<\/application>/);
      if (application?.[1]?.trim()) applicationEntries.push(application[1].trim());
    }
  }

  if (sourceDirs.length || resourceDirs.length) {
    app.push('android {', '    sourceSets {', '        main {');
    if (sourceDirs.length) app.push(`            java.srcDirs += [${sourceDirs.map(gradleString).join(', ')}]`);
    if (resourceDirs.length) app.push(`            res.srcDirs += [${resourceDirs.map(gradleString).join(', ')}]`);
    app.push('        }', '    }', '}');
  }
  if (projectDependencies.length || mavenDependencies.length) {
    app.push('dependencies {', ...projectDependencies, ...mavenDependencies, '}');
  }

  fs.writeFileSync(path.join(androidDir, 'rayact-autolink-settings.gradle'), `${settings.join('\n')}\n`);
  fs.writeFileSync(path.join(androidDir, 'rayact-autolink.gradle'), `${app.join('\n')}\n`);

  const generatedDir = path.join(androidDir, 'app/src/main/java/com/rayact/generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  const registrySource = [
    'package com.rayact.generated',
    '',
    'import android.content.Context',
    'import com.rayact.engine.RayactPlatformRegistry',
    '',
    'object RayactGeneratedModules {',
    '    @JvmStatic fun register(context: Context, registry: RayactPlatformRegistry) {',
    ...registrations.map(type => `        ${type}().register(context, registry)`),
    '    }',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(generatedDir, 'RayactGeneratedModules.kt'), registrySource);

  const manifestModuleDir = path.join(androidDir, 'rayact-autolink-manifest');
  fs.mkdirSync(path.join(manifestModuleDir, 'src/main'), { recursive: true });
  fs.writeFileSync(
    path.join(manifestModuleDir, 'build.gradle'),
    [
      "plugins { id 'com.android.library' }",
      "android { namespace 'com.rayact.autolink.manifest'; compileSdk 36; defaultConfig { minSdk 26 } }",
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(manifestModuleDir, 'src/main/AndroidManifest.xml'),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      ...[...new Set(usesEntries)].map(entry => `    ${entry}`),
      '    <application>',
      ...[...new Set(applicationEntries)].map(entry => `        ${entry}`),
      '    </application>',
      '</manifest>',
      '',
    ].join('\n')
  );
  // The generated manifest carrier is itself optional: it is linked only when
  // at least one selected package contributed manifest content.
  if (usesEntries.length || applicationEntries.length) {
    fs.appendFileSync(
      path.join(androidDir, 'rayact-autolink-settings.gradle'),
      "include ':rayact-autolink-manifest'\nproject(':rayact-autolink-manifest').projectDir = file('rayact-autolink-manifest')\n"
    );
    fs.appendFileSync(
      path.join(androidDir, 'rayact-autolink.gradle'),
      "dependencies { implementation project(':rayact-autolink-manifest') }\n"
    );
  }
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function plistXmlValue(value: string | number | boolean | string[]): string {
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') return `<real>${value}</real>`;
  if (Array.isArray(value)) {
    return `<array>${value.map(item => `<string>${item.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</string>`).join('')}</array>`;
  }
  return `<string>${value.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</string>`;
}

function applyInfoPlistValues(file: string, values: Record<string, string | number | boolean | string[]>): void {
  if (!fs.existsSync(file) || Object.keys(values).length === 0) return;
  let xml = fs.readFileSync(file, 'utf8');
  for (const key of Object.keys(values)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    xml = xml.replace(
      new RegExp(
        `\\s*<key>${escaped}</key>\\s*` +
        `(?:<string>[\\s\\S]*?</string>|<real>[\\s\\S]*?</real>|` +
        `<(?:true|false)/>|<array>[\\s\\S]*?</array>)`,
        'g',
      ),
      '',
    );
  }
  const entries = Object.entries(values)
    .map(([key, value]) => `\t<key>${key}</key>\n\t${plistXmlValue(value)}`)
    .join('\n');
  xml = insertBeforeRootPlistClose(xml, entries);
  fs.writeFileSync(file, xml);
}

/** Generate xcodegen sources, resources, frameworks, plist values and registrant. */
export function writeIosPlatformAutolinking(
  iosDir: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const iosPlugins = plugins.filter(plugin => plugin.manifest.platforms.includes('ios') && plugin.manifest.ios);
  const autolinkDir = path.join(iosDir, 'Autolinked');
  fs.rmSync(autolinkDir, { recursive: true, force: true });
  fs.mkdirSync(autolinkDir, { recursive: true });
  const frameworks = new Set<string>();
  const plistValues: Record<string, string | number | boolean | string[]> = {};
  const registrations: string[] = [];
  const resourcePaths: string[] = [];

  for (const plugin of iosPlugins) {
    const ios = plugin.manifest.ios!;
    const packageDir = path.join(autolinkDir, plugin.manifest.name);
    for (const source of ios.sources ?? []) {
      const from = packagePath(plugin, source);
      if (!fs.existsSync(from)) throw new Error(`Missing ${plugin.jsPackage} iOS source: ${source}`);
      const to = path.join(packageDir, 'Sources', path.basename(from));
      if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
    for (const resource of ios.resources ?? []) {
      const from = packagePath(plugin, resource);
      if (!fs.existsSync(from)) throw new Error(`Missing ${plugin.jsPackage} iOS resource: ${resource}`);
      const to = path.join(packageDir, 'Resources', path.basename(from));
      if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
      resourcePaths.push(path.relative(iosDir, to).split(path.sep).join('/'));
    }
    for (const framework of ios.frameworks ?? []) frameworks.add(framework);
    Object.assign(plistValues, ios.infoPlist ?? {});
    if (ios.registrationType) registrations.push(ios.registrationType);
  }

  const generated = [
    'import Foundation',
    '',
    'enum RayactGeneratedModules {',
    '    static func register(with registry: RayactPlatformRegistry) {',
    ...registrations.map(type => `        ${type}().register(with: registry)`),
    '    }',
    '}',
    '',
    '@_cdecl("RayactRegisterGeneratedModules")',
    'public func RayactRegisterGeneratedModules() {',
    '    RayactGeneratedModules.register(with: RayactPlatformRegistry.shared)',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(autolinkDir, 'RayactGeneratedModules.swift'), generated);

  const projectFile = path.join(iosDir, 'project.yml');
  const lines = [
    ...[...frameworks].sort().flatMap(framework => [
      '      - sdk: ' + yamlScalar(`${framework}.framework`),
    ]),
    ...resourcePaths.sort().flatMap(resource => [
      '      - bundle: ' + yamlScalar(resource),
    ]),
  ];
  let project = fs.readFileSync(projectFile, 'utf8');
  const moduleMarker = '    # RAYACT_AUTOLINKED_MODULES';
  const platformMarker = '    # RAYACT_AUTOLINKED_PLATFORM_DEPENDENCIES';
  const start = project.indexOf(moduleMarker);
  const end = project.indexOf(
    platformMarker,
    start >= 0 ? start + moduleMarker.length : 0,
  );
  if (start >= 0 && end >= 0) {
    const before = project.slice(0, start + moduleMarker.length);
    const after = project.slice(end + platformMarker.length);
    project =
      `${before}\n${lines.length ? `${lines.join('\n')}\n` : ''}` +
      `${platformMarker}${after}`;
    fs.writeFileSync(projectFile, project);
  } else if (end >= 0) {
    // Older/custom templates may expose only the platform marker.
    const escapedMarker =
      platformMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    project = project.replace(
      new RegExp(`(?:      - (?:sdk|bundle): [^\\n]+\\n)*${escapedMarker}`),
      `${lines.length ? `${lines.join('\n')}\n` : ''}${platformMarker}`,
    );
    fs.writeFileSync(projectFile, project);
  }
  applyInfoPlistValues(path.join(iosDir, 'Info.plist'), plistValues);
  applyInfoPlistValues(path.join(iosDir, 'Info-Release.plist'), plistValues);
}

export function copyDesktopPluginArtifacts(
  projectRoot: string,
  plugins: ReturnType<typeof resolveRayactPlugins>
): void {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform;
  const arch = process.arch === 'x64' ? 'x86_64' : 'arm64';
  const destination = path.join(projectRoot, RAYACT_ASSETS_DIR, 'modules');
  if (platform === 'darwin') {
    fs.rmSync(path.join(destination, 'librayact_webview.dylib'), { force: true });
    fs.rmSync(path.join(destination, 'rayact_webview.dylib'), { force: true });
  }
  for (const plugin of plugins) {
    // The macOS host statically owns its WKWebView platform-view classes. A
    // second dylib copy would make Objective-C load duplicate class names
    // before rayact_module_register can reject the redundant registration.
    // Windows uses the separately shipped CEF module, so keep staging it there.
    if (platform === 'darwin' && plugin.name === 'webview') continue;
    for (const artifact of plugin.manifest.artifacts.filter(
      item => item.platform === platform && item.architecture === arch
    )) {
      const source = verifyModuleArtifact(plugin, artifact);
      fs.mkdirSync(destination, { recursive: true });
      // Desktop modules may have adjacent runtime dependencies. CEF, for
      // example, requires libcef.dll, its subprocess, resources and locales to
      // remain beside librayact_webview.dll. Merge the artifact directory, not
      // just the manifest's entry-point library.
      copyDirRecursive(path.dirname(source), destination);
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
    throw new Error(
      `Missing @rayact/template-android (required for \`rayact prebuild --android\`).\n` +
        `Add it to your project's package.json dependencies at version ${RAYACT_ENGINE_VERSION}, ` +
        `matching your other @rayact/* packages, then reinstall.`
    );
  }

  const packageName = options.android?.packageName ?? 'com.rayact.app';
  const appName = options.appName?.trim() || options.android?.appName?.trim() || 'Rayact';
  const devClient = options.devClient !== false;

  if (fs.existsSync(androidDir) && !options.force && fs.existsSync(path.join(androidDir, 'gradlew'))) {
    console.warn(`Updating prebuilt jniLibs in existing Android project: ${androidDir}`);
    updateAndroidHostInfrastructure(templateAndroid, androidDir);
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
  writeAndroidPlatformAutolinking(androidDir, enabledPlugins);
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
    writeIosPlatformAutolinking(iosDir, enabledPlugins);
  } else {
    // iOS scaffolding is optional (Android-only / desktop-only builds are
    // valid), so warn rather than throw — but don't skip silently, or a
    // missing dependency looks like the iOS project just never generated.
    console.warn(
      `warning: skipping iOS project — missing @rayact/template-ios. ` +
        `Add it to your project's package.json dependencies at version ${RAYACT_ENGINE_VERSION}, ` +
        `matching your other @rayact/* packages, if you need \`rayact prebuild --ios\`.`
    );
  }

  applyLinkingConfiguration(androidDir, templateIos ? iosDir : null, options.linking?.schemes);

  writeNativeModulesManifest(projectRoot, nativeModules);
  copyDesktopPluginArtifacts(projectRoot, enabledPlugins);
  fs.mkdirSync(path.join(projectRoot, RAYACT_ASSETS_DIR), { recursive: true });

  return { androidDir, iosDir: templateIos ? iosDir : null, nativeModules };
}
