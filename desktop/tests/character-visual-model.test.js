const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { deriveCharacterVisual } = require('../src/modules/characterVisualModel');
const desktopDir = path.resolve(__dirname, '..');

test('character visual model maps PoE2 Shaman to a dedicated portrait treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'KocaGyVeMasha',
    className: 'Druid',
    ascendancy: 'Shaman'
  });

  assert.equal(visual.portraitKey, 'shaman');
  assert.equal(visual.classLabel, 'Shaman');
  assert.equal(visual.baseClassLabel, 'Druid');
  assert.equal(visual.badgeText, 'S');
  assert.equal(visual.tone, 'ember');
  assert.equal(visual.bannerKey, 'shaman');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/shaman.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/shaman.jpg');
});

test('character visual model maps PoE1 Necromancer to a unique witch ascendancy treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'HexArchivist',
    poeVersion: 'poe1',
    className: 'Witch',
    ascendancy: 'Necromancer'
  });

  assert.equal(visual.classLabel, 'Necromancer');
  assert.equal(visual.baseClassLabel, 'Witch');
  assert.equal(visual.portraitKey, 'necromancer');
  assert.equal(visual.bannerKey, 'necromancer');
  assert.equal(visual.badgeText, 'N');
  assert.equal(visual.tone, 'violet');
  assert.equal(visual.portraitPath, 'assets/characters/poe1/necromancer.jpg');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe1/necromancer.jpg');
});

test('character visual model maps PoE2 Druid2 to the Shaman portrait treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'OakCaller',
    className: 'Druid2'
  });

  assert.equal(visual.portraitKey, 'shaman');
  assert.equal(visual.classLabel, 'Shaman');
  assert.equal(visual.baseClassLabel, 'Druid');
  assert.equal(visual.badgeText, 'S');
  assert.equal(visual.tone, 'ember');
  assert.equal(visual.bannerKey, 'shaman');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/shaman.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/shaman.jpg');
});

test('character visual model maps PoE2 Monk2 to Invoker with unique ascendancy artwork', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    className: 'Monk2'
  });

  assert.equal(visual.portraitKey, 'invoker');
  assert.equal(visual.bannerKey, 'invoker');
  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.baseClassLabel, 'Monk');
  assert.equal(visual.badgeText, 'I');
  assert.equal(visual.tone, 'azure');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/invoker.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/invoker.jpg');
});

test('character visual model maps PoE2 Invoker to a unique monk ascendancy portrait and banner', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    poeVersion: 'poe2',
    className: 'Monk',
    ascendancy: 'Invoker'
  });

  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.baseClassLabel, 'Monk');
  assert.equal(visual.portraitKey, 'invoker');
  assert.equal(visual.bannerKey, 'invoker');
  assert.equal(visual.badgeText, 'I');
  assert.equal(visual.tone, 'azure');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/invoker.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/invoker.jpg');
});

test('character visual model maps PoE1 Templar to portrait and banner artwork', () => {
  const visual = deriveCharacterVisual({
    name: 'JaylenBaliston',
    className: 'Templar'
  });

  assert.equal(visual.portraitKey, 'templar');
  assert.equal(visual.bannerKey, 'templar');
  assert.equal(visual.classLabel, 'Templar');
  assert.equal(visual.baseClassLabel, 'Templar');
  assert.equal(visual.badgeText, 'T');
  assert.equal(visual.tone, 'gold');
  assert.equal(visual.portraitPath, 'assets/characters/poe1/templar.jpg');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe1/templar.jpg');
});

test('character visual model maps PoE2 Mercenary3 to Gemling Legionnaire', () => {
  const visual = deriveCharacterVisual({
    name: 'Esquetta',
    className: 'Mercenary3'
  });

  assert.equal(visual.classLabel, 'Gemling Legionnaire');
  assert.equal(visual.baseClassLabel, 'Mercenary');
  assert.equal(visual.badgeText, 'GL');
  assert.equal(visual.tone, 'brass');
  assert.equal(visual.portraitKey, 'gemling-legionnaire');
  assert.equal(visual.bannerKey, 'gemling-legionnaire');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/gemling-legionnaire.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/gemling-legionnaire.jpg');
});

test('character visual model maps PoE2 Huntress1 to Amazon', () => {
  const visual = deriveCharacterVisual({
    name: 'AbuserSpear',
    className: 'Huntress1'
  });

  assert.equal(visual.portraitKey, 'amazon');
  assert.equal(visual.classLabel, 'Amazon');
  assert.equal(visual.baseClassLabel, 'Huntress');
  assert.equal(visual.badgeText, 'A');
  assert.equal(visual.tone, 'jade');
  assert.equal(visual.bannerKey, 'amazon');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/amazon.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/amazon.jpg');
});

test('character visual model prefers significant-word initials for stop-word ascendancies', () => {
  const acolyte = deriveCharacterVisual({
    name: 'Void Monk',
    poeVersion: 'poe2',
    className: 'Monk',
    ascendancy: 'Acolyte of Chayula'
  });

  const smith = deriveCharacterVisual({
    name: 'Forge King',
    poeVersion: 'poe2',
    className: 'Warrior',
    ascendancy: 'Smith of Kitava'
  });

  assert.equal(acolyte.badgeText, 'AC');
  assert.equal(acolyte.portraitKey, 'acolyte-of-chayula');
  assert.equal(acolyte.bannerKey, 'acolyte-of-chayula');
  assert.equal(acolyte.portraitPath, 'assets/characters/poe2/acolyte-of-chayula.png');
  assert.equal(acolyte.bannerPath, 'assets/characters/banners/poe2/acolyte-of-chayula.jpg');

  assert.equal(smith.badgeText, 'SK');
  assert.equal(smith.portraitKey, 'smith-of-kitava');
  assert.equal(smith.bannerKey, 'smith-of-kitava');
  assert.equal(smith.portraitPath, 'assets/characters/poe2/smith-of-kitava.png');
  assert.equal(smith.bannerPath, 'assets/characters/banners/poe2/smith-of-kitava.jpg');
});

test('character visual model falls back to initials for unknown classes', () => {
  const visual = deriveCharacterVisual({
    name: 'Mystery Exile',
    className: 'UnreleasedClass'
  });

  assert.equal(visual.portraitKey, 'unknown');
  assert.equal(visual.classLabel, 'UnreleasedClass');
  assert.equal(visual.baseClassLabel, 'UnreleasedClass');
  assert.equal(visual.badgeText, 'ME');
  assert.equal(visual.tone, 'neutral');
  assert.equal(visual.bannerKey, 'unknown');
  assert.equal(visual.portraitPath, null);
  assert.equal(visual.bannerPath, null);
});

test('character visual model banner assets resolve to real files for mapped classes', () => {
  const visuals = [
    deriveCharacterVisual({ name: 'KocaGyVeMasha', className: 'Shaman' }),
    deriveCharacterVisual({ name: 'KELLEE', className: 'Monk2' }),
    deriveCharacterVisual({ name: 'JaylenBaliston', className: 'Templar' }),
    deriveCharacterVisual({ name: 'Esquetta', className: 'Mercenary3' }),
    deriveCharacterVisual({ name: 'AbuserSpear', className: 'Huntress1' })
  ];

  visuals.forEach((visual) => {
    const bannerPath = path.join(desktopDir, 'src', visual.bannerPath);
    assert.equal(fs.existsSync(bannerPath), true, `Expected banner asset to exist: ${visual.bannerPath}`);
  });
});
