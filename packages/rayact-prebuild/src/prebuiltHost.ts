import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  PREBUILT_PACKAGES,
  RAYACT_ENGINE_VERSION,
  RAYACT_MODULE_ABI_VERSION,
  RAYACT_REPO
} from './constants.js';
import { resolvePackageDir, readPrebuiltManifest } from './resolvePrebuilt.js';
import type { PrebuiltManifest } from './types.js';

export type DesktopHostKey = 'darwin-arm64' | 'darwin-x64' | 'linux-x64';

export interface ResolvedDesktop {
  /** Absolute path to the rayact_desktop host executable. */
  bin: string;
  /** Manifest of the resolved prebuilt (null for a source-tree / env binary). */
  manifest: PrebuiltManifest | null;
  /** Where the binary came from. */
  source: 'configured' | 'env' | 'source' | 'package' | 'cache';
}

/** The desktop prebuilt key for the machine we're running on, or null if unsupported. */
export function hostDesktopKey(): DesktopHostKey | null {
  const arch = process.arch; // 'arm64' | 'x64' | ...
  if (process.platform === 'darwin') {
    if (arch === 'arm64') return 'darwin-arm64';
    if (arch === 'x64') return 'darwin-x64';
  }
  if (process.platform === 'linux' && arch === 'x64') return 'linux-x64';
  return null;
}

export function desktopBinName(): string {
  return process.platform === 'win32' ? 'rayact_desktop.exe' : 'rayact_desktop';
}

/** Root of the per-user prebuilt cache (override with RAYACT_CACHE_DIR). */
export function prebuiltCacheDir(version = RAYACT_ENGINE_VERSION, key?: string): string {
  const base = process.env.RAYACT_CACHE_DIR || path.join(os.homedir(), '.rayact', 'prebuilts');
  return key ? path.join(base, version, key) : path.join(base, version);
}

/**
 * Verify a prebuilt manifest is compatible with this CLI. Throws on mismatch so
 * a stale or wrong-ABI binary fails loudly rather than miscompiling/crashing.
 */
export function checkPrebuiltAbi(manifest: PrebuiltManifest | null, label: string): void {
  if (!manifest) return; // source-tree / env binaries are trusted as-is
  if (manifest.moduleAbiVersion !== RAYACT_MODULE_ABI_VERSION) {
    throw new Error(
      `${label}: module ABI ${manifest.moduleAbiVersion} != expected ${RAYACT_MODULE_ABI_VERSION}. ` +
        `Update rayact and the prebuilt to matching versions.`
    );
  }
  if (manifest.engineVersion !== RAYACT_ENGINE_VERSION) {
    // Version skew is a warning, not fatal: the ABI gate above is the hard guard.
    console.warn(
      `${label}: engine version ${manifest.engineVersion} != CLI ${RAYACT_ENGINE_VERSION} (ABI matches; proceeding).`
    );
  }
}

function execAt(dir: string): string | null {
  const bin = path.join(dir, 'bin', desktopBinName());
  return fs.existsSync(bin) ? bin : null;
}

/**
 * Locate the rayact_desktop host without downloading. Order:
 *   1. explicit `configured` path or RAYACT_DESKTOP_BIN env
 *   2. installed @rayact/prebuilt-<host> package in node_modules
 *   3. per-user cache (a previously downloaded prebuilt)
 *   4. source-tree build/bin (maintainer working in the repo)
 * Returns null if none are present (call ensureDesktopPrebuilt to fetch).
 */
export function resolveDesktopBin(
  projectRoot: string,
  configured?: string
): ResolvedDesktop | null {
  const explicit = configured || process.env.RAYACT_DESKTOP_BIN;
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.resolve(projectRoot, explicit);
    if (fs.existsSync(abs)) {
      return { bin: abs, manifest: null, source: configured ? 'configured' : 'env' };
    }
  }

  // Maintainer checkout: prefer the host built from the current source over an
  // installed/cached release package. Otherwise the dev-server shortcuts can
  // silently launch an older engine even though a fresh local build exists.
  if (fs.existsSync(path.join(projectRoot, 'native/desktop/CMakeLists.txt'))) {
    for (const rel of [
      'native/desktop/build-devtools/rayact_desktop',
      'native/desktop/build/rayact_desktop',
      `build/bin/${desktopBinName()}`
    ]) {
      const bin = path.resolve(projectRoot, rel);
      if (fs.existsSync(bin)) return { bin, manifest: null, source: 'source' };
    }
  }

  const key = hostDesktopKey();
  if (key) {
    const pkgDir = resolvePackageDir(projectRoot, PREBUILT_PACKAGES[key]);
    if (pkgDir) {
      const bin = execAt(pkgDir);
      if (bin) return { bin, manifest: readPrebuiltManifest(pkgDir), source: 'package' };
    }
    const cacheDir = prebuiltCacheDir(RAYACT_ENGINE_VERSION, key);
    const bin = execAt(cacheDir);
    if (bin) return { bin, manifest: readPrebuiltManifest(cacheDir), source: 'cache' };
  }

  // Source-tree build output (maintainer dev loop). Keep this after package/cache
  // resolution so a consumer project nested inside a source checkout still uses
  // the release prebuilt it installed.
  for (const rel of ['build/bin', '../../build/bin', '../../../build/bin']) {
    const bin = path.join(path.resolve(projectRoot, rel), desktopBinName());
    if (fs.existsSync(bin)) return { bin, manifest: null, source: 'source' };
  }
  return null;
}

