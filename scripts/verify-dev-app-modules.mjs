#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'packages/first-party-modules.json'), 'utf8'));
const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'apps/dev-app/capabilities.json'), 'utf8'));
const smokeSource = fs.readFileSync(path.join(root, 'apps/dev-app/src/ModuleTest.tsx'), 'utf8');
const rayactPackage = JSON.parse(fs.readFileSync(path.join(root, 'packages/rayact/package.json'), 'utf8'));
const advertised = new Set(capabilities.modules.map(module => module.name));
const failures = [];

for (const module of catalog.modules.filter(module => module.officialDevApp)) {
  if (!advertised.has(module.name)) failures.push(`${module.name}: omitted from capability manifest`);
  if (!module.smokeTest || !smokeSource.includes(module.smokeTest)) failures.push(`${module.name}: smoke test is not registered`);
  if (!module.pluginPackage) {
    const exportName = module.jsPackage.replace(/^rayact/, '.') || '.';
    if (!rayactPackage.exports[exportName]) failures.push(`${module.name}: JS wrapper ${module.jsPackage} is not exported`);
  }
  if (module.pluginPackage) {
    const packageDir = path.join(root, 'packages', `rayact-${module.name}`);
    const packageManifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    if (packageManifest.name !== module.pluginPackage) failures.push(`${module.name}: package identity mismatch`);
    const manifestPath = path.join(packageDir, packageManifest.rayact?.manifest ?? 'rayact.module.json');
    if (!fs.existsSync(manifestPath)) failures.push(`${module.name}: module manifest missing`);
    else {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const artifact of manifest.artifacts ?? []) {
        if (!fs.existsSync(path.join(packageDir, artifact.path))) failures.push(`${module.name}: missing ${artifact.path}`);
        if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) failures.push(`${module.name}: invalid SHA-256 for ${artifact.path}`);
      }
      for (const platform of module.platforms.filter(platform => platform !== 'web')) {
        if (!(manifest.artifacts ?? []).some(artifact => artifact.platform === platform)) failures.push(`${module.name}: ${platform} artifact missing`);
      }
    }
  }
}

if (process.argv.includes('--require-device-smoke')) {
  const evidenceDir = path.join(root, 'apps/dev-app/dist');
  const evidenceFiles = fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter(name => /^module-smoke-.+\.json$/.test(name))
    : [];
  const expected = new Set(catalog.modules.filter(module => module.officialDevApp).map(module => module.smokeTest));
  const validEvidence = evidenceFiles.some(name => {
    try {
      const evidence = JSON.parse(fs.readFileSync(path.join(evidenceDir, name), 'utf8'));
      return evidence.engineVersion === catalog.engineVersion &&
        [...expected].every(id => evidence.smokeTests?.includes(id));
    } catch {
      return false;
    }
  });
  if (!validEvidence) failures.push('on-device module smoke evidence is missing, stale, or incomplete');
}

if (failures.length) {
  console.error(`Dev-app module gate failed:\n${failures.map(failure => `  - ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log(`Dev-app module gate passed (${advertised.size} modules, wrappers, artifacts, and smoke registrations).`);
