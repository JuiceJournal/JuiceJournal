const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const mainProcessPath = path.join(desktopDir, 'main.js');
const packageJsonPath = path.join(desktopDir, 'package.json');
const windowsIconPath = path.join(desktopDir, 'src', 'assets', 'icon.ico');
const desktopIconPngPath = path.join(desktopDir, 'src', 'assets', 'icon.png');
const afterPackScriptPath = path.join(desktopDir, 'scripts', 'after-pack.js');

function parseIcoEntries(buffer) {
  assert.equal(buffer.readUInt16LE(0), 0, 'ICO reserved header must be 0');
  assert.equal(buffer.readUInt16LE(2), 1, 'File must be an ICO image');

  const count = buffer.readUInt16LE(4);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    const offset = 6 + (index * 16);
    entries.push({
      width: buffer[offset] || 256,
      height: buffer[offset + 1] || 256,
      bitCount: buffer.readUInt16LE(offset + 6),
      bytesInRes: buffer.readUInt32LE(offset + 8),
      imageOffset: buffer.readUInt32LE(offset + 12)
    });
  }

  return entries;
}

test('desktop shell uses Juice Journal branding in the title bar', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /<title>\s*Juice Journal\s*<\/title>/i);
  assert.match(html, /<h1>\s*Juice Journal\s*<\/h1>/i);
  assert.doesNotMatch(html, /PoE\s*<span>\s*Farm\s*<\/span>/i);
  assert.doesNotMatch(html, />\s*POE FARM\s*</i);
});

test('desktop shell reuses the packaged app icon in visible brand surfaces', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.ok(fs.existsSync(desktopIconPngPath), 'Expected desktop icon.png to exist');
  assert.match(html, /<img[^>]+src="assets\/icon\.png"[^>]+class="brand-logo-image"/i);
});

test('desktop package and main process point to the branded window metadata', () => {
  const mainProcess = fs.readFileSync(mainProcessPath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(packageJson.build.productName, 'Juice Journal');
  assert.equal(packageJson.build.win.icon, 'src/assets/icon.ico');
  assert.equal(packageJson.build.win.signAndEditExecutable, false);
  assert.equal(packageJson.build.afterPack, 'scripts/after-pack.js');

  assert.match(mainProcess, /const APP_NAME = 'Juice Journal';/);
  assert.match(mainProcess, /app\.setAppUserModelId\(APP_ID\);/);
  assert.match(mainProcess, /app\.setName\(APP_NAME\);/);
  assert.match(mainProcess, /icon:\s*createWindowIcon\(\),/);
  assert.match(mainProcess, /title:\s*APP_NAME/);
});

test('desktop main process loads the taskbar window icon as a native image', () => {
  const mainProcess = fs.readFileSync(mainProcessPath, 'utf8');

  assert.match(mainProcess, /function\s+createWindowIcon\(\)/);
  assert.match(mainProcess, /nativeImage\.createFromPath\(APP_ICON_PATH\)/);
  assert.match(mainProcess, /icon:\s*createWindowIcon\(\),/);
});

test('development mode does not open DevTools unless explicitly requested', () => {
  const mainProcess = fs.readFileSync(mainProcessPath, 'utf8');

  assert.match(mainProcess, /JUICE_JOURNAL_OPEN_DEVTOOLS/);
  assert.match(mainProcess, /process\.argv\.includes\(['"]--devtools['"]\)/);
  assert.doesNotMatch(
    mainProcess,
    /if\s*\(\s*isDev\s*\)\s*\{\s*mainWindow\.webContents\.openDevTools\(\)/s
  );
});

test('desktop build defines an afterPack hook that patches the packaged exe icon', () => {
  const script = fs.readFileSync(afterPackScriptPath, 'utf8');

  assert.match(script, /rcedit/);
  assert.match(script, /appOutDir/);
  assert.match(script, /icon\.ico/);
  assert.match(script, /productFilename/);
  assert.match(script, /\.exe/);
});

test('desktop window opens large enough to avoid default dashboard scrolling', () => {
  const mainProcess = fs.readFileSync(mainProcessPath, 'utf8');

  assert.match(mainProcess, /width:\s*1440,/);
  assert.match(mainProcess, /height:\s*960,/);
  assert.match(mainProcess, /minWidth:\s*1180,/);
  assert.match(mainProcess, /minHeight:\s*820,/);
});

test('windows icon includes taskbar-friendly sizes', () => {
  const iconBuffer = fs.readFileSync(windowsIconPath);
  const entries = parseIcoEntries(iconBuffer);
  const sizes = new Set(entries.map((entry) => entry.width));

  for (const requiredSize of [16, 32, 48, 64, 128, 256]) {
    assert.ok(
      sizes.has(requiredSize),
      `Expected icon.ico to include a ${requiredSize}x${requiredSize} entry`
    );
  }
});
