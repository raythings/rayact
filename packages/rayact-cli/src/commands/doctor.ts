import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRayactConfig } from '@rayact/dev-server';
import {
  RAYACT_ENGINE_VERSION,
  RAYACT_MODULE_ABI_VERSION,
  resolveDesktopBinPrebuilt,
  resolvePrebuiltAndroidDir,
  resolvePackageDir,
  resolveTemplateAndroidDir,
  resolveTemplateIosDir,
  readPrebuiltManifest,
  resolveRayactPlugins,
  mergeNativeModules
} from '@rayact/prebuild';

export type DoctorStatus = 'pass' | 'warn' | 'fail';
export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

/** Minimum Node major Rayact's tooling requires. */
export const NODE_MIN_MAJOR = 22;
/** Highest Node major this release was tested against. */
export const NODE_MAX_TESTED_MAJOR = 24;

/**
 * Node support, kept in lockstep with the `engines` field in every package.json
 * (`>=22`). Shared so `rayact doctor` and the CLI entry point agree instead of
 * relying on npm's passive EBADENGINE warning.
 *
 * Only the floor is enforced: newer majors are reported as untested (a warning)
 * rather than blocked, so a Node upgrade never bricks an existing project.
 */
export function checkNodeVersion(version = process.versions.node): {
  ok: boolean;
  untested: boolean;
  major: number;
  version: string;
} {
  const major = Number(version.split('.')[0]);
  return {
    ok: major >= NODE_MIN_MAJOR,
    untested: major > NODE_MAX_TESTED_MAJOR,
    major,
    version
  };
}

function commandExists(command: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [command], { stdio: 'ignore' }).status === 0;
}

function checkPackagePresent(label: string, dir: string | null, purpose: string): DoctorCheck {
  return dir
    ? { name: label, status: 'pass', detail: 'installed' }
    : {
        name: label,
        status: 'warn',
        detail: `not installed — add it to your project's dependencies at version ${RAYACT_ENGINE_VERSION} for ${purpose}`
      };
}

function checkManifest(label: string, dir: string | null): DoctorCheck {
  if (!dir) return { name: label, status: 'warn', detail: 'not installed; prebuild will download it' };
  const manifest = readPrebuiltManifest(dir);
  if (!manifest) return { name: label, status: 'fail', detail: 'manifest.json is missing or invalid' };
  if (manifest.moduleAbiVersion !== RAYACT_MODULE_ABI_VERSION) {
    return {
      name: label,
      status: 'fail',
      detail: `module ABI ${manifest.moduleAbiVersion}; CLI requires ${RAYACT_MODULE_ABI_VERSION}`
    };
  }
  const skew = manifest.engineVersion !== RAYACT_ENGINE_VERSION
    ? ` (engine version ${manifest.engineVersion}; CLI ${RAYACT_ENGINE_VERSION})`
    : '';
  return { name: label, status: skew ? 'warn' : 'pass', detail: `ABI ${manifest.moduleAbiVersion}${skew}` };
}

