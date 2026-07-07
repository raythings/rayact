import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Version range scaffolded (non-monorepo) apps pin rayact to.
 * Bumped in lockstep with the published package version — keep this the single
 * source of truth so a release bump is a one-line change here.
 */
const RAYACT_VERSION = '0.0.1';

export interface CreateOptions {
  projectName: string;
  targetDir: string;
  template: 'default' | 'blank';
  monorepo: boolean;
  monorepoRoot?: string;
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

function depBlock(
  monorepo: boolean,
  monorepoRoot: string | undefined,
  targetDir: string
): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  if (monorepo && monorepoRoot) {
    const rel = path.relative(targetDir, monorepoRoot).replace(/\\/g, '/');
    const pkg = (name: string) => `file:${rel}/packages/${name}`;
    return {
      dependencies: {
        rayact: `file:${rel}`,
        '@rayact/cli': pkg('rayact-cli'),
        '@rayact/crypto': pkg('rayact-crypto'),
        '@rayact/dev-client': pkg('rayact-dev-client'),
        '@rayact/dev-server': pkg('rayact-dev-server'),
        '@rayact/mmkv': pkg('rayact-mmkv'),
        '@rayact/navigation': pkg('rayact-navigation'),
        '@rayact/prebuild': pkg('rayact-prebuild'),
        '@rayact/react': pkg('rayact-react'),
        '@rayact/runtime': pkg('rayact-runtime'),
        '@rayact/secure-store': pkg('rayact-secure-store'),
        '@rayact/shared': pkg('rayact-shared'),
        '@rayact/types': pkg('rayact-types'),
        '@rayact/worklets': pkg('rayact-worklets'),
        react: '^19.0.0'
      },
      devDependencies: {
        '@types/node': '^25.0.0',
        '@types/react': '^19.0.0',
        typescript: '^5.8.3',
        vite: '^7.2.6'
      }
    };
  }
  const gh = (repo: string) => `github:raythings/${repo}#v${RAYACT_VERSION}`;
  return {
    dependencies: {
      rayact: gh('rayact'),
      react: '^19.0.0'
    },
    devDependencies: {
      '@types/node': '^25.0.0',
      '@types/react': '^19.0.0',
      typescript: '^5.8.3',
      vite: '^7.2.6'
    }
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
    if (fs.existsSync(path.join(dir, 'packages', 'rayact-react'))) return dir;
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
  const deps = depBlock(options.monorepo, options.monorepoRoot, options.targetDir);
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
      android: 'rayact dev-app --android',
      ios: 'rayact dev-app --ios-simulator',
      prebuild: 'rayact prebuild',
      'android:dev-client': 'rayact build --debug --android --install',
      'ios:dev-client': 'rayact build --debug --ios --install',
      build: 'rayact build --release',
      'build:desktop': 'rayact build --release --desktop',
      'build:android': 'rayact build --release --android',
      'build:android:install': 'rayact build --release --android --install',
      'build:ios': 'rayact build --release --ios',
      'build:web': 'rayact build --release --web --no-bytecode',
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
