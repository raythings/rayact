import path from 'node:path';
import { loadRayactConfig, setupAdbReverse } from '@rayact/dev-server';
import type { CliFlags } from '../parse.js';
import { runDesktopHost } from '../desktop.js';

export async function runStart(flags: CliFlags): Promise<void> {
  const config = loadRayactConfig();
  const port = flags.port || config.devServer?.port || 8081;
  const devUrl = `http://127.0.0.1:${port}`;

  if (flags.platform === 'android' || flags.android) {
    await setupAdbReverse(devUrl, config.devServer?.cdpPort ?? 9229);
    console.log(`Android: adb reverse configured for ${devUrl}`);
    if (flags.dev) {
      console.log('Launch the debug APK and connect via the in-app dev launcher.');
    }
    return;
  }

  const code = runDesktopHost({
    cwd: process.cwd(),
    desktopBin: flags.desktopBin,
    devServer: flags.dev ? devUrl : undefined,
    bundle: flags.dev ? undefined : path.join(flags.outDir, 'bundle.js')
  });
  process.exit(code);
}
