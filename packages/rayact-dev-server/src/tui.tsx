// Ink terminal UI for `rayact dev`. Kept in its own module and dynamically
// imported only on the dev path so the `build`/release path never loads `ink`
// (which statically imports React; under React 19.2 Node's cjs-lexer can't see
// ink's `import { useEffectEvent } from 'react'`, killing the CLI at startup).

import path from 'node:path';
import readline from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { render as inkRender, Box, Text, useApp, useInput } from 'ink';
import qrcode from 'qrcode-terminal';
import { startRayactDevServer } from './server.js';
import type { RayactBuildMode } from './bundler.js';
import type { RayactDevServer } from './types.js';

export interface ParsedArgs {
  command: string;
  host: string;
  port: number;
  entry: string;
  platform: string;
  desktopBin: string;
  mode: RayactBuildMode;
  outDir: string;
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

// ─── Mode manager (imperative, lives outside React) ───────────────────────────

type Mode = 'tui' | 'log';

let mode: Mode = 'tui';
let inkInstance: ReturnType<typeof inkRender> | null = null;
let activeServer: RayactDevServer | null = null;
let cliArgs: ParsedArgs;

function printLogHeader(server: RayactDevServer): void {
  const qr = createQr(server.url);
  process.stdout.write('\n');
  process.stdout.write('  Rayact Dev Server\n');
  process.stdout.write(`  URL:   ${server.url}\n`);
  process.stdout.write(`  Local: ${server.localUrl}\n`);
  process.stdout.write(`  Entry: ${server.entry}\n`);
  process.stdout.write('\n');
  process.stdout.write(qr + '\n');
  process.stdout.write('\n');
  process.stdout.write('  ── Press C to return to interactive mode, Q to quit ──\n\n');
}

function onLogModeKey(str: string, key: { ctrl?: boolean; name?: string }): void {
  if ((key?.ctrl && key?.name === 'c') || str === 'q' || str === 'Q') {
    void activeServer?.close().finally(() => process.exit(0));
    return;
  }
  if (str === 'c' || str === 'C') {
    enterTuiMode();
  }
}

function setupLogModeStdin(): void {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('keypress', onLogModeKey);
}

function cleanupLogModeStdin(): void {
  process.stdin.off('keypress', onLogModeKey);
  // Ink will re-enable raw mode when it mounts; don't fight it here.
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
  process.stdout.write('\x1b[2J\x1b[H'); // clear + cursor home
  inkInstance = inkRender(<RayactCli args={cliArgs} onEnterLogMode={enterLogMode} />);
}

// ─── TUI component ────────────────────────────────────────────────────────────

interface RayactCliProps {
  args: ParsedArgs;
  onEnterLogMode: () => void;
}

function RayactCli({ args, onEnterLogMode }: RayactCliProps) {
  const { exit } = useApp();
  const [server, setServer] = useState<RayactDevServer | null>(null);
  const [status, setStatus] = useState('Starting Rayact dev server...');
  const [desktop, setDesktop] = useState<ChildProcess | null>(null);
  const [clientCount, setClientCount] = useState(0);

  const qr = useMemo(() => createQr(server?.url ?? 'rayact'), [server?.url]);

  useEffect(() => {
    let active = true;
    void startRayactDevServer({ ...args, onClientLog: onEnterLogMode })
      .then(started => {
        if (!active) {
          void started.close();
          return;
        }
        activeServer = started;
        setServer(started);
        setStatus(`Server ready at ${started.url}`);
      })
      .catch(error => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, [args, onEnterLogMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClientCount(server?.clientCount() ?? 0);
    }, 500);
    return () => clearInterval(timer);
  }, [server]);

  const launchDesktop = useCallback(() => {
    if (!server) {
      setStatus('Server is not ready yet');
      return;
    }
    if (desktop && desktop.exitCode === null) {
      setStatus('Desktop app is already running');
      return;
    }

    const bin = path.resolve(process.cwd(), args.desktopBin);
    const child = spawn(bin, ['--dev-server', server.localUrl], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true
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

  const reload = useCallback(() => {
    if (!server) {
      setStatus('Server is not ready yet');
      return;
    }
    void server.reload()
      .then(() => setStatus(`Reload sent at ${formatTime()}`))
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, [server]);

  const quit = useCallback(() => {
    void server?.close().finally(() => exit());
  }, [exit, server]);

  useInput((input, key) => {
    if (input === 'c' || input === 'C') onEnterLogMode();
    else if (input === 'd') launchDesktop();
    else if (input === 'r') reload();
    else if (input === 'q' || key.escape || (key.ctrl && input === 'c')) quit();
  });

  const isError = status.toLowerCase().includes('failed') || status.toLowerCase().includes('error');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Rayact Dev Server</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>URL: <Text color="green">{server?.url ?? 'starting...'}</Text></Text>
        <Text>Local desktop URL: <Text color="green">{server?.localUrl ?? 'starting...'}</Text></Text>
        <Text>Entry: <Text color="yellow">{server?.entry ?? args.entry}</Text></Text>
        <Text>Platform: {server?.platform ?? args.platform}   Clients: {clientCount}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>{qr}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan">c</Text> log mode{'   '}
          <Text color="cyan">d</Text> open desktop{'   '}
          <Text color="cyan">r</Text> reload clients{'   '}
          <Text color="cyan">q</Text> quit
        </Text>
        <Text color={isError ? 'red' : 'gray'}>{status}</Text>
      </Box>
    </Box>
  );
}

/** Boot the interactive dev TUI. Called only from the `dev` command path. */
export function startDevTui(args: ParsedArgs): void {
  cliArgs = args;
  inkInstance = inkRender(<RayactCli args={args} onEnterLogMode={enterLogMode} />);
}
