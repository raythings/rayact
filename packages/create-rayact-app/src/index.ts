#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRayactApp, detectMonorepoRoot } from './create.js';

function parseArgs(argv: string[]) {
  let projectName = '';
  let template: 'default' | 'blank' = 'default';
  let install = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--template' && next) {
      if (next !== 'default' && next !== 'blank') {
        console.error(`Unknown template: ${next}`);
        process.exit(1);
      }
      template = next;
      i++;
    } else if (arg === '--no-install') {
      install = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: create-rayact-app <project-name> [options]

Options:
  --template <name>   default | blank (default: default)
  --no-install        Skip npm install
  -h, --help          Show help

Examples:
  npx create-rayact-app my-app
  npx create-rayact-app my-app --template blank
  rayact init my-app
`.trim());
      process.exit(0);
    } else if (!arg.startsWith('-') && !projectName) {
      projectName = arg;
    }
  }

  return { projectName, template, install };
}

const { projectName, template, install } = parseArgs(process.argv.slice(2));

if (!projectName) {
  console.error('Please specify a project name:');
  console.error('  npx create-rayact-app <project-name>');
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), projectName);
const monorepoRoot = detectMonorepoRoot(process.cwd());

try {
  createRayactApp({
    projectName,
    targetDir,
    template,
    monorepo: Boolean(monorepoRoot),
    monorepoRoot: monorepoRoot ?? undefined
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`\n✓ Created Rayact app at ${targetDir}`);

if (install) {
  console.log('\nInstalling dependencies...');
  const result = spawnSync('npm', ['install', '--ignore-scripts'], {
    cwd: targetDir,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.warn('npm install failed — run manually inside the project.');
  }
}

console.log(`
Next steps:
  cd ${projectName}
  npm run dev          # start dev server
  npm run start        # run desktop host (after build)
  rayact start --dev   # desktop + live dev server
`);
