const fs = require('node:fs');
const path = require('node:path');

const PATCH_TARGETS = [
  path.join('node_modules', 'tr46', 'index.js'),
  path.join('node_modules', 'whatwg-url', 'lib', 'url-state-machine.js')
];

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return 'missing';
  }

  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('require("punycode/")') || source.includes("require('punycode/')")) {
    return 'alreadyPatched';
  }

  const patched = source
    .replace(/require\("punycode"\)/g, 'require("punycode/")')
    .replace(/require\('punycode'\)/g, "require('punycode/')");

  if (patched === source) {
    return 'alreadyPatched';
  }

  fs.writeFileSync(filePath, patched);
  return 'patched';
}

function patchDeprecatedDependencies(rootDir = path.resolve(__dirname, '..')) {
  const result = {
    checked: PATCH_TARGETS.length,
    patched: 0,
    alreadyPatched: 0,
    missing: 0
  };

  for (const relativeTarget of PATCH_TARGETS) {
    const status = patchFile(path.join(rootDir, relativeTarget));
    result[status] += 1;
  }

  return result;
}

if (require.main === module) {
  const result = patchDeprecatedDependencies();
  if (result.patched > 0) {
    console.log(`Patched ${result.patched} deprecated dependency import(s).`);
  }
}

module.exports = {
  patchDeprecatedDependencies
};
