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

test('main process exposes app update state, check, and install handlers', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /ipcMain\.handle\('get-app-update-state'/);
  assert.match(source, /ipcMain\.handle\('check-for-app-update'/);
  assert.match(source, /ipcMain\.handle\('install-app-update'/);
  assert.match(source, /app-update-state-changed/);
});

test('desktop preload exposes update methods and update-state subscription', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /getAppUpdateState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-app-update-state'\)/);
  assert.match(source, /checkForAppUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('check-for-app-update'\)/);
  assert.match(source, /installAppUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('install-app-update'\)/);
  assert.match(source, /onAppUpdateStateChanged:\s*\(callback\)\s*=>/);
  assert.match(source, /ipcRenderer\.on\('app-update-state-changed'/);
});
