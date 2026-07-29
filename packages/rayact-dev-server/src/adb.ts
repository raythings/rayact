import { spawnSync } from 'node:child_process';

function runAdb(args: string[]): boolean {
  const result = spawnSync('adb', args, { encoding: 'utf8' });
  return result.status === 0;
}

function adbText(args: string[]): string | null {
  const result = spawnSync('adb', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? '';
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

/** Serials from `adb devices` output that are online (not offline/unauthorized). */
export function parseAdbDevices(output: string): string[] {
  return output
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const [serial, state] = line.split(/\s+/);
      return serial && state === 'device' ? [serial] : [];
    });
}

/** Serials of every attached device that is online (not `offline`/`unauthorized`). */
export function listAdbDevices(): string[] {
  const stdout = adbText(['devices']);
  if (stdout === null) return [];
  return parseAdbDevices(stdout);
}

function hasDevice(): boolean {
  return listAdbDevices().length > 0;
}

function portFromUrl(localUrl: string): number {
  try {
    return Number(new URL(localUrl).port || 8081);
  } catch {
    return 8081;
  }
}

/** True when this serial already reverses `tcp:port` to the host. */
export function hasAdbReverse(serial: string, port: number): boolean {
  const stdout = adbText(['-s', serial, 'reverse', '--list']);
  if (stdout === null) return false;
  const endpoint = `tcp:${port}`;
  return parseAdbForwards(stdout).some(entry => entry.local === endpoint && entry.remote === endpoint);
}

/**
 * Reverse the dev-server port on every attached device.
 *
 * Always passes `-s <serial>`: a bare `adb reverse` fails outright once a
 * second device (or an emulator) is attached, which used to leave the phone
 * with no route to 127.0.0.1 and no diagnostic — the app then cannot fetch
 * modules or open the HMR socket.
 */
export async function setupAdbReverse(localUrl: string, _cdpPort = 9229): Promise<boolean> {
  const serials = listAdbDevices();
  if (serials.length === 0) return false;
  const port = portFromUrl(localUrl);
  let applied = false;
  for (const serial of serials) {
    if (runAdb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`])) applied = true;
  }
  return applied;
}

export interface AdbReverseWatcher {
  stop(): void;
}

export interface AdbReverseWatcherOptions {
  intervalMs?: number;
  /** Called whenever the reverse is (re)applied to a device. */
  onApply?: (serial: string, port: number) => void;
}

/**
 * Keep `adb reverse tcp:<port>` alive for the life of the dev server.
 *
 * A reverse mapping is per-device and per-adb-connection: unplugging the cable,
 * an adb server restart, a device reboot, or swapping to a different phone all
 * drop it silently. The dev server kept running, the manifest kept advertising
 * `ws://127.0.0.1:<port>/rayact/hmr`, and the device simply stopped receiving
 * hot updates — the "HMR just stopped working" symptom, with nothing logged.
 * Polling costs one `adb devices` per tick and re-applies only what is missing.
 */
export function startAdbReverseWatcher(
  localUrl: string,
  options: AdbReverseWatcherOptions = {}
): AdbReverseWatcher {
  const intervalMs = options.intervalMs ?? 3000;
  const port = portFromUrl(localUrl);
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    for (const serial of listAdbDevices()) {
      if (hasAdbReverse(serial, port)) continue;
      if (runAdb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`])) {
        options.onApply?.(serial, port);
      }
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    }
  };
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
