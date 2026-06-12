import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function resolveDesktopBin(cwd: string, configured?: string): string | null {
  const candidates = [
    configured,
    process.env.RAYACT_DESKTOP_BIN,
    path.join(cwd, 'build/bin/rayact_desktop'),
    path.join(cwd, '../../build/bin/rayact_desktop'),
    path.join(cwd, '../../../build/bin/rayact_desktop')
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

export function runDesktopHost(options: {
  cwd: string;
  bundle?: string;
  devServer?: string;
  desktopBin?: string;
  env?: NodeJS.ProcessEnv;
}): number {
  const bin = resolveDesktopBin(options.cwd, options.desktopBin);
  if (!bin) {
    console.error('rayact_desktop not found.');
    console.error('Build the native desktop host or set RAYACT_DESKTOP_BIN.');
    return 1;
  }

  const args: string[] = [];
  const env = { ...process.env, ...options.env };

  if (options.devServer) {
    env.RAYACT_DEV_SERVER = options.devServer;
  } else if (options.bundle) {
    const bundlePath = path.isAbsolute(options.bundle)
      ? options.bundle
      : path.resolve(options.cwd, options.bundle);
    if (!fs.existsSync(bundlePath)) {
      console.error(`Bundle not found: ${bundlePath}`);
      console.error('Run: npm run build  or  rayact build');
      return 1;
    }
    args.push(bundlePath);
  } else {
    const defaultBundle = path.resolve(options.cwd, 'dist/bundle.js');
    if (fs.existsSync(defaultBundle)) {
      args.push(defaultBundle);
    } else {
      console.error('No bundle or dev server URL. Use --dev or build first.');
      return 1;
    }
  }

  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: options.cwd, env });
  return result.status ?? 1;
}
