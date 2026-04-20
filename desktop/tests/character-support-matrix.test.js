const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PLAYABLE_CHARACTER_SUPPORT,
  EXPECTED_PLAYABLE_KEYS,
  findCharacterSupportEntry,
} = require('../src/modules/characterSupportMatrix');

const desktopDir = path.resolve(__dirname, '..');

test('character support matrix includes every playable canonical entry', () => {
  const actualKeys = PLAYABLE_CHARACTER_SUPPORT.map((entry) => entry.id).sort();

  assert.deepEqual(actualKeys, [...EXPECTED_PLAYABLE_KEYS].sort());
});

test('every canonical entry declares a portrait and banner file that exists', () => {
  PLAYABLE_CHARACTER_SUPPORT.forEach((entry) => {
    assert.ok(entry.portraitPath, `${entry.id} missing portraitPath`);
    assert.ok(entry.bannerPath, `${entry.id} missing bannerPath`);

    const portraitPath = path.join(desktopDir, 'src', entry.portraitPath);
    const bannerPath = path.join(desktopDir, 'src', entry.bannerPath);

    assert.equal(fs.existsSync(portraitPath), true, `Missing portrait asset for ${entry.id}: ${entry.portraitPath}`);
    assert.equal(fs.existsSync(bannerPath), true, `Missing banner asset for ${entry.id}: ${entry.bannerPath}`);
  });
});

test('matrix resolves canonical base-class and ascendancy lookups', () => {
  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe1', className: 'Templar' })?.id,
    'poe1:templar'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Monk', ascendancy: 'Invoker' })?.id,
    'poe2:monk:invoker'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Druid', ascendancy: 'Oracle' })?.id,
    'poe2:druid:oracle'
  );
});

test('matrix resolves observed runtime aliases to canonical entries', () => {
  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Monk2' })?.id,
    'poe2:monk:invoker'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Druid2' })?.id,
    'poe2:druid:shaman'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Mercenary3' })?.id,
    'poe2:mercenary:gemling-legionnaire'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Huntress1' })?.id,
    'poe2:huntress:amazon'
  );
});
