import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(projectRoot, '../..');
const bundle = path.join(projectRoot, 'dist', 'bundle.js');

const candidates = [
  path.join(repoRoot, 'build', 'bin', 'rayact_desktop'),
  process.env.RAYACT_DESKTOP_BIN
].filter(Boolean);

const bin = candidates.find(p => fs.existsSync(p));
if (!bin) {
  console.error('rayact_desktop not found. Build native desktop first or set RAYACT_DESKTOP_BIN.');
  process.exit(1);
}
if (!fs.existsSync(bundle)) {
  console.error('dist/bundle.js missing. Run: npm run build');
  process.exit(1);
}

const result = spawnSync(bin, [bundle], { stdio: 'inherit', cwd: projectRoot });
process.exit(result.status ?? 1);
