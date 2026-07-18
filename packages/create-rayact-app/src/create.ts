import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Version range scaffolded (non-monorepo) apps pin rayact to.
 * Bumped in lockstep with the published package version — keep this the single
 * source of truth so a release bump is a one-line change here.
 */
const RAYACT_VERSION = '0.0.3';

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

function depBlock(options: CreateOptions): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const devDependencies = {
    '@types/node': '^24.0.0',
    '@types/react': '^19.0.0',
    typescript: '^5.8.3',
    vite: '^7.3.6'
  };

  const localRoot = options.localRayactPath
    ?? (options.monorepo && options.monorepoRoot ? options.monorepoRoot : undefined);
  if (localRoot) {
    const abs = path.resolve(localRoot);
    const rel = path.relative(options.targetDir, abs).replace(/\\/g, '/');
    const dependencies: Record<string, string> = {
      rayact: `file:${rel}/packages/rayact`,
      '@rayact/dev-server': `file:${rel}/packages/rayact-dev-server`,
      react: '^19.0.0'
    };
    const prebuilt = hostPrebuiltFolder();
    if (prebuilt && fs.existsSync(path.join(abs, 'packages', prebuilt))) {
      dependencies[`@rayact/${prebuilt}`] = `file:${rel}/packages/${prebuilt}`;
    }
    return { dependencies, devDependencies };
  }

  return {
    dependencies: {
      rayact: RAYACT_VERSION,
      '@rayact/dev-server': RAYACT_VERSION,
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
    version: '0.0.3',
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
    devDependencies: deps.devDependencies
  };
  fs.writeFileSync(
    path.join(options.targetDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  );
}
