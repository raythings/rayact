export function printHelp(): void {
  console.log(`
Rayact CLI — cross-platform React + QuickJS + raylib

Usage:
  rayact <command> [options]

Commands:
  init [name]           Create a new Rayact app (alias for create-rayact-app)
  dev                   Start dev server + bundler + TUI
  start                 Run native host with built bundle or dev server
  run:desktop           Start desktop host (dev server or dist/bundle.js)
  run:android           Start Android with adb reverse + optional install
  build                 Build release/debug bundle
  export                Build production bundle (alias for build --release)
  compile <in> <out>    Compile JS bundle to QuickJS bytecode (.qjsbc)
  verify                Run desktop verification script
  verify --android      Run Android verification script

Options:
  --host <host>         Dev server host (default: 0.0.0.0)
  --port <port>         Dev server port (default: 8081)
  --entry <path>        App entry (default: src/App.tsx)
  --platform <name>     Target platform: desktop | android
  --template <name>     init template: default | blank
  --dev                 start: connect to dev server instead of bundle
  --android             dev/run: adb reverse ports; build: assemble APK
  --install             build android: install APK after build
  --minify / --no-minify
  --bytecode / --no-bytecode
  --release / --debug
  -h, --help            Show help
  -v, --version         Show version

Examples:
  npx create-rayact-app my-app
  cd my-app && npm install && npm run dev
  rayact start --dev
  rayact run:desktop
  rayact build --release
  rayact export
`.trim());
}

export function printVersion(): void {
  console.log('@rayact/cli 0.1.0');
}
