// Ink terminal UI for `rayact dev`. Kept in its own module and dynamically
// imported only on the dev path so the `build`/release path never loads `ink`.

import path from 'node:path';
import readline from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { render as inkRender, Box, Text, useApp, useInput } from 'ink';
import qrcode from 'qrcode-terminal';
import { startRayactDevServer } from './server.js';
import { loadRayactConfig } from './config.js';
import { setupAdbReverse } from './adb.js';
import { startWebDevBridge, type WebDevBridge } from './webDev.js';
import { resolveDesktopBinPrebuilt as resolveDesktopPrebuilt } from '@rayact/prebuild';
import type { RayactBuildMode } from './bundler.js';
import type { RayactDevServer } from './types.js';

export interface ParsedArgs {
  command: string;
  host: string;
  port: number;
  strictPort: boolean;
  strictWebPort: boolean;
  entry: string;
  platform: string;
  webPort: number;
  desktopBin: string;
  mode: RayactBuildMode;
  outDir: string;
  minify: boolean;
  bytecode: boolean;
  android: boolean;
  debug: boolean;
}

function createQr(value: string): string {
  let output = '';
  qrcode.generate(value, { small: true }, qr => {
    output = qr;
  });
  return output.trimEnd();
}

function formatTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

type Mode = 'tui' | 'log';

let mode: Mode = 'tui';
let inkInstance: ReturnType<typeof inkRender> | null = null;
let activeServer: RayactDevServer | null = null;
let activeWebBridge: WebDevBridge | null = null;
let cliArgs: ParsedArgs;
let devMinify = false;
let devBytecode = false;

function printLogHeader(server: RayactDevServer): void {
  const qr = createQr(server.qrPayload);
  process.stdout.write('\n');
  process.stdout.write('  Rayact Dev Server\n');
  process.stdout.write(`  URL:   ${server.url}\n`);
  process.stdout.write(`  Local: ${server.localUrl}\n`);
  process.stdout.write(`  Entry: ${server.entry}\n`);
  process.stdout.write(`  Tools: ${server.devtoolsUrl}\n`);
  if (activeWebBridge) {
    process.stdout.write(`  Web:   ${activeWebBridge.openUrl}\n`);
  }
  process.stdout.write(`  QR:    server address list (scan with Rayact dev client)\n`);
  process.stdout.write('\n');
  process.stdout.write(qr + '\n');
  process.stdout.write('\n');
  process.stdout.write('  ── c interactive · t devtools · r reload · d desktop · a android · i ios · w web · q quit ──\n\n');
}

function onLogModeKey(str: string, key: { ctrl?: boolean; name?: string }): void {
  if ((key?.ctrl && key?.name === 'c') || str === 'q' || str === 'Q') {
    void closeDevSession().finally(() => process.exit(0));
    return;
  }
  // Log mode replaces the Ink app (and its useInput bindings), so the action
  // keys must be handled here too — otherwise once a client connects and the UI
  // auto-switches to log mode, t/r/a/i/w/d silently stop working.
  switch (str) {
    case 'c': case 'C': enterTuiMode(); break;
    case 't': case 'T': logAction.openDevtools(); break;
    case 'r': logAction.reload(); break;
    case 'a': logAction.launchMobile('android'); break;
    case 'i': logAction.launchMobile('ios'); break;
    case 'w': logAction.launchWeb(); break;
    case 'd': case 'D': logAction.launchDesktop(); break;
  }
}

async function closeDevSession(): Promise<void> {
  await activeWebBridge?.close();
  activeWebBridge = null;
  await activeServer?.close();
  activeServer = null;
}

async function maybeStartWebBridge(
  server: RayactDevServer,
  platform: string,
  webPort?: number,
  strictWebPort?: boolean
): Promise<WebDevBridge | null> {
  if (platform !== 'web') return null;
  const bridge = await startWebDevBridge(server.localUrl, { port: webPort, strictPort: strictWebPort });
  activeWebBridge = bridge;
  return bridge;
}

function setupLogModeStdin(): void {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('keypress', onLogModeKey);
}