export function collectDoctorChecks(root = process.cwd()): DoctorCheck[] {
  const config = loadRayactConfig(root);
  const node = checkNodeVersion();
  const checks: DoctorCheck[] = [
    {
      name: 'Node.js',
      status: node.ok ? (node.untested ? 'warn' : 'pass') : 'fail',
      detail: !node.ok
        ? `${process.version} — Rayact requires Node >=${NODE_MIN_MAJOR}`
        : node.untested
          ? `${process.version} — newer than the tested ${NODE_MAX_TESTED_MAJOR}.x; supported but unverified`
          : process.version
    },
    {
      name: 'CMake',
      status: commandExists('cmake') ? 'pass' : 'warn',
      detail: commandExists('cmake') ? 'available' : 'not found (only needed for source-native builds)'
    }
  ];

  const desktop = resolveDesktopBinPrebuilt(root);
  checks.push(desktop
    ? desktop.manifest
      ? checkManifest(`Desktop host (${desktop.source})`, path.resolve(path.dirname(desktop.bin), '..'))
      : { name: `Desktop host (${desktop.source})`, status: 'pass', detail: desktop.bin }
    : { name: 'Desktop host', status: 'warn', detail: 'not installed or built' });
  checks.push(checkManifest('Android prebuilt', resolvePrebuiltAndroidDir(root)));
  checks.push(checkManifest('iOS prebuilt', resolvePackageDir(root, '@rayact/prebuilt-ios-arm64')));
  checks.push(checkPackagePresent('@rayact/template-android', resolveTemplateAndroidDir(root), '`rayact prebuild --android`'));
  checks.push(checkPackagePresent('@rayact/template-ios', resolveTemplateIosDir(root), '`rayact prebuild --ios`'));
  checks.push(checkPackagePresent('@rayact/dev-client', resolvePackageDir(root, '@rayact/dev-client'), 'the Android/iOS dev-client overlay'));

  const resolvedPlugins = resolveRayactPlugins(root);
  const plugins = new Map(resolvedPlugins.map(plugin => [plugin.name, plugin]));
  for (const module of mergeNativeModules(config.nativeModules, resolvedPlugins)) {
    if (!module.lib) {
      checks.push({ name: `Module ${module.name}`, status: 'pass', detail: 'integrated into engine' });
      continue;
    }
    const plugin = plugins.get(module.name);
    if (!plugin) {
      checks.push({ name: `Module ${module.name}`, status: 'fail', detail: `plugin package not installed (${module.jsPackage ?? module.lib})` });
      continue;
    }
    const platforms = plugin.manifest.platforms.join(', ') || 'unspecified';
    checks.push({ name: `Module ${module.name}`, status: 'pass', detail: `installed; platforms: ${platforms}` });
  }

  if (config.android) {
    checks.push({ name: 'Android SDK/adb', status: commandExists('adb') ? 'pass' : 'warn', detail: commandExists('adb') ? 'adb available' : 'adb not found' });
    checks.push({ name: 'Java', status: commandExists('java') ? 'pass' : 'fail', detail: commandExists('java') ? 'available' : 'Java 17 is required' });
  }
  if (process.platform === 'darwin') {
    checks.push({ name: 'Xcode', status: commandExists('xcodebuild') ? 'pass' : 'fail', detail: commandExists('xcodebuild') ? 'xcodebuild available' : 'Xcode command-line tools missing' });
    checks.push({ name: 'XcodeGen', status: commandExists('xcodegen') ? 'pass' : 'warn', detail: commandExists('xcodegen') ? 'available' : 'install with brew install xcodegen' });
    const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
    const signed = identities.status === 0 && !String(identities.stdout).includes('0 valid identities found');
    checks.push({ name: 'Apple signing', status: signed ? 'pass' : 'warn', detail: signed ? 'code-signing identity available' : 'no valid signing identity (simulator builds still work)' });
  }

  checks.push({
    name: 'Web requirements',
    status: 'pass',
    detail: 'rayact serve supplies COOP=same-origin and COEP=require-corp; runtime verifies WebGPU'
  });

  const configuredAndroidDir = path.resolve(root, config.android?.projectDir ?? 'android');
  const androidDir = fs.existsSync(path.join(configuredAndroidDir, 'gradlew'))
    ? configuredAndroidDir
    : path.resolve(root, 'apps/android');
  const iosDir = path.resolve(root, config.ios?.projectDir ?? 'ios');
  if (fs.existsSync(androidDir)) {
    checks.push({ name: 'Android prebuild integrity', status: fs.existsSync(path.join(androidDir, 'gradlew')) ? 'pass' : 'fail', detail: androidDir });
  }
  if (fs.existsSync(iosDir)) {
    const framework = path.join(iosDir, 'Frameworks/RayactEngine.xcframework/Info.plist');
    checks.push({ name: 'iOS prebuild integrity', status: fs.existsSync(framework) ? 'pass' : 'fail', detail: fs.existsSync(framework) ? 'engine XCFramework linked' : 'engine XCFramework missing' });
  }
  return checks;
}

export function runDoctor(): void {
  const checks = collectDoctorChecks();
  console.log('Rayact doctor\n');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗';
    console.log(`${icon} ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter(check => check.status === 'fail').length;
  const warnings = checks.filter(check => check.status === 'warn').length;
  console.log(`\n${failures ? `${failures} failure(s), ` : ''}${warnings} warning(s)`);
  if (failures) process.exitCode = 1;
}
