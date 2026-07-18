#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const assetsDir = path.resolve(root, args[args.indexOf('--assets') + 1] ?? 'release1');
const requireSignature = args.includes('--require-signature');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tarJson = (tarball, member) => {
  const result = spawnSync('tar', ['-xOf', tarball, member], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
};
const packageTarballs = fs.readdirSync(assetsDir).filter(name => name.endsWith('.tgz')).sort();
const packages = packageTarballs.map(filename => {
  const tarball = path.join(assetsDir, filename);
  const manifest = tarJson(tarball, 'package/package.json');
  if (!manifest) throw new Error(`Cannot inspect ${filename}`);
  const nativeModule = tarJson(tarball, 'package/rayact.module.json');
  const prebuilt = tarJson(tarball, 'package/manifest.json');
  return {
    name: manifest.name,
    version: manifest.version,
    tarball: filename,
    sha256: sha256(tarball),
    ...(nativeModule ? {
      nativeModule: {
        name: nativeModule.name,
        abiRange: nativeModule.abiRange,
        engineRange: nativeModule.engineRange,
        platforms: nativeModule.platforms,
        architectures: nativeModule.architectures,
        artifacts: nativeModule.artifacts,
      },
    } : {}),
    ...(prebuilt ? {
      prebuilt: {
        engineVersion: prebuilt.engineVersion,
        engineAbiVersion: prebuilt.moduleAbiVersion,
        platform: prebuilt.platform,
        architecture: prebuilt.arch,
      },
    } : {}),
  };
}).sort((a, b) => a.name === 'rayact' ? 1 : b.name === 'rayact' ? -1 : a.name.localeCompare(b.name));
const version = packages.find(item => item.name === 'rayact')?.version ?? '0.0.3';
if (packages.some(item => item.version !== version)) throw new Error('Release-set package versions are not lockstep');
const artifacts = fs.readdirSync(assetsDir)
  .filter(name => !name.endsWith('.tgz') && name !== 'SHA256SUMS' && name !== 'release-set.json' && name !== 'release-set.sig' && fs.statSync(path.join(assetsDir, name)).isFile())
  .sort()
  .map(filename => ({ filename, sha256: sha256(path.join(assetsDir, filename)) }));
const epoch = process.env.SOURCE_DATE_EPOCH ?? spawnSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const epochMs = /^\d+$/.test(epoch) ? Number(epoch) * 1000 : Date.parse(epoch);
const packageNames = new Set(packages.map(item => item.name));
const supportedPlatforms = [];
if (packageNames.has('@rayact/prebuilt-android-arm64') && packageNames.has('@rayact/prebuilt-android-x64')) supportedPlatforms.push('android');
if (packageNames.has('@rayact/prebuilt-ios-arm64')) supportedPlatforms.push('ios');
if (packageNames.has('@rayact/prebuilt-darwin-arm64')) supportedPlatforms.push('macos');
if (packageNames.has('@rayact/prebuilt-web-wasm')) supportedPlatforms.push('web');
const releaseSet = {
  schemaVersion: 1,
  version,
  createdAt: new Date(epochMs).toISOString(),
  engineAbiVersion: 1,
  supportedPlatforms,
  previewPlatforms: packageNames.has('@rayact/prebuilt-linux-x64') ? ['linux'] : [],
  packages,
  artifacts,
  devApp: {
    package: '@rayact/dev-app',
    version,
    builds: artifacts.filter(item => /^rayact-dev-app(?:\.|-)/.test(item.filename)),
  },
};
const canonical = `${JSON.stringify(releaseSet, null, 2)}\n`;
fs.writeFileSync(path.join(assetsDir, 'release-set.json'), canonical);
const privateKey = process.env.RAYACT_RELEASE_PRIVATE_KEY;
if (privateKey) {
  fs.writeFileSync(path.join(assetsDir, 'release-set.sig'), crypto.sign(null, Buffer.from(canonical), privateKey).toString('base64') + '\n');
} else if (requireSignature) {
  throw new Error('RAYACT_RELEASE_PRIVATE_KEY is required for a signed release set');
}
console.log(`Generated release-set.json for ${packages.length} package(s).`);
