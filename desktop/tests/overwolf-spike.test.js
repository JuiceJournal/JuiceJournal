const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../overwolf-spike');

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

test('overwolf spike harness documents manual runtime capture', () => {
  for (const file of ['package.json', 'manifest.json', 'index.html', 'main.js', 'preload.js', 'capture.js', 'README.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }

  assert.equal(fs.existsSync(path.join(root, 'fixtures', '.gitkeep')), true);
});

test('overwolf spike package exposes manual ow-electron scripts', () => {
  const packageJson = readJson('package.json');

  assert.equal(packageJson.private, true);
  assert.equal(packageJson.productName, 'Juice Journal GEP Capture');
  assert.equal(packageJson.author.name, 'Juice Journal');
  assert.deepEqual(packageJson.overwolf.packages, ['gep', 'utility']);
  assert.match(packageJson.scripts.start, /ow-electron/);
  assert.match(packageJson.scripts['start:dev-gep'], /--remote-debugging-port=9229/);
  assert.match(packageJson.scripts['start:dev-gep'], /--owepm-packages-url=https:\/\/electronapi-qa\.overwolf\.com\/packages/);
  assert.equal(packageJson.dependencies, undefined);
  assert.match(packageJson.devDependencies['@overwolf/ow-electron'], /^\^?\d+\.\d+\.\d+/);
});

test('overwolf spike manifest declares PoE game targets and runtime features', () => {
  const manifest = readJson('manifest.json');
  const manifestText = JSON.stringify(manifest);

  assert.match(manifestText, /7212/);
  assert.match(manifestText, /24886/);
  for (const feature of ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill']) {
    assert.match(manifestText, new RegExp(feature));
  }
});

test('overwolf spike capture script redacts chat and does not persist raw payloads', () => {
  const captureScript = readText('capture.js');
  const mainScript = readText('main.js');
  const readme = readText('README.md');

  assert.match(mainScript, /app\?\.overwolf\?\.packages\?\.gep/);
  assert.match(mainScript, /let mainWindow = null/);
  assert.match(mainScript, /mainWindow = new BrowserWindow/);
  assert.match(mainScript, /waitForGepPackage/);
  assert.match(mainScript, /package-manager-status/);
  assert.match(mainScript, /failed-to-initialize/);
  assert.match(mainScript, /getSupportedGames/);
  assert.match(mainScript, /getFeatures\(target\.gameId\)/);
  assert.match(mainScript, /'game-detected'/);
  assert.match(mainScript, /event\.enable\(\)/);
  assert.match(mainScript, /setRequiredFeatures\(target\.gameId, targetFeatures\)/);
  assert.match(mainScript, /ipcMain\.handle\('gep:start-capture'/);
  assert.match(captureScript, /redactChatEvent/);
  assert.match(captureScript, /window\.gepCapture/);
  assert.doesNotMatch(captureScript, /localStorage\.setItem|download|writeFile/);
  assert.doesNotMatch(mainScript, /localStorage\.setItem|download|writeFile/);
  assert.doesNotMatch(captureScript, /rawChat|chatLine|persistChat/i);
  assert.doesNotMatch(mainScript, /rawChat|chatLine|persistChat/i);
  assert.match(readme, /manual verification tooling/i);
  assert.match(readme, /not part of the normal desktop release/i);
  assert.match(readme, /--owepm-packages-url/);
  assert.match(readme, /do not commit raw chat/i);
});

test('overwolf spike preload exposes a narrow capture bridge', () => {
  const preloadScript = readText('preload.js');

  assert.match(preloadScript, /contextBridge\.exposeInMainWorld\('gepCapture'/);
  assert.match(preloadScript, /ipcRenderer\.invoke\('gep:start-capture'\)/);
  assert.match(preloadScript, /ipcRenderer\.on\('gep:capture-record'/);
  assert.doesNotMatch(preloadScript, /window\.overwolf|require\('fs'\)|writeFile/);
});
