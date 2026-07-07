#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRayactApp, detectMonorepoRoot } from './create.js';

function parseArgs(argv: string[]) {
  let projectName = '';
  let template: 'default' | 'blank' = 'default';
  let install = true;
  let monorepo = false;

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
    } else if (arg === '--monorepo') {
      monorepo = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: create-rayact-app <project-name> [options]

Options:
  --template <name>   default | blank (default: default)
  --no-install        Skip npm install
  --monorepo          Use local file: dependencies when run inside the Rayact monorepo
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

  return { projectName, template, install, monorepo };
}

const { projectName, template, install, monorepo } = parseArgs(process.argv.slice(2));

if (!projectName) {
  console.error('Please specify a project name:');
  console.error('  npx create-rayact-app <project-name>');
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), projectName);
const monorepoRoot = monorepo ? detectMonorepoRoot(process.cwd()) : null;

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
  // Drop any npm_config_* the outer npx/npm run injected, so this install
  // behaves like a plain `npm install` in the new app.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k))
  ) as NodeJS.ProcessEnv;
  const result = spawnSync('npm', ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
    env
  });
  if (result.status !== 0) {
    console.warn('npm install failed — run manually inside the project.');
  }
}

console.log(`
Next steps:
  cd ${projectName}
  npm run dev                # start the dev server (QR + hot reload)

On a phone or simulator (prebuilt dev app, Expo Go style):
  npm run android            # install + launch on a USB-connected Android device
  npm run ios                # install + launch on the iOS simulator

Build your own dev client (expo-dev-client style):
  npm run prebuild           # scaffold android/ + ios/ shells (engine stays prebuilt)
  npm run android:dev-client # build + install your custom dev client

On desktop:
  npm run start:dev          # native window connected to the dev server
`);
