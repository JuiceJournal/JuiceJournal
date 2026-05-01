const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(desktopDir, 'package.json');
const patchScriptPath = path.join(desktopDir, 'scripts', 'patch-deprecated-deps.js');

test('desktop installs the punycode userland package for patched runtime dependencies', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(packageJson.dependencies.punycode, '2.3.1');
  assert.match(packageJson.scripts.postinstall, /node scripts\/patch-deprecated-deps\.js/);
});

test('dependency patcher rewrites tr46 away from deprecated Node built-in punycode', () => {
  const { patchDeprecatedDependencies } = require(patchScriptPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juice-journal-dep-patch-'));
  const tr46Dir = path.join(tempDir, 'node_modules', 'tr46');
  const tr46Index = path.join(tr46Dir, 'index.js');
  const whatwgUrlDir = path.join(tempDir, 'node_modules', 'whatwg-url', 'lib');
  const whatwgStateMachine = path.join(whatwgUrlDir, 'url-state-machine.js');
  fs.mkdirSync(tr46Dir, { recursive: true });
  fs.mkdirSync(whatwgUrlDir, { recursive: true });
  fs.writeFileSync(tr46Index, 'var punycode = require("punycode");\nmodule.exports = punycode;\n');
  fs.writeFileSync(whatwgStateMachine, 'const punycode = require("punycode");\nmodule.exports = punycode;\n');

  const result = patchDeprecatedDependencies(tempDir);

  assert.deepEqual(result, {
    checked: 2,
    patched: 2,
    alreadyPatched: 0,
    missing: 0
  });
  assert.match(fs.readFileSync(tr46Index, 'utf8'), /require\("punycode\/"\)/);
  assert.match(fs.readFileSync(whatwgStateMachine, 'utf8'), /require\("punycode\/"\)/);
});
