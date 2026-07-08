import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDesktopBinPrebuilt } from '../prebuild/index.js';

export async function compileToBytecode(
  jsSource: string,
  options: { root: string; desktopBin?: string; outName?: string }
): Promise<Buffer> {
  // A caller-supplied desktopBin is taken verbatim; otherwise resolve the host
  // (source build → installed prebuilt → cache). Downloading is handled earlier
  // by `rayact prebuild` / the build command, so here we only locate it.
  const resolved = options.desktopBin
    ? { bin: path.resolve(options.root, options.desktopBin) }
    : resolveDesktopBinPrebuilt(options.root);
  const desktopBin = resolved?.bin;
  if (!desktopBin || !fs.existsSync(desktopBin)) {
    throw new Error(
      'Bytecode compile requires the rayact_desktop host. Run `rayact prebuild` to ' +
        'fetch it, or set RAYACT_DESKTOP_BIN / build the native host from source.'
    );
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
