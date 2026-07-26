#!/usr/bin/env node
// Drift gate: every value export of @rayact/react must be mentioned in the
// reference docs (reference/components.md or reference/api.md), so new API
// can't ship undocumented. Parses the source export declarations (the built
// package pulls in .css imports Node can't load directly).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const INDEX = path.join(ROOT, 'packages/rayact-react/src/index.ts');
const DOC_FILES = [
  path.join(ROOT, 'docs/reference/components.md'),
  path.join(ROOT, 'docs/reference/api.md'),
  path.join(ROOT, 'docs/guide/animation.md'),
  path.join(ROOT, 'docs/guide/workers.md')
];

const src = fs.readFileSync(INDEX, 'utf8');
const names = new Set();

// export { A, B as C } [from '...'] — value exports only (skip `export type`).
for (const m of src.matchAll(/export\s+\{([^}]+)\}/g)) {
  const isType = /export\s+type\s+\{/.test(m[0]);
  if (isType) continue;
  for (const raw of m[1].split(',')) {
    const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
    if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
  }
}
for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
for (const m of src.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);

const docs = DOC_FILES.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const missing = [...names].filter((name) => !docs.includes(name)).sort();

if (missing.length > 0) {
  console.error(
    `api-coverage: ${missing.length} export(s) of @rayact/react are not mentioned in the reference docs:\n  ` +
      missing.join(', ') +
      '\nDocument them in docs/reference/components.md or docs/reference/api.md.'
  );
  process.exit(1);
}
console.log(`api-coverage: all ${names.size} @rayact/react exports are documented.`);
