#!/usr/bin/env node
// Generate llms.txt (index), llms-full.txt (whole corpus), and per-page raw
// markdown copies under public/, following https://llmstxt.org/ (H1 + blockquote
// summary + H2 link lists). Run before the Vitepress build so they ship in dist.
//   node docs/scripts/gen-llms.mjs           # write
//   node docs/scripts/gen-llms.mjs --check    # fail if stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(here, '..');
const PUBLIC = path.join(DOCS, 'public');
const SITE = 'https://rayact.dev';

const SKIP = new Set(['.vitepress', 'scripts', 'public', 'node_modules', 'maintainer']);
// Internal maintainer notes kept in the repo but excluded from the public site.
const SKIP_FILES = new Set(['maintainer-prebuilts.md', 'dev-platform.md']);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(path.join(dir, e.name), acc);
    } else if (e.name.endsWith('.md') && !SKIP_FILES.has(e.name)) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

function meta(md) {
  const title = (md.match(/^#\s+(.+)$/m) || [, path.basename])[1]?.trim() ?? 'Untitled';
  // First non-empty, non-heading, non-comment line as the summary.
  const summary = md
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('>')) ?? '';
  return { title, summary: summary.replace(/[`*]/g, '') };
}

function urlFor(rel) {
  let u = rel.replace(/\\/g, '/').replace(/\.md$/, '');
  if (u.endsWith('index')) u = u.slice(0, -'index'.length);
  return '/' + u.replace(/\/$/, '');
}

const files = walk(DOCS).sort();
const pages = files.map((f) => {
  const rel = path.relative(DOCS, f);
  const md = fs.readFileSync(f, 'utf8');
  return { rel, md, ...meta(md), url: urlFor(rel) };
});

const home = pages.find((p) => p.rel === 'index.md');
const summary = home?.summary || 'Cross-platform React renderer with a raylib/QuickJS native backend.';

// Group by top-level folder for the index sections.
const groups = new Map();
for (const p of pages) {
  if (p.rel === 'index.md') continue;
  const top = p.rel.includes('/') ? p.rel.split('/')[0] : 'Pages';
  if (!groups.has(top)) groups.set(top, []);
  groups.get(top).push(p);
}

let llms = `# Rayact\n\n> ${summary}\n`;
for (const [group, ps] of groups) {
  llms += `\n## ${group[0].toUpperCase() + group.slice(1)}\n\n`;
  for (const p of ps) llms += `- [${p.title}](${SITE}${p.url}): ${p.summary}\n`;
}
llms += `\n## Full corpus\n\n- [llms-full.txt](${SITE}/llms-full.txt): every page concatenated as Markdown\n`;

let full = `# Rayact — full documentation\n\n> ${summary}\n`;
for (const p of pages) {
  full += `\n\n---\n# Source: ${p.rel}\n\n${p.md.trim()}\n`;
}

const outputs = [
  [path.join(PUBLIC, 'llms.txt'), llms],
  [path.join(PUBLIC, 'llms-full.txt'), full],
  // Per-page raw markdown copies (so each page has an llm-readable .md URL).
  ...pages.map((p) => [path.join(PUBLIC, 'md', p.rel), p.md])
];

const check = process.argv.includes('--check');
let stale = false;
for (const [file, content] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  stale = true;
  if (!check) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}
if (check) {
  if (stale) { console.error('llms.txt outputs are stale — run `npm run gen:llms`.'); process.exit(1); }
  console.log('llms.txt up to date.');
} else {
  console.log(`Wrote llms.txt, llms-full.txt, and ${pages.length} per-page md copies.`);
}
