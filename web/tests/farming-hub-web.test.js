const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webDir = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(webDir, relativePath), 'utf8');
}

test('web api client exposes Farming Hub public run endpoints', () => {
  const source = read('src/lib/api.js');

  assert.match(source, /export const farmingHubAPI = \{/);
  assert.match(source, /getRuns:\s*\(params\)\s*=>\s*apiClient\.get\('\/farming-hub\/runs'/);
  assert.match(source, /getRunById:\s*\(id\)\s*=>\s*apiClient\.get\(`\/farming-hub\/runs\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test('authenticated navbar links to the Farming Hub browser', () => {
  const source = read('src/components/Navbar.js');

  assert.match(source, /href:\s*'\/farming-hub'/);
  assert.match(source, /label:\s*t\('nav\.farmingHub'\)/);
});

test('Farming Hub browser page loads public runs with safe filters', () => {
  const source = read('src/app/farming-hub/page.js');

  assert.match(source, /farmingHubAPI\.getRuns\(params\)/);
  assert.match(source, /poeVersion:\s*filters\.poeVersion/);
  assert.match(source, /league:\s*filters\.league/);
  assert.match(source, /'farmType', 'minProfitChaos', 'maxProfitChaos'/);
  assert.match(source, /<FarmRunFilters/);
  assert.match(source, /<FarmRunTable/);
});

test('Farming Hub detail page renders public run maps and loot details', () => {
  const source = read('src/app/farming-hub/[id]/page.js');

  assert.match(source, /farmingHubAPI\.getRunById\(params\.id\)/);
  assert.match(source, /run\.maps/);
  assert.match(source, /run\.topLoot/);
  assert.match(source, /run\.setupDescription/);
  assert.match(source, /run\.investmentKnown/);
});

test('Farming Hub locale keys are defined in the English dictionary', () => {
  const source = read('src/lib/locales/en.js');

  [
    'nav.farmingHub',
    'farmingHub.title',
    'farmingHub.body',
    'farmingHub.table.run',
    'farmingHub.detailNotFound',
    'farmingHub.topLoot'
  ].forEach((key) => {
    assert.match(source, new RegExp(`'${key}'`));
  });
});
