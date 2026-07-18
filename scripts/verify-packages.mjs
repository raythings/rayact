#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  ...fs.readdirSync(path.join(root, 'packages')).map(name => path.join(root, 'packages', name)),
  path.join(root, 'apps/dev-app'),
].filter(directory => fs.existsSync(path.join(directory, 'package.json')));
const packages = candidates.map(directory => ({
  directory,
  manifest: JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')),
})).filter(item => !item.manifest.private);
const byName = new Map(packages.map(item => [item.manifest.name, item]));
const failures = [];
const OPTIONAL_MODULE_BINARY = /^librayact_(?:mmkv|secure_store|crash_reporter)(?:[-.].*)?$/;
const OPTIONAL_REGISTRATION_SYMBOL = /(?:^|\n)[^\n]*\s[A-TV-Z]\s+_?rayact_(?:mmkv|secure_store|crash_reporter)_register(?:\s|$)/m;
const GENERIC_ENGINE_BINARY = /^(?:librayact\.so|rayact_desktop|libRayactEngine\.a|rayact\.wasm)$/;
const PREBUILT_ARCHITECTURES = new Map([
  ['@rayact/prebuilt-android-arm64', ['jni/arm64-v8a/librayact.so', /ARM aarch64|arm64/i]],
  ['@rayact/prebuilt-android-x64', ['jni/x86_64/librayact.so', /x86-64|x86_64/i]],
  ['@rayact/prebuilt-darwin-arm64', ['bin/rayact_desktop', /arm64/i]],
  ['@rayact/prebuilt-darwin-x64', ['bin/rayact_desktop', /x86_64/i]],
  ['@rayact/prebuilt-linux-x64', ['bin/rayact_desktop', /x86-64|x86_64/i]],
]);
const ANDROID_DEVTOOLS_JNI_SYMBOL = 'Java_com_rayact_engine_RayactEngineSession_nativeDisableDevtools';

function findMisplacedOptionalArtifacts(directory) {
  const found = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && OPTIONAL_MODULE_BINARY.test(entry.name)) {
        found.push(path.relative(root, absolute));
      }
    }
  };
  visit(directory);
  return found;
}

function findGenericEngineBinaries(directory) {
  const found = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && GENERIC_ENGINE_BINARY.test(entry.name)) found.push(absolute);
    }
  };
  visit(directory);
  return found;
}

