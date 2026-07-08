import path from 'node:path';
import { existsSync } from 'node:fs';
import { startCoepStaticServer } from '../../prebuild/index.js';
import type { CliFlags } from '../parse.js';

export async function runServe(flags: CliFlags): Promise<void> {
  const dirArg = flags.positional[0];
  const webDir = path.resolve(process.cwd(), dirArg ?? path.join(flags.outDir, 'web'));

  if (!existsSync(webDir)) {
    console.error(`Web output not found: ${webDir}`);
    console.error('Run `rayact build --web` first, or pass a directory: rayact serve [dir]');
    process.exit(1);
  }

  const port = flags.webPort;
  const server = await startCoepStaticServer({ dir: webDir, port });
  console.log(`COEP server: ${server.url} serving ${webDir}`);
  console.log(`Open ${server.url}/rayact.html (or ${server.url}/index.html)`);

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
