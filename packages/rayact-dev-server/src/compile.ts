import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export async function compileToBytecode(
  jsSource: string,
  options: { root: string; desktopBin?: string; outName?: string }
): Promise<Buffer> {
  const desktopBin = path.resolve(options.root, options.desktopBin ?? 'build/bin/rayact_desktop');
  if (!fs.existsSync(desktopBin)) {
    throw new Error(`Bytecode compile requires native binary at ${desktopBin}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-compile-'));
  const inFile = path.join(tmpDir, 'bundle.js');
  const outFile = path.join(tmpDir, options.outName ?? 'bundle.qjsbc');
  fs.writeFileSync(inFile, jsSource, 'utf8');

  const result = spawnSync(desktopBin, ['--compile', inFile, outFile], {
    cwd: options.root,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown error';
    throw new Error(`Bytecode compile failed: ${detail}`);
  }
  if (!fs.existsSync(outFile)) {
    throw new Error(`Bytecode compile did not produce ${outFile}`);
  }

  const bytecode = fs.readFileSync(outFile);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return bytecode;
}