function artifactDigest(target) {
  const hash = crypto.createHash('sha256');
  if (fs.statSync(target).isFile()) return hash.update(fs.readFileSync(target)).digest('hex');
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(target, absolute).split(path.sep).join('/');
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relative}\0`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) hash.update(fs.readFileSync(absolute));
    }
  };
  visit(target);
  return hash.digest('hex');
}

for (const { directory, manifest } of packages) {
  const rel = path.relative(root, directory);
  if (manifest.version !== '0.0.3') failures.push(`${manifest.name}: version must be 0.0.3`);
  for (const key of ['license', 'repository', 'files']) {
    if (!manifest[key]) failures.push(`${manifest.name}: missing ${key}`);
  }
  if (!manifest.maintainers) failures.push(`${manifest.name}: missing maintainers`);
  if (manifest.name.startsWith('@rayact/prebuilt-')) {
    for (const artifact of findMisplacedOptionalArtifacts(directory)) {
      failures.push(`${manifest.name}: optional module artifact is misplaced in generic prebuilt: ${artifact}`);
    }
    for (const binary of findGenericEngineBinaries(directory)) {
      const symbols = spawnSync('nm', ['-g', binary], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const strings = symbols.status === 0 ? null : spawnSync('strings', [binary], {
        encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
      });
      const containsRegistration = symbols.status === 0
        ? OPTIONAL_REGISTRATION_SYMBOL.test(symbols.stdout)
        : strings?.status === 0 && /rayact_(?:mmkv|secure_store|crash_reporter)_register/.test(strings.stdout);
      if (containsRegistration) {
        failures.push(`${manifest.name}: optional module registration is embedded in generic engine: ${path.relative(root, binary)}`);
      }
    }
    const architecture = PREBUILT_ARCHITECTURES.get(manifest.name);
    if (architecture) {
      const [relativeBinary, expected] = architecture;
      const binary = path.join(directory, relativeBinary);
      if (fs.existsSync(binary)) {
        const result = spawnSync('file', [binary], { encoding: 'utf8' });
        if (result.status !== 0 || !expected.test(result.stdout)) {
          failures.push(`${manifest.name}: binary architecture does not match package name: ${path.relative(root, binary)}`);
        }
      }
      if (manifest.name.startsWith('@rayact/prebuilt-android-')) {
        const debugRelativeBinary = relativeBinary.replace(/^jni\//, 'jni-debug/');
        const debugBinary = path.join(directory, debugRelativeBinary);
        if (!fs.existsSync(debugBinary)) {
          failures.push(`${manifest.name}: missing configuration-specific debug engine: ${debugRelativeBinary}`);
        } else {
          const debugArchitecture = spawnSync('file', [debugBinary], { encoding: 'utf8' });
          if (debugArchitecture.status !== 0 || !expected.test(debugArchitecture.stdout)) {
            failures.push(`${manifest.name}: debug binary architecture does not match package name: ${path.relative(root, debugBinary)}`);
          }
          const debugSymbols = spawnSync('nm', ['-g', debugBinary], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
          if (debugSymbols.status !== 0 || !debugSymbols.stdout.includes(ANDROID_DEVTOOLS_JNI_SYMBOL)) {
            failures.push(`${manifest.name}: debug engine is missing native DevTools JNI entry points`);
          }
        }
        if (fs.existsSync(binary)) {
          const releaseSymbols = spawnSync('nm', ['-g', binary], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
          if (releaseSymbols.status === 0 && releaseSymbols.stdout.includes(ANDROID_DEVTOOLS_JNI_SYMBOL)) {
            failures.push(`${manifest.name}: release engine unexpectedly contains native DevTools JNI entry points`);
          }
        }
      }
    }
  }
  if (manifest.sideEffects === undefined) failures.push(`${manifest.name}: missing sideEffects metadata`);
  const publishesJavaScript = Boolean(manifest.main || manifest.module || manifest.exports);
  if (publishesJavaScript && !manifest.exports) failures.push(`${manifest.name}: JavaScript package must declare exports`);
  const serialized = JSON.stringify(manifest);
  if (/"(?:file:|workspace:)/.test(serialized)) failures.push(`${manifest.name}: local dependency reference in ${rel}/package.json`);
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const [dependency, range] of Object.entries(manifest[section] ?? {})) {
      if (byName.has(dependency) && range !== manifest.version) failures.push(`${manifest.name}: ${dependency} must use exact ${manifest.version}`);
    }
  }
}

const visiting = new Set();
const visited = new Set();
const visit = (name, chain = []) => {
  if (visiting.has(name)) failures.push(`package cycle: ${[...chain, name].join(' -> ')}`);
  if (visited.has(name) || visiting.has(name)) return;
  visiting.add(name);
  const pkg = byName.get(name)?.manifest;
  for (const dependency of Object.keys({ ...pkg?.dependencies, ...pkg?.optionalDependencies })) {
    if (byName.has(dependency)) visit(dependency, [...chain, name]);
  }
  visiting.delete(name);
  visited.add(name);
};
for (const name of byName.keys()) visit(name);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-packs-'));
const tarballs = [];
try {
  for (const { directory, manifest } of packages) {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], {
      cwd: directory,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`${manifest.name}: npm pack failed\n${result.stderr}`);
    const [{ filename, files }] = JSON.parse(result.stdout);
    const tarball = path.join(out, filename);
    tarballs.push(tarball);
    const names = files.map(file => file.path);
    const packedManifestResult = spawnSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' });
    if (packedManifestResult.status !== 0) throw new Error(`${manifest.name}: packed package.json is unreadable`);
    const packedManifest = JSON.parse(packedManifestResult.stdout);
    if (/"(?:file:|workspace:)/.test(JSON.stringify(packedManifest))) {
      throw new Error(`${manifest.name}: local dependency reference remains in packed package.json`);
    }
    if (!manifest.name.startsWith('@rayact/template-') && names.some(name =>
      !name.startsWith('dist/templates/') &&
      ((/(^|\/)src\//.test(name) && !name.startsWith('native/src/')) ||
        (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)))
    )) {
      throw new Error(`${manifest.name}: source file leaked into tarball`);
    }
    for (const target of Object.values(manifest.exports ?? {})) {
      if (typeof target === 'object' && target.types && !names.includes(target.types.replace(/^\.\//, ''))) {
        throw new Error(`${manifest.name}: missing declaration ${target.types}`);
      }
    }
    const moduleManifestPath = manifest.rayact?.manifest?.replace(/^\.\//, '');
    if (moduleManifestPath) {
      if (!names.includes(moduleManifestPath)) {
        throw new Error(`${manifest.name}: missing ${moduleManifestPath} from tarball`);
      }
      const moduleManifest = JSON.parse(fs.readFileSync(path.join(directory, moduleManifestPath), 'utf8'));
      for (const artifact of moduleManifest.artifacts ?? []) {
        const artifactPath = String(artifact.path ?? '').replace(/^\.\//, '').replace(/\/$/, '');
        if (!artifactPath || !names.some(name => name === artifactPath || name.startsWith(`${artifactPath}/`))) {
          throw new Error(`${manifest.name}: native artifact ${artifact.path} missing from tarball`);
        }
        const sourceArtifact = path.join(directory, artifactPath);
        if (artifactDigest(sourceArtifact) !== artifact.sha256) {
          throw new Error(`${manifest.name}: native artifact ${artifact.path} checksum does not match its manifest`);
        }
      }
    }
  }
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-install-'));
  fs.writeFileSync(path.join(installRoot, 'package.json'), '{"name":"rayact-pack-test","private":true}');
  const result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], {
    cwd: installRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`tarball-only install failed\n${result.stdout}\n${result.stderr}`);
  fs.rmSync(installRoot, { recursive: true, force: true });
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

console.log(`Verified and installed ${packages.length} packed workspaces.`);
