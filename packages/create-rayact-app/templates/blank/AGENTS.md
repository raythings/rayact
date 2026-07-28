# Working on this app with an AI agent

This file documents the non-interactive development loop. Nothing here needs
the interactive `rayact dev` terminal UI — every step works from scripts, CI,
or an agent that cannot press keys in a TTY.

## The dev loop

1. Start the dev server (leave it running in the background):

   ```bash
   npm run dev
   ```

2. Attach a client once — Android device (`npm run android`), iOS simulator
   (`npm run ios`), or desktop host (`npm run start:dev`).

3. **Edit and save. That's it.** The dev server pushes hot updates over HMR on
   every save; the running app applies them in place, preserving app state.
   You do not need to rebuild, reinstall, or relaunch the app to see a code
   change.

## Reloading without restarting the app

If you want a clean re-run of the JS entry (fresh state) — or you changed
something HMR doesn't cover, like `rayact.config.json` assets — trigger a full
JS reload of every connected client. This restarts the *bundle*, not the app
process, and takes ~a second:

```bash
curl -X POST http://127.0.0.1:8081/rayact/reload
```

Reinstalling the APK / relaunching the process is almost never the right
response to a code change; reserve it for native-side changes.

## Checking whether the build is healthy

```bash
curl http://127.0.0.1:8081/rayact/status
```

Returns `ok: true` plus the current revision, or `ok: false` with the build
error message when the last save didn't compile.

## Errors and recovery

- A build error or an uncaught render error shows a red error screen on the
  device with the message and stack.
- The error screen clears itself on the next save that evaluates cleanly (or
  after `POST /rayact/reload`). Fix the code, save, and the app comes back —
  no restart needed.

## Logs

- Dev-server terminal shows bundler output and forwarded `console.*` logs.
- Android native logs: `adb logcat -s rayact` (crashes, native-side warnings).
