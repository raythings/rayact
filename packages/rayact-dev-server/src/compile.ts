import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveToolBin } from '@rayact/prebuild';

export async function compileToBytecode(
  jsSource: string,
  options: { root: string; desktopBin?: string; toolBin?: string; outName?: string }
): Promise<Buffer> {
  // A caller-supplied binary is taken verbatim; otherwise resolve the headless
  // rayact_tool (env → source build → installed prebuilt → cache), falling back
  // to the rayact_desktop host for pre-0.0.4 prebuilts. Downloading is handled
  // earlier by `rayact prebuild` / the build command, so here we only locate it.
  const resolved = options.toolBin || options.desktopBin
    ? { bin: path.resolve(options.root, options.toolBin || options.desktopBin!), fallbackDesktopHost: false }
    : resolveToolBin(options.root);
  const desktopBin = resolved?.bin;
  if (!desktopBin || !fs.existsSync(desktopBin)) {
    throw new Error(
      'Bytecode compile requires the rayact_tool binary (or the rayact_desktop host). ' +
        'Run `rayact prebuild` to fetch it, or set RAYACT_TOOL_BIN / build from source.'
    );
  }
  if (resolved && 'fallbackDesktopHost' in resolved && resolved.fallbackDesktopHost) {
    console.warn(
      'compile: rayact_tool not found in this prebuilt; falling back to the rayact_desktop ' +
        'host (works, but pulls in the GUI runtime). Update the prebuilt to 0.0.4+.'
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
