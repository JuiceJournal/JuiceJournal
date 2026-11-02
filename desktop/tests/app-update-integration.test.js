const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const mainJsPath = path.join(desktopDir, 'main.js');
const preloadJsPath = path.join(desktopDir, 'preload.js');
const packageJsonPath = path.join(desktopDir, 'package.json');

test('desktop package declares updater dependency and github publish config', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(typeof packageJson.dependencies['electron-updater'], 'string');
  assert.equal(Array.isArray(packageJson.build.publish), true);
  assert.deepEqual(packageJson.build.publish[0], {
    provider: 'github',
    owner: 'JuiceJournal',
    repo: 'JuiceJournal'
  });
});

test('main process exposes app update state, check, and download page handlers', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /ipcMain\.handle\('get-app-update-state'/);
  assert.match(source, /ipcMain\.handle\('check-for-app-update'/);
  assert.match(source, /ipcMain\.handle\('open-app-update-page'/);
  assert.match(source, /app-update-state-changed/);
});

// Releases carry no publisher signature, so a compromised release must not install itself on every user's PC.
test('the app only announces updates: it never downloads or installs one', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /autoUpdater\.autoDownload = false;/);
  assert.match(source, /autoUpdater\.autoInstallOnAppQuit = false;/);
  assert.doesNotMatch(source, /quitAndInstall|downloadUpdate|install-app-update/);
  assert.match(source, /APP_RELEASES_URL = 'https:\/\/github\.com\/JuiceJournal\/JuiceJournal\/releases\/latest'/);
});

test('desktop preload exposes update methods and update-state subscription', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /getAppUpdateState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-app-update-state'\)/);
  assert.match(source, /checkForAppUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('check-for-app-update'\)/);
  assert.match(source, /openAppUpdatePage:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('open-app-update-page'\)/);
  assert.doesNotMatch(source, /installAppUpdate/);
  assert.match(source, /onAppUpdateStateChanged:\s*\(callback\)\s*=>/);
  assert.match(source, /ipcRenderer\.on\('app-update-state-changed'/);
});
