#!/usr/bin/env node
// Assert each publishable package ships only its intended files — no src/tsconfig/
// test leaks — by inspecting `npm pack --dry-run`. Run locally or in CI:
//   node scripts/verify-packages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDirs = [
  ROOT,
  ...fs
  .readdirSync(path.join(ROOT, 'packages'))
  .filter((d) => d === 'create-rayact-app' || d.startsWith('prebuilt-'))
  .map((d) => path.join(ROOT, 'packages', d))
  .filter((d) => fs.existsSync(path.join(d, 'package.json')))
];

// Files that must never appear in any published tarball. tsconfig is only a leak
// at the package root — scaffold templates (create-rayact-app) ship one on purpose.
const FORBIDDEN = [/^tsconfig\.json$/, /(^|\/)\.tsbuildinfo$/, /^test\//, /(^|\/)\.DS_Store$/];
// dist-only packages must not leak source.
const SRC_LEAK = /^src\//;

let failures = 0;
for (const dir of pkgDirs) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (pkg.private || !pkg.name) continue;

  if (!pkg.files) {
    console.error(`✗ ${pkg.name}: missing "files" whitelist`);
    failures++;
    continue;
  }

  let out;
  try {
    out = execSync('npm pack --dry-run --json --ignore-scripts', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (err) {
    console.error(`✗ ${pkg.name}: npm pack failed (${err.message})`);
    failures++;
    continue;
  }
  // A prepack/lifecycle log can precede the JSON — slice from the first array.
  const json = out.slice(out.indexOf('['));
  const paths = (JSON.parse(json)[0]?.files ?? []).map((f) => f.path);

  const distOnly = Array.isArray(pkg.files) && pkg.files.every((f) => f === 'dist' || f === 'schema');
  const bad = [];
  for (const p of paths) {
    if (FORBIDDEN.some((re) => re.test(p))) bad.push(p);
    if (distOnly && SRC_LEAK.test(p)) bad.push(p);
  }
  if (bad.length) {
    console.error(`✗ ${pkg.name}: unexpected files in tarball:\n    ${bad.join('\n    ')}`);
    failures++;
  } else {
    console.log(`✓ ${pkg.name} (${paths.length} files)`);
  }
}

if (failures) {
  console.error(`\n${failures} package(s) failed verification.`);
  process.exit(1);
}
console.log('\nAll publishable packages verified.');
