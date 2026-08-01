#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRayactApp, detectMonorepoRoot } from './create.js';

function parseArgs(argv: string[]) {
  let projectName = '';
  let template: 'default' | 'default-router' | 'blank' = 'default';
  let install = true;
  let monorepo = false;
  let local: string | undefined = process.env.RAYACT_LOCAL || undefined;
  let releaseDir: string | undefined;
  let releaseUrl: string | undefined;
  let vendorPrebuilts = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--template' && next) {
      if (next !== 'default' && next !== 'default-router' && next !== 'blank') {
        console.error(`Unknown template: ${next}`);
        process.exit(1);
      }
      template = next;
      i++;
    } else if (arg === '--no-install') {
      install = false;
    } else if (arg === '--monorepo') {
      monorepo = true;
    } else if (arg === '--local' && next) {
      local = next;
      i++;
    } else if (arg === '--release-dir' && next) {
      releaseDir = next;
      i++;
    } else if (arg === '--release-url' && next) {
      releaseUrl = next;
      i++;
    } else if (arg === '--vendor-prebuilts') {
      vendorPrebuilts = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: create-rayact-app <project-name> [options]

Options:
  --template <name>    default | default-router | blank (default: default)
  --no-install         Skip npm install
  --release-dir <path> Scaffold from a downloaded Rayact release: vendors the
                       package tarballs into vendor/rayact_pkgs and emits file:
                       dependencies + overrides (no npm registry needed)
  --release-url <url>  Same, but downloads the release first. Point it at the
                       GitHub release download base, e.g.
                       https://github.com/raythings/rayact/releases/download/v0.0.4
  --vendor-prebuilts   With --release-dir/--release-url: also vendor the
                       @rayact/prebuilt-* engine tarballs (fully offline)
  --monorepo           Use local file: dependencies when run inside the Rayact monorepo
  --local <path>       Use file: dependencies on a local rayact checkout (also links
                       the host @rayact/prebuilt-* from its packages/; env: RAYACT_LOCAL)
  -h, --help           Show help

Examples:
  npx ./create-rayact-app-0.0.4.tgz my-app --release-dir ~/Downloads/rayact-release
  npx create-rayact-app my-app --release-url https://github.com/raythings/rayact/releases/download/v0.0.4
  rayact init my-app
`.trim());
      process.exit(0);
    } else if (!arg.startsWith('-') && !projectName) {
      projectName = arg;
    }
  }

  return { projectName, template, install, monorepo, local, releaseDir, releaseUrl, vendorPrebuilts };
}

async function fetchTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, bytes);
}

/**
 * Download a release tarball set (release-set.json + the JS package tarballs it
 * lists) into a temp directory and return that directory. Prebuilt engine
 * tarballs are skipped unless vendorPrebuilts is set — they are large and
 * `rayact prebuild` streams them from the release on demand.
 */
async function downloadRelease(baseUrl: string, vendorPrebuilts: boolean): Promise<string> {
  const base = baseUrl.replace(/\/+$/, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-release-'));
  console.log(`Downloading release manifest from ${base} ...`);
  await fetchTo(`${base}/release-set.json`, path.join(dir, 'release-set.json'));
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'release-set.json'), 'utf8')) as {
    packages?: { name?: string; tarball?: string }[];
  };
  const wanted = (parsed.packages ?? []).filter((p) => {
    if (!p.name || !p.tarball) return false;
    if (p.name.startsWith('@rayact/prebuilt-')) return vendorPrebuilts;
    return true;
  });
  if (wanted.length === 0) {
    throw new Error(`release-set.json at ${base} lists no packages`);
  }
  for (const p of wanted) {
    console.log(`  ${p.tarball}`);
    await fetchTo(`${base}/${p.tarball}`, path.join(dir, p.tarball!));
  }
  return dir;
}

async function main(): Promise<void> {
  const { projectName, template, install, monorepo, local, releaseDir, releaseUrl, vendorPrebuilts } =
    parseArgs(process.argv.slice(2));

  if (!projectName) {
    console.error('Please specify a project name:');
    console.error('  npx create-rayact-app <project-name>');
    process.exit(1);
  }
  if (releaseDir && releaseUrl) {
    console.error('Use either --release-dir or --release-url, not both.');
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  const monorepoRoot = monorepo ? detectMonorepoRoot(process.cwd()) : null;

  let resolvedReleaseDir = releaseDir;
  try {
    if (releaseUrl) {
      resolvedReleaseDir = await downloadRelease(releaseUrl, vendorPrebuilts);
    }
    createRayactApp({
      projectName,
      targetDir,
      template,
      monorepo: Boolean(monorepoRoot),
      monorepoRoot: monorepoRoot ?? undefined,
      localRayactPath: local,
      releaseDir: resolvedReleaseDir,
      vendorPrebuilts
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
