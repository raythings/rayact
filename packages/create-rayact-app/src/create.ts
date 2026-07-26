import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Version range scaffolded (non-monorepo) apps pin rayact to.
 * Bumped in lockstep with the published package version — keep this the single
 * source of truth so a release bump is a one-line change here.
 */
const RAYACT_VERSION = '0.0.4';

export interface CreateOptions {
  projectName: string;
  targetDir: string;
  template: 'default' | 'blank';
  monorepo: boolean;
  monorepoRoot?: string;
  /**
   * Path to a local rayact checkout/package. Emits file: dependencies for
   * `rayact` and the host-matching @rayact/prebuilt-* package so a project
   * can be built entirely from local artifacts (no registry, no GitHub).
   */
  localRayactPath?: string;
  /**
   * Directory holding a Rayact release tarball set (a downloaded GitHub
   * release, or the repo's release1/ output). The JS package tarballs are
   * vendored into <app>/vendor/rayact_pkgs and the project is scaffolded with
   * file: dependencies plus an `overrides` block covering every vendored
   * package, so npm never consults the registry for lockstep packages.
   */
  releaseDir?: string;
  /** Also vendor the @rayact/prebuilt-* tarballs for fully-offline installs. */
  vendorPrebuilts?: boolean;
}

/** The @rayact/prebuilt-* package folder for the machine we're running on. */
function hostPrebuiltFolder(): string | null {
  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return 'prebuilt-darwin-arm64';
    if (process.arch === 'x64') return 'prebuilt-darwin-x64';
  }
  if (process.platform === 'linux' && process.arch === 'x64') return 'prebuilt-linux-x64';
  return null;
}

function templatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'templates'),
    path.join(here, '../templates'),
    path.join(here, '../../templates')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('create-rayact-app templates not found');
}

/** Direct dependencies of a scaffolded app; everything else rides overrides. */
const DIRECT_DEPS = [
  'rayact',
  '@rayact/dev-server',
  '@rayact/template-android',
  '@rayact/template-ios',
  '@rayact/dev-client'
];

interface ReleaseSetEntry {
  name: string;
  tarball: string;
  sha256?: string;
}

/**
 * Map a release tarball set to package names. Prefers release-set.json (the
 * canonical index written by the release packer); falls back to deriving names
 * from npm's tarball naming (`rayact-<name>-<v>.tgz` → `@rayact/<name>`).
 */
function readReleaseSet(releaseDir: string): ReleaseSetEntry[] {
  const indexPath = path.join(releaseDir, 'release-set.json');
  if (fs.existsSync(indexPath)) {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
      packages?: { name?: string; tarball?: string; sha256?: string }[];
    };
    const entries = (parsed.packages ?? [])
      .filter((p): p is { name: string; tarball: string; sha256?: string } =>
        Boolean(p.name && p.tarball))
      .filter((p) => fs.existsSync(path.join(releaseDir, p.tarball)));
    if (entries.length > 0) return entries;
  }

  return fs.readdirSync(releaseDir)
    .filter((f) => f.endsWith('.tgz'))
    .map((tarball) => {
      const base = tarball.replace(/-\d+\.\d+\.\d+(?:[-.][\w.]+)?\.tgz$/, '');
      let name = base;
      if (base.startsWith('rayact-')) name = `@rayact/${base.slice('rayact-'.length)}`;
      else if (base === 'rayact') name = 'rayact';
      return { name, tarball };
    });
}

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Copy the release JS package tarballs into <app>/vendor/rayact_pkgs and return
 * name → file: spec for every vendored package. Prebuilt engine tarballs are
 * skipped unless vendorPrebuilts is set — `rayact prebuild` downloads those
 * from the GitHub release (or RAYACT_PREBUILT_BASE_URL) on demand.
 */
function vendorReleaseTarballs(options: CreateOptions): Record<string, string> {
  const releaseDir = path.resolve(options.releaseDir!);
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`--release-dir not found: ${releaseDir}`);
  }
  const entries = readReleaseSet(releaseDir).filter((entry) => {
    if (entry.name.startsWith('@rayact/prebuilt-')) return Boolean(options.vendorPrebuilts);
    return true;
  });
  if (!entries.some((e) => e.name === 'rayact')) {
    throw new Error(
      `No rayact package tarball found in ${releaseDir}. ` +
        'Point --release-dir at a downloaded Rayact release (the directory with the .tgz files).'
    );
  }

  const vendorDir = path.join(options.targetDir, 'vendor', 'rayact_pkgs');
  fs.mkdirSync(vendorDir, { recursive: true });
  const specs: Record<string, string> = {};
  for (const entry of entries) {
    const src = path.join(releaseDir, entry.tarball);
    if (entry.sha256) {
      const actual = sha256File(src);
      if (actual !== entry.sha256) {
        throw new Error(
          `Checksum mismatch for ${entry.tarball}: expected ${entry.sha256}, got ${actual}. ` +
            'The release download is corrupt or tampered with.'
        );
      }
    }
    fs.copyFileSync(src, path.join(vendorDir, entry.tarball));
    specs[entry.name] = `file:vendor/rayact_pkgs/${entry.tarball}`;
  }
  return specs;
}

