const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

function loadFunction(name, context) {
  const start = mainJs.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `main.js should define ${name}()`);
  const body = mainJs.slice(start, mainJs.indexOf('\n}\n', start) + 2);
  vm.runInContext(`${body}\nthis.${name} = ${name};`, vm.createContext(context));
  return context[name];
}

test('a second launch exits before main reads or writes any settings', () => {
  const lock = mainJs.indexOf('if (!app.requestSingleInstanceLock()) {\n  process.exit(0);\n}');
  assert.notEqual(lock, -1, 'the lock is taken at the top level and a second launch exits at once');
  // The app's name sets the default userData folder, which the lock belongs to.
  assert.ok(mainJs.indexOf('\napplyWindowsAppIdentity();\n') < lock);
  // Nothing that touches the profile runs before it.
  for (const marker of ['const store = new Store(', '\ninstallErrorCapture();', '\nmigrateLanguageSetting();', 'app.whenReady()']) {
    assert.ok(mainJs.indexOf(marker) > lock, `${marker.trim()} comes after the lock`);
  }
  assert.match(mainJs, /\napp\.on\('second-instance', handleSecondInstance\);\n/);
});

test('another launch brings the running window back, but not before the app is ready or while it quits', () => {
  const shown = [];
  const app = { ready: false, isQuiting: false, isReady() { return this.ready; } };
  const handleSecondInstance = loadFunction('handleSecondInstance', { app, showMainWindow: () => shown.push('shown') });

  handleSecondInstance();
  assert.deepEqual(shown, [], 'the window opens by itself once the app is ready');

  app.ready = true;
  handleSecondInstance();
  assert.deepEqual(shown, ['shown']);

  app.isQuiting = true;
  handleSecondInstance();
  assert.deepEqual(shown, ['shown'], 'a quitting app does not come back');
});
