import { spawnSync } from 'node:child_process';

function runAdb(args: string[]): boolean {
  const result = spawnSync('adb', args, { encoding: 'utf8' });
  return result.status === 0;
}

export function parseAdbForwards(output: string): Array<{ serial: string; local: string; remote: string }> {
  return output.split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => {
    const [serial, local, remote] = line.split(/\s+/);
    return serial && local && remote ? [{ serial, local, remote }] : [];
  });
}

export function cleanupLegacyAdbCdpForwards(cdpPort = 9229): number {
  const result = spawnSync('adb', ['forward', '--list'], { encoding: 'utf8' });
  if (result.status !== 0) return 0;
  const endpoint = `tcp:${cdpPort}`;
  let removed = 0;
  for (const forward of parseAdbForwards(result.stdout ?? '')) {
    if (forward.local !== endpoint || forward.remote !== endpoint) continue;
    if (runAdb(['-s', forward.serial, 'forward', '--remove', endpoint])) removed++;
  }
  return removed;
}

function hasDevice(): boolean {
  const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (result.status !== 0) return false;
  const lines = (result.stdout ?? '').split('\n').slice(1);
  return lines.some(line => line.trim().endsWith('device') && !line.includes('offline'));
}

export async function setupAdbReverse(localUrl: string, _cdpPort = 9229): Promise<boolean> {
  if (!hasDevice()) return false;
  const port = Number(new URL(localUrl).port || 8081);
  runAdb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  return true;
}

export function adbInstall(apkPath: string): boolean {
  if (!hasDevice()) return false;
  return runAdb(['install', '-r', apkPath]);
}

export function adbLaunch(
  packageName: string,
  activity: string,
  extras: Record<string, string> = {}
): boolean {
  const args = ['shell', 'am', 'start', '-n', `${packageName}/${activity}`];
  for (const [key, value] of Object.entries(extras)) args.push('--es', key, value);
  return runAdb(args);
}
