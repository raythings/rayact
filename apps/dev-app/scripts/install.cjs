#!/usr/bin/env node
/**
 * Install the prebuilt Rayact Dev App from GitHub Releases (sideload).
 *
 *   npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform android
 *   npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform ios-device
 *   npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform ios-simulator
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const REPO = process.env.RAYACT_DEV_APP_REPO || 'raythings/rayact';
const VERSION = process.env.RAYACT_DEV_APP_VERSION || 'latest';

const ASSET_BY_PLATFORM = {
  android: 'rayact-dev-app.apk',
  'ios-device': 'rayact-dev-app-device-unsigned.ipa',
  'ios-simulator': 'rayact-dev-app-simulator.zip',
  ios: 'rayact-dev-app-device-unsigned.ipa'
};

function parseArgs(argv) {
  let platform = 'android';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform' && argv[i + 1]) {
      platform = argv[i + 1];
      i++;
    }
  }
  return { platform };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'rayact-dev-app-installer' } }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'rayact-dev-app-installer' } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', reject);
  });
}

async function resolveReleaseAsset(assetName) {
  const apiUrl = VERSION === 'latest'
    ? `https://api.github.com/repos/${REPO}/releases/latest`
    : `https://api.github.com/repos/${REPO}/releases/tags/v${VERSION.replace(/^v/, '')}`;
  const release = await fetchJson(apiUrl);
  const asset = (release.assets || []).find(a => a.name === assetName);
  if (!asset) {
    throw new Error(`Release asset "${assetName}" not found.`);
  }
  return { url: asset.browser_download_url, name: asset.name };
}

async function installAndroid(apkPath) {
  const adb = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (adb.status !== 0) {
    console.error('adb not found. Install Android platform-tools.');
    process.exit(1);
  }
  console.log('Installing APK via adb...');
  const install = spawnSync('adb', ['install', '-r', apkPath], { stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status ?? 1);
  console.log('Launching Rayact Dev App...');
  spawnSync('adb', ['shell', 'am', 'start', '-n', 'com.rayact.devapp/.DevLauncherActivity'], {
    stdio: 'inherit'
  });
}

function installIosSimulator(zipPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-dev-app-'));
  execSync(`unzip -q "${zipPath}" -d "${tmp}"`, { stdio: 'inherit' });
  const app = fs.readdirSync(tmp).find(f => f.endsWith('.app'));
  if (!app) {
    console.error('No .app found in simulator zip');
    process.exit(1);
  }
  const appPath = path.join(tmp, app);
  console.log('Installing on booted simulator...');
  spawnSync('xcrun', ['simctl', 'install', 'booted', appPath], { stdio: 'inherit' });
  console.log(`Installed ${app}. Launch from simulator home screen.`);
}

function printIosDeviceInstructions(ipaPath) {
  console.log(`
Downloaded unsigned device IPA:
  ${ipaPath}

Re-sign before installing on a physical device, for example:

  fastlane resign ${path.basename(ipaPath)} \\
    --signing-cert "Apple Development: Your Name (TEAMID)" \\
    -p YourProfile.mobileprovision

Then install with ios-deploy or Xcode Devices window.

See: https://github.com/${REPO}/blob/main/rayact/docs/maintainer-prebuilts.md
`);
}

async function main() {
  const { platform } = parseArgs(process.argv.slice(2));
  const assetName = ASSET_BY_PLATFORM[platform];
  if (!assetName) {
    console.error(`Unknown platform: ${platform}. Use android, ios-device, or ios-simulator.`);
    process.exit(1);
  }

  const cacheDir = path.join(os.homedir(), '.rayact', 'dev-app');
  fs.mkdirSync(cacheDir, { recursive: true });

  const localFallbacks = {
    android: path.resolve(__dirname, '../dist/rayact-dev-app.apk'),
    'ios-device': path.resolve(__dirname, '../dist/rayact-dev-app-device-unsigned.ipa'),
    'ios-simulator': path.resolve(__dirname, '../dist/rayact-dev-app-simulator.zip'),
    ios: path.resolve(__dirname, '../dist/rayact-dev-app-device-unsigned.ipa')
  };

  let dest = path.join(cacheDir, assetName);

  try {
    const { url, name } = await resolveReleaseAsset(assetName);
    console.log(`Downloading ${name}...`);
    await downloadFile(url, dest);
    console.log(`Saved to ${dest}`);
  } catch (err) {
    const local = localFallbacks[platform];
    if (local && fs.existsSync(local)) {
      console.warn(`GitHub release unavailable (${err.message}). Using ${local}`);
      dest = local;
    } else {
      console.error(err.message || err);
      console.error(`
Build locally:
  cd apps/dev-app && npm run build:all
`);
      process.exit(1);
    }
  }

  if (platform === 'android') {
    await installAndroid(dest);
  } else if (platform === 'ios-simulator') {
    installIosSimulator(dest);
  } else {
    printIosDeviceInstructions(dest);
  }
}

main();
