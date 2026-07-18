#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, logPath] = process.argv.slice(2);
if (!platform || !logPath) {
  console.error('Usage: record-dev-app-smoke <platform> <device-log>');
  process.exit(2);
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'packages/first-party-modules.json'), 'utf8'));
const log = fs.readFileSync(logPath, 'utf8');
const smokeTests = catalog.modules
  .filter(module => module.officialDevApp)
  .map(module => module.smokeTest);
const failures = smokeTests.filter(id => !log.includes(`MODTEST ${id} PASS`));
if (failures.length) {
  console.error(`On-device Dev App smoke failed or was not observed: ${failures.join(', ')}`);
  process.exit(1);
}

const evidenceDir = process.env.RAYACT_SMOKE_EVIDENCE_DIR || path.join(root, 'apps/dev-app/dist');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  schemaVersion: 1,
  engineVersion: catalog.engineVersion,
  platform,
  smokeTests,
  verifiedAt: new Date().toISOString()
};
const output = path.join(evidenceDir, `module-smoke-${platform}.json`);
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(`Recorded on-device Dev App smoke evidence: ${output}`);
