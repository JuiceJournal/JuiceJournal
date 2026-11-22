const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PLAYABLE_CHARACTER_SUPPORT,
  EXPECTED_PLAYABLE_KEYS,
  findCharacterSupportEntry,
  readableClassName,
} = require('../src/modules/characterSupportMatrix');

const desktopDir = path.resolve(__dirname, '..');

function readJpegDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 2;

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error(`Expected a JPEG image: ${filePath}`);
  }

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xc3;

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  throw new Error(`Unable to read JPEG dimensions: ${filePath}`);
}

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

test('every PoE1 portrait asset is square enough for the circular dashboard slot', () => {
  const invalidPortraits = PLAYABLE_CHARACTER_SUPPORT
    .filter((entry) => entry.poeVersion === 'poe1')
    .map((entry) => {
      const portraitPath = path.join(desktopDir, 'src', entry.portraitPath);
      const dimensions = readJpegDimensions(portraitPath);
      const ratio = dimensions.width / dimensions.height;

      return {
        id: entry.id,
        path: entry.portraitPath,
        ...dimensions,
        ratio,
      };
    })
    .filter((entry) => (
      entry.width < 512
      || entry.height < 512
      || entry.ratio < 0.95
      || entry.ratio > 1.12
    ));

  assert.deepEqual(
    invalidPortraits,
    [],
    `PoE1 portraits must be high-resolution and near-square for the circular UI crop: ${JSON.stringify(invalidPortraits)}`
  );
});

test('every playable ascendancy uses portrait and banner files different from its base class', () => {
  const baseEntries = new Map(
    PLAYABLE_CHARACTER_SUPPORT
      .filter((entry) => !entry.ascendancy)
      .map((entry) => [`${entry.poeVersion}:${entry.baseClass}`, entry])
  );

  const sharedPortraits = [];
  const sharedBanners = [];

  PLAYABLE_CHARACTER_SUPPORT
    .filter((entry) => entry.ascendancy)
    .forEach((entry) => {
      const baseEntry = baseEntries.get(`${entry.poeVersion}:${entry.baseClass}`);
      assert.ok(baseEntry, `Missing base entry for ${entry.id}`);

      if (entry.portraitPath === baseEntry.portraitPath) {
        sharedPortraits.push(entry.id);
      }

      if (entry.bannerPath === baseEntry.bannerPath) {
        sharedBanners.push(entry.id);
      }
    });

  assert.deepEqual(sharedPortraits, []);
  assert.deepEqual(sharedBanners, []);
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

test('a Path of Exile 2 class id reads as its ascendancy, by the game\'s own numbering', () => {
  const read = (className) => readableClassName({ poeVersion: 'poe2', className });

  assert.equal(read('Ranger1'), 'Deadeye');
  assert.equal(read('Ranger3'), 'Pathfinder');
  assert.equal(read('Warrior1'), 'Titan');
  assert.equal(read('Warrior3'), 'Smith of Kitava');
  assert.equal(read('Witch1'), 'Infernalist');
  assert.equal(read('Witch3'), 'Lich');
  assert.equal(read('Mercenary1'), 'Tactician');
  assert.equal(read('Mercenary2'), 'Witchhunter');
  assert.equal(read('Monk3'), 'Acolyte of Chayula');
  assert.equal(read('Sorceress3'), 'Disciple of Varashta');

  // The artwork follows the same numbering.
  assert.equal(findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Witch1' })?.id, 'poe2:witch:infernalist');
  assert.equal(findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Warrior1' })?.id, 'poe2:warrior:titan');
  assert.equal(findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Monk1' }), null);
});

test('an unknown class id keeps its class and drops the number; other names stay as they are', () => {
  assert.equal(readableClassName({ poeVersion: 'poe2', className: 'Ranger2' }), 'Ranger');
  assert.equal(readableClassName({ poeVersion: 'poe2', className: 'Druid7' }), 'Druid');
  assert.equal(readableClassName({ poeVersion: 'poe2', className: 'Deadeye' }), 'Deadeye');
  assert.equal(readableClassName({ poeVersion: 'poe2', className: 'Ranger' }), 'Ranger');
  assert.equal(readableClassName({ poeVersion: 'poe2', className: 'Newclass1' }), 'Newclass1');
  assert.equal(readableClassName({ poeVersion: 'poe1', className: 'Ranger1' }), 'Ranger1');
  assert.equal(readableClassName({ poeVersion: 'poe2', className: '' }), null);
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