function depBlock(options: CreateOptions): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides?: Record<string, string>;
} {
  const devDependencies = {
    '@types/node': '^24.0.0',
    '@types/react': '^19.0.0',
    typescript: '^5.8.3',
    vite: '^7.3.6'
  };

  if (options.releaseDir) {
    const specs = vendorReleaseTarballs(options);
    const dependencies: Record<string, string> = { react: '^19.0.0' };
    for (const name of DIRECT_DEPS) {
      if (!specs[name]) {
        throw new Error(`Release set is missing the ${name} tarball — cannot scaffold from it.`);
      }
      dependencies[name] = specs[name];
    }
    // Override every vendored package (direct deps use identical specs, which
    // npm accepts) so transitive exact-pinned @rayact/* ranges resolve to the
    // vendored tarballs instead of the public registry.
    return { dependencies, devDependencies, overrides: { ...specs } };
  }

  const localRoot = options.localRayactPath
    ?? (options.monorepo && options.monorepoRoot ? options.monorepoRoot : undefined);
  if (localRoot) {
    const abs = path.resolve(localRoot);
    const rel = path.relative(options.targetDir, abs).replace(/\\/g, '/');
    const dependencies: Record<string, string> = {
      rayact: `file:${rel}/packages/rayact`,
      '@rayact/dev-server': `file:${rel}/packages/rayact-dev-server`,
      '@rayact/template-android': `file:${rel}/packages/template-android`,
      '@rayact/template-ios': `file:${rel}/packages/template-ios`,
      '@rayact/dev-client': `file:${rel}/packages/rayact-dev-client`,
      react: '^19.0.0'
    };
    const prebuilt = hostPrebuiltFolder();
    if (prebuilt && fs.existsSync(path.join(abs, 'packages', prebuilt))) {
      dependencies[`@rayact/${prebuilt}`] = `file:${rel}/packages/${prebuilt}`;
    }
    return { dependencies, devDependencies };
  }

  // Registry install. Rayact is distributed via GitHub releases and is not on
  // the npm registry today — warn loudly instead of letting install 404.
  console.warn(
    '\n⚠ Rayact packages are not published to the npm registry. `npm install` will fail\n' +
      '  unless you scaffold from a downloaded release:\n' +
      '    create-rayact-app <name> --release-dir <path-to-downloaded-release>\n' +
      '    create-rayact-app <name> --release-url https://github.com/raythings/rayact/releases/download/v' +
      RAYACT_VERSION + '\n'
  );
  return {
    dependencies: {
      rayact: RAYACT_VERSION,
      '@rayact/dev-server': RAYACT_VERSION,
      '@rayact/template-android': RAYACT_VERSION,
      '@rayact/template-ios': RAYACT_VERSION,
      '@rayact/dev-client': RAYACT_VERSION,
      react: '^19.0.0'
    },
    devDependencies
  };
}

function replacePlaceholders(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`__${key}__`, value);
  }
  return out;
}

function copyTemplateFile(src: string, dest: string, vars: Record<string, string>): void {
  const raw = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, replacePlaceholders(raw, vars));
}

export function detectMonorepoRoot(fromDir: string): string | null {
  let dir = path.resolve(fromDir);
  for (let i = 0; i < 6; i++) {
    // The Expo-style Rayact workspace root.
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath) && fs.existsSync(path.join(dir, 'packages', 'rayact-react'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === '@rayact/workspace') return dir;
      } catch {
        // Unreadable package.json — keep walking up.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function createRayactApp(options: CreateOptions): void {
  const templateDir = path.join(templatesDir(), options.template);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Unknown template: ${options.template}`);
  }
  if (fs.existsSync(options.targetDir)) {
    const entries = fs.readdirSync(options.targetDir);
    if (entries.length > 0) {
      throw new Error(`Directory not empty: ${options.targetDir}`);
    }
  } else {
    fs.mkdirSync(options.targetDir, { recursive: true });
  }

  const appKey = options.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const deps = depBlock(options);
  const vars: Record<string, string> = {
    PROJECT_NAME: options.projectName,
    APP_KEY: appKey
  };

  const walk = (rel = '') => {
    const current = path.join(templateDir, rel);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relPath = path.join(rel, entry.name);
      const srcPath = path.join(templateDir, relPath);
      const destPath = path.join(options.targetDir, relPath);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        walk(relPath);
      } else {
        copyTemplateFile(srcPath, destPath, vars);
      }
    }
  };

  walk();

  const pkg = {
    name: options.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    version: '0.1.0',
    private: true,
    type: 'module',
    description: 'Rayact app',
    scripts: {
      dev: 'rayact dev',
      desktop: 'rayact dev --desktop',
      android: 'rayact dev --android',
      ios: 'rayact dev --ios',
      web: 'rayact dev --web',
      prebuild: 'rayact prebuild',
      'android:dev-client': 'rayact build --debug --android --install',
      'ios:dev-client': 'rayact build --debug --ios --install',
      build: 'rayact build --release',
      'build:desktop': 'rayact build --release --desktop',
      'build:android': 'rayact build --release --android',
      'build:android:install': 'rayact build --release --android --install',
      'build:ios': 'rayact build --release --ios',
      'build:web': 'rayact build --release --web',
      start: 'rayact start',
      'start:dev': 'rayact start --dev'
    },
    dependencies: deps.dependencies,
    devDependencies: deps.devDependencies,
    ...(deps.overrides ? { overrides: deps.overrides } : {})
  };
  fs.writeFileSync(
    path.join(options.targetDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  );
}