// --- Download ---------------------------------------------------------------

function releaseBaseUrl(version: string): string {
  if (process.env.RAYACT_PREBUILT_BASE_URL) return process.env.RAYACT_PREBUILT_BASE_URL.replace(/\/$/, '');
  const tag = process.env.RAYACT_PREBUILT_TAG || `v${version}`;
  return `https://github.com/${RAYACT_REPO}/releases/download/${tag}`;
}

/** npm-pack tarball name for a prebuilt key, e.g. rayact-prebuilt-darwin-arm64-0.0.1.tgz */
export function prebuiltTarballName(key: string, version = RAYACT_ENGINE_VERSION): string {
  return `rayact-prebuilt-${key}-${version}.tgz`;
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Download a release asset by name into `destDir`, verifying it against the
 * release SHA256SUMS when present (missing sums file / unlisted asset = warn,
 * hash mismatch = throw). Returns the downloaded file path. Shared by the
 * prebuilt-engine and dev-app fetchers.
 */
export async function downloadReleaseAsset(
  assetName: string,
  destDir: string,
  opts: { version?: string } = {}
): Promise<string> {
  const version = opts.version ?? RAYACT_ENGINE_VERSION;
  const base = releaseBaseUrl(version);
  const dest = path.join(destDir, assetName);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-dl-'));
  const tmpPath = path.join(tmp, assetName);
  try {
    console.log(`Downloading ${assetName} from ${base}/${assetName} ...`);
    await fetchToFile(`${base}/${assetName}`, tmpPath);

    const sums = await fetchText(`${base}/SHA256SUMS`);
    if (sums) {
      const want = sums.split('\n').map((l) => l.trim()).find((l) => l.endsWith(assetName));
      if (want) {
        const expected = want.split(/\s+/)[0];
        const got = sha256(tmpPath);
        if (expected !== got) {
          throw new Error(`SHA256 mismatch for ${assetName}: expected ${expected}, got ${got}`);
        }
      } else {
        console.warn(`warning: ${assetName} not listed in SHA256SUMS — skipping integrity check`);
      }
    } else {
      console.warn('warning: release SHA256SUMS not found — skipping integrity check');
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.rmSync(dest, { force: true });
    fs.copyFileSync(tmpPath, dest);
    return dest;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Download + verify + unpack the prebuilt for `key` into the per-user cache,
 * returning the cache dir (layout matches an installed package: bin/, modules/,
 * manifest.json). Verifies the tarball against the release SHA256SUMS when present.
 */
export async function downloadPrebuilt(
  key: string,
  version = RAYACT_ENGINE_VERSION
): Promise<string> {
  const tarName = prebuiltTarballName(key, version);
  const dest = prebuiltCacheDir(version, key);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-unpack-'));
  try {
    const tarPath = await downloadReleaseAsset(tarName, tmp, { version });

    // npm pack wraps content under package/ — strip it so the cache mirrors an installed package.
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    const res = spawnSync('tar', ['-xzf', tarPath, '-C', dest, '--strip-components=1'], {
      stdio: 'inherit'
    });
    if (res.status !== 0) throw new Error(`tar extract failed for ${tarName}`);

    checkPrebuiltAbi(readPrebuiltManifest(dest), `prebuilt ${key}`);
    return dest;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Dev app (prebuilt Expo-Go-style host) -----------------------------------

export type DevAppPlatform = 'android' | 'ios-simulator' | 'ios-device';

const DEV_APP_ASSETS: Record<DevAppPlatform, string> = {
  android: 'rayact-dev-app.apk',
  'ios-simulator': 'rayact-dev-app-simulator.zip',
  'ios-device': 'rayact-dev-app-device-unsigned.ipa'
};

/** Per-user cache dir for downloaded dev-app binaries. */
export function devAppCacheDir(version = RAYACT_ENGINE_VERSION): string {
  const base = process.env.RAYACT_CACHE_DIR || path.join(os.homedir(), '.rayact');
  // RAYACT_CACHE_DIR points at the prebuilts root; keep dev-app beside it.
  const root = process.env.RAYACT_CACHE_DIR ? path.dirname(base) : base;
  return path.join(root, 'dev-app', version);
}

/**
 * Ensure the prebuilt dev app for `platform` is in the per-user cache,
 * downloading it from the GitHub release if missing. Returns the installable
 * path: an .apk (android), an unzipped Rayact.app dir (ios-simulator), or an
 * unsigned .ipa (ios-device).
 */
export async function ensureDevApp(
  platform: DevAppPlatform,
  version = RAYACT_ENGINE_VERSION
): Promise<string> {
  const assetName = DEV_APP_ASSETS[platform];
  const localDist = path.resolve(process.cwd(), 'apps/dev-app/dist');
  const isMaintainerCheckout = fs.existsSync(path.resolve(process.cwd(), 'native/desktop/CMakeLists.txt'));

  // The repository shortcuts should exercise artifacts built from this
  // checkout, not a same-version file left in ~/.rayact from an older build.
  if (isMaintainerCheckout) {
    if (platform === 'ios-simulator') {
      const localApp = path.join(localDist, 'Rayact.app');
      if (fs.existsSync(localApp)) return localApp;
    } else {
      const localAsset = path.join(localDist, assetName);
      if (fs.existsSync(localAsset)) return localAsset;
    }
  }

  const dir = devAppCacheDir(version);
  const assetPath = path.join(dir, assetName);

  if (platform === 'ios-simulator') {
    const appPath = path.join(dir, 'Rayact.app');
    if (fs.existsSync(appPath)) return appPath;
    if (!fs.existsSync(assetPath)) await downloadReleaseAsset(assetName, dir, { version });
    const res = spawnSync('unzip', ['-oq', assetPath, '-d', dir], { stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`unzip failed for ${assetName}`);
    // The zip may contain Rayact.app at the root or one level down.
    if (!fs.existsSync(appPath)) {
      const found = findDirNamed(dir, 'Rayact.app');
      if (!found) throw new Error(`${assetName} did not contain Rayact.app`);
      fs.renameSync(found, appPath);
    }
    return appPath;
  }

  if (fs.existsSync(assetPath)) return assetPath;
  return downloadReleaseAsset(assetName, dir, { version });
}

/** Ensure the release web host files are available and return their directory. */
export async function ensureWebHost(version = RAYACT_ENGINE_VERSION): Promise<string> {
  const configured = process.env.RAYACT_WEB_HOST_DIR;
  if (configured && hasWebHost(configured)) return configured;

  const local = path.resolve(process.cwd(), 'build-web/bin');
  if (hasWebHost(local)) return local;

  const dir = path.join(prebuiltCacheDir(version, 'web'), 'host');
  if (hasWebHost(dir)) return dir;

  const archive = await downloadReleaseAsset(`rayact-web-${version}.tar.gz`, path.dirname(dir), { version });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const res = spawnSync('tar', ['-xzf', archive, '-C', path.dirname(dir)], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`tar failed for ${archive}`);

  const extracted = hasWebHost(dir) ? dir : findWebHostDir(path.dirname(dir));
  if (!extracted) throw new Error(`rayact-web-${version}.tar.gz did not contain rayact.html/js/wasm`);
  if (extracted !== dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(extracted, dir);
  }
  return dir;
}

function hasWebHost(dir: string): boolean {
  return ['rayact.html', 'rayact.js', 'rayact.wasm'].every((name) => fs.existsSync(path.join(dir, name)));
}

function findWebHostDir(root: string): string | null {
  if (hasWebHost(root)) return root;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findWebHostDir(path.join(root, entry.name));
    if (found) return found;
  }
  return null;
}

function findDirNamed(root: string, name: string): string | null {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = path.join(root, entry.name);
    if (entry.name === name) return p;
    const nested = findDirNamed(p, name);
    if (nested) return nested;
  }
  return null;
}

/**
 * Resolve the desktop host, downloading it into the cache if not already present.
 * This is what `rayact prebuild` / bytecode compile call so a consumer with no
 * source checkout still gets a working compiler/host.
 */
export async function ensureDesktopPrebuilt(
  projectRoot: string,
  configured?: string
): Promise<ResolvedDesktop> {
  const found = resolveDesktopBin(projectRoot, configured);
  if (found) {
    checkPrebuiltAbi(found.manifest, `prebuilt ${found.source}`);
    return found;
  }
  const key = hostDesktopKey();
  if (!key) {
    throw new Error(
      `No prebuilt desktop host for ${process.platform}/${process.arch}. ` +
        `Build from source or set RAYACT_DESKTOP_BIN.`
    );
  }
  const dir = await downloadPrebuilt(key);
  const bin = execAt(dir);
  if (!bin) throw new Error(`Downloaded prebuilt ${key} is missing ${desktopBinName()}`);
  return { bin, manifest: readPrebuiltManifest(dir), source: 'cache' };
}