function openUrl(url: string): void {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

function launchRayactCommand(
  args: string[],
  envOverrides: Record<string, string> = {}
): ChildProcess {
  const script = process.argv[1];
  return spawn(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, ...envOverrides }
  });
}

// Action keys for log mode (no React state here — write straight to stdout).
// The Ink component keeps its own status-aware handlers; these mirror the same
// side effects so the shortcuts keep working after the auto-switch to log mode.
const logAction = {
  line(msg: string): void { process.stdout.write(`  ▸ ${msg}\n`); },
  openDevtools(): void {
    if (!activeServer) { logAction.line('Server not ready'); return; }
    openUrl(activeServer.devtoolsUrl);
    logAction.line(`DevTools opened: ${activeServer.devtoolsUrl}`);
  },
  reload(): void {
    if (!activeServer) { logAction.line('Server not ready'); return; }
    void activeServer.reload()
      .then(() => logAction.line('Reload sent'))
      .catch(error => logAction.line(`Reload failed: ${error instanceof Error ? error.message : String(error)}`));
  },
  launchMobile(platform: 'android' | 'ios'): void {
    if (!activeServer) { logAction.line('Server not ready'); return; }
    if (platform === 'android') {
      void setupAdbReverse(activeServer.localUrl, loadRayactConfig().devServer?.cdpPort ?? 9229);
    }
    const child = launchRayactCommand(
      ['dev-app', platform === 'android' ? '--android' : '--ios-simulator'],
      { RAYACT_DEV_SERVER: activeServer.localUrl }
    );
    child.unref();
    logAction.line(`Launching ${platform} dev app...`);
  },
  launchDesktop(): void {
    if (!activeServer) { logAction.line('Server not ready'); return; }
    const resolved = resolveDesktopPrebuilt(process.cwd(), cliArgs.desktopBin || undefined);
    if (!resolved) { logAction.line('Desktop host not found. Run `rayact prebuild`.'); return; }
    const child = spawn(resolved.bin, ['--dev-server', activeServer.localUrl], {
      cwd: process.cwd(), stdio: 'ignore', detached: true,
      // Older packaged desktop hosts only read RAYACT_DEV_SERVER. Override any
      // stale inherited value so the shortcut always targets this server.
      env: {
        ...process.env,
        RAYACT_DEBUG: '1',
        RAYACT_DEV_SERVER: activeServer.localUrl
      }
    });
    child.unref();
    logAction.line('Started desktop app');
  },
  launchWeb(): void {
    if (!activeServer) { logAction.line('Server not ready'); return; }
    void (async () => {
      try {
        if (!activeWebBridge) {
          activeWebBridge = await startWebDevBridge(activeServer.localUrl, {
            port: cliArgs.webPort, strictPort: cliArgs.strictWebPort
          });
        }
        openUrl(activeWebBridge.openUrl);
        logAction.line(`Web host opened: ${activeWebBridge.openUrl}`);
      } catch (error) {
        logAction.line(`Web failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }
};

function cleanupLogModeStdin(): void {
  process.stdin.off('keypress', onLogModeKey);
}

function enterLogMode(): void {
  if (mode === 'log') return;
  mode = 'log';
  inkInstance?.unmount();
  inkInstance = null;
  if (activeServer) printLogHeader(activeServer);
  setupLogModeStdin();
}

function enterTuiMode(): void {
  if (mode === 'tui') return;
  mode = 'tui';
  cleanupLogModeStdin();
  process.stdout.write('\x1b[2J\x1b[H');
  inkInstance = inkRender(<RayactCli args={cliArgs} onEnterLogMode={enterLogMode} />);
}

interface RayactCliProps {
  args: ParsedArgs;
  onEnterLogMode: () => void;
}

function RayactCli({ args, onEnterLogMode }: RayactCliProps) {
  const { exit } = useApp();
  const [server, setServer] = useState<RayactDevServer | null>(null);
  const [status, setStatus] = useState('Starting Rayact dev server...');
  const [desktop, setDesktop] = useState<ChildProcess | null>(null);
  const [minify, setMinify] = useState(devMinify);
  const [bytecode, setBytecode] = useState(devBytecode);
  const [clientCount, setClientCount] = useState(0);
  const [webOpenUrl, setWebOpenUrl] = useState<string | null>(null);

  const qr = useMemo(() => createQr(server?.qrPayload ?? 'rayact'), [server?.qrPayload]);

  const startServer = useCallback(() => {
    // The TUI unmounts/remounts each time it toggles with log mode, but the dev
    // server lives on (activeServer). Reuse it instead of spinning up a second
    // one on the same port.
    if (activeServer) {
      setServer(activeServer);
      setStatus(`Server ready at ${activeServer.url}`);
      return;
    }
    void startRayactDevServer({
      ...args,
      minify,
      bytecode,
      onClientLog: onEnterLogMode
    })
      .then(async started => {
        activeServer = started;
        setServer(started);
        setStatus(`Server ready at ${started.url}`);
        if (args.platform === 'web') {
          try {
            const bridge = await maybeStartWebBridge(started, args.platform, args.webPort, args.strictWebPort);
            if (bridge) {
              setWebOpenUrl(bridge.openUrl);
              setStatus(`Web ready — open ${bridge.openUrl}`);
            }
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
          }
        } else if (args.android) {
          const config = loadRayactConfig();
          const ok = await setupAdbReverse(started.localUrl, config.devServer?.cdpPort ?? 9229);
          setStatus(ok
            ? `Server ready + adb reverse configured`
            : `Server ready (adb reverse skipped — no device?)`);
        }
      })
      .catch(error => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
  }, [args, minify, bytecode, onEnterLogMode]);

  useEffect(() => {
    // No unmount cleanup that nulls activeServer: the server survives TUI↔log
    // toggles, and log-mode action keys (t/r/a/i/w/d) read activeServer. It is
    // cleared only on real teardown via closeDevSession().
    startServer();
  }, [startServer]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClientCount(server?.clientCount() ?? 0);
    }, 500);
    return () => clearInterval(timer);
  }, [server]);

  const launchDesktop = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    if (desktop && desktop.exitCode === null) { setStatus('Desktop app is already running'); return; }

    const resolved = resolveDesktopPrebuilt(process.cwd(), args.desktopBin || undefined);
    if (!resolved) {
      setStatus('Desktop host not found. Run `rayact prebuild` and try again.');
      return;
    }
    const bin = resolved.bin;
    const child = spawn(bin, ['--dev-server', server.localUrl], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true,
      env: {
        ...process.env,
        RAYACT_DEBUG: '1',
        RAYACT_DEV_SERVER: server.localUrl
      }
    });
    child.unref();
    setDesktop(child);
    setStatus(`Started desktop app at ${formatTime()}`);
    child.on('exit', code => {
      setStatus(`Desktop app exited${typeof code === 'number' ? ` with code ${code}` : ''}`);
      setDesktop(null);
    });
    child.on('error', error => {
      setStatus(`Failed to start desktop app: ${error.message}`);
      setDesktop(null);
    });
  }, [args.desktopBin, desktop, server]);

  const launchAndroid = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    void setupAdbReverse(server.localUrl, loadRayactConfig().devServer?.cdpPort ?? 9229);
    const child = launchRayactCommand(
      ['dev-app', '--android'],
      { RAYACT_DEV_SERVER: server.localUrl }
    );
    child.unref();
    setStatus(`Installing/launching Android dev app at ${formatTime()}`);
    child.on('error', error => setStatus(`Failed to launch Android dev app: ${error.message}`));
  }, [server]);

  const launchIos = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    const child = launchRayactCommand(
      ['dev-app', '--ios-simulator'],
      { RAYACT_DEV_SERVER: server.localUrl }
    );
    child.unref();
    setStatus(`Installing/launching iOS simulator dev app at ${formatTime()}`);
    child.on('error', error => setStatus(`Failed to launch iOS dev app: ${error.message}`));
  }, [server]);

  const launchWeb = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    void (async () => {
      try {
        if (!activeWebBridge) {
          const bridge = await startWebDevBridge(server.localUrl, {
            port: args.webPort,
            strictPort: args.strictWebPort
          });
          activeWebBridge = bridge;
          setWebOpenUrl(bridge.openUrl);
        }
        if (activeWebBridge) {
          openUrl(activeWebBridge.openUrl);
          setStatus(`Web host opened at ${formatTime()}`);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [args.strictWebPort, args.webPort, server]);

  const reload = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    void server.reload()
      .then(() => setStatus(`Reload sent at ${formatTime()}`))
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, [server]);

  const openDevtools = useCallback(() => {
    if (!server) { setStatus('Server is not ready yet'); return; }
    openUrl(server.devtoolsUrl);
    setStatus(`DevTools opened at ${formatTime()}`);
  }, [server]);

  const toggleMinify = useCallback(() => {
    devMinify = !devMinify;
    setMinify(devMinify);
    setStatus(`Minify ${devMinify ? 'ON' : 'OFF'} — restart dev server to apply`);
  }, []);

  const toggleBytecode = useCallback(() => {
    devBytecode = !devBytecode;
    setBytecode(devBytecode);
    setStatus(`Bytecode ${devBytecode ? 'ON' : 'OFF'} (disables Fast Refresh) — restart to apply`);
  }, []);

  const quit = useCallback(() => {
    void closeDevSession().finally(() => exit());
  }, [exit]);

  useInput((input, key) => {
    if (input === 'c' || input === 'C') onEnterLogMode();
    else if (input === 'd' || input === 'D') launchDesktop();
    else if (input === 'a') launchAndroid();
    else if (input === 'i') launchIos();
    else if (input === 'w') launchWeb();
    else if (input === 'r') reload();
    else if (input === 'm') toggleMinify();
    else if (input === 'b') toggleBytecode();
    else if (input === 't' || input === 'T') openDevtools();
    else if (input === 'q' || key.escape || (key.ctrl && input === 'c')) quit();
  });

  const isError = status.toLowerCase().includes('failed') || status.toLowerCase().includes('error');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Rayact Dev Server</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>URL: <Text color="green">{server?.url ?? 'starting...'}</Text></Text>
        <Text>Local: <Text color="green">{server?.localUrl ?? 'starting...'}</Text></Text>
        <Text>Tools: <Text color="green">{server?.devtoolsUrl ?? 'starting...'}</Text></Text>
        <Text>Entry: <Text color="yellow">{server?.entry ?? args.entry}</Text></Text>
        <Text>Default target: {server?.platform ?? args.platform} (clients pick their own via ?platform=)   Clients: {clientCount}</Text>
        {webOpenUrl ? (
          <Text>Web: <Text color="green">{webOpenUrl}</Text></Text>
        ) : null}
        <Text>Minify: {minify ? 'on' : 'off'}   Bytecode: {bytecode ? 'on' : 'off'}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>{qr}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan">c</Text> log{'   '}
          <Text color="cyan">d</Text> desktop{'   '}
          <Text color="cyan">a</Text> android{'   '}
          <Text color="cyan">i</Text> ios{'   '}
          <Text color="cyan">w</Text> web{'   '}
          <Text color="cyan">r</Text> reload{'   '}
          <Text color="cyan">m</Text> minify{'   '}
          <Text color="cyan">b</Text> bytecode{'   '}
          <Text color="cyan">t</Text> devtools{'   '}
          <Text color="cyan">q</Text> quit
        </Text>
        <Text color={isError ? 'red' : 'gray'}>{status}</Text>
      </Box>
    </Box>
  );
}

export function startDevTui(args: ParsedArgs): void {
  cliArgs = args;
  devMinify = args.minify;
  devBytecode = args.bytecode;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    mode = 'log';
    void startRayactDevServer({
      ...args,
      minify: args.minify,
      bytecode: args.bytecode
    })
      .then(async started => {
        activeServer = started;
        if (args.platform === 'web') {
          await maybeStartWebBridge(started, args.platform, args.webPort, args.strictWebPort);
        }
        printLogHeader(started);
        if (args.android) {
          const config = loadRayactConfig();
          const ok = await setupAdbReverse(started.localUrl, config.devServer?.cdpPort ?? 9229);
          process.stdout.write(ok
            ? '  adb reverse configured\n'
            : '  adb reverse skipped - no device?\n');
        }
      })
      .catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    return;
  }
  inkInstance = inkRender(<RayactCli args={args} onEnterLogMode={enterLogMode} />);
}
