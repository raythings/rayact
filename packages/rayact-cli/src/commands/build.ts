import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  adbInstall,
  adbLaunch,
  loadRayactConfig,
  resolveTransformFlag,
  writeRayactBuild
} from '@rayact/dev-server';
import type { RayactBuildMode } from '@rayact/dev-server';
import type { CliFlags } from '../parse.js';

export async function runBuild(flags: CliFlags): Promise<void> {
  const config = loadRayactConfig();
  let buildMode: RayactBuildMode = flags.command === 'export' || flags.mode === 'release'
    ? 'release'
    : flags.mode === 'development' ? 'release' : flags.mode;

  if (flags.android && flags.debug && buildMode === 'release') {
    buildMode = 'dev-client';
  }

  const isRelease = buildMode === 'release';
  const minify = resolveTransformFlag(
    config, 'minify', isRelease ? 'release' : 'debug', flags.minify
  );
  const bytecode = resolveTransformFlag(
    config, 'bytecode', isRelease ? 'release' : 'debug', flags.bytecode
  );
  const outDir = path.resolve(process.cwd(), flags.outDir);

  const output = await writeRayactBuild({
    root: process.cwd(),
    entry: flags.entry,
    platform: flags.platform,
    mode: buildMode,
    outDir,
    minify,
    bytecode,
    desktopBin: flags.desktopBin
  });

  console.log(`Rayact ${output.mode} build written to ${outDir}`);
  console.log(`Bundle: ${output.bundleFormat === 'qjsbc' ? 'bundle.qjsbc' : 'bundle.js'}`);
  console.log(`Assets: ${output.assets.length}`);

  if (flags.android) {
    const variant = flags.debug ? 'Debug' : 'Release';
    const assetsDir = path.resolve(process.cwd(), 'apps/android/app/src/main/assets');
    await fs.mkdir(assetsDir, { recursive: true });
    if (output.bundleFormat === 'qjsbc' && output.bytecode) {
      await fs.writeFile(path.join(assetsDir, 'app.qjsbc'), output.bytecode);
    } else {
      await fs.writeFile(path.join(assetsDir, 'app.js'), output.code);
    }

    const gradle = spawnSync('./gradlew', [`:app:assemble${variant}`], {
      cwd: path.resolve(process.cwd(), 'apps/android'),
      stdio: 'inherit'
    });
    if (gradle.status !== 0) process.exit(gradle.status ?? 1);

    const apk = path.resolve(process.cwd(),
      `apps/android/app/build/outputs/apk/${flags.debug ? 'debug' : 'release'}/app-${flags.debug ? 'debug' : 'release'}.apk`);
    if (flags.android && adbInstall(apk)) {
      adbLaunch(config.android?.package ?? 'com.rayact.app', '.MainActivity');
    }
  }
}
