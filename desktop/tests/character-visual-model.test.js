const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { deriveCharacterVisual } = require('../src/modules/characterVisualModel');
const desktopDir = path.resolve(__dirname, '..');

test('character visual model maps PoE2 Shaman to a dedicated portrait treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'KocaGyVeMasha',
    className: 'Shaman',
    ascendancy: 'Ritualist'
  });

  assert.equal(visual.portraitKey, 'shaman');
  assert.equal(visual.classLabel, 'Shaman');
  assert.equal(visual.badgeText, 'S');
  assert.equal(visual.tone, 'ember');
  assert.equal(visual.bannerKey, 'shaman');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/druid-shaman.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/shaman.jpg');
});

test('character visual model maps PoE2 Druid2 to the Shaman portrait treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'OakCaller',
    className: 'Druid2'
  });

  assert.equal(visual.portraitKey, 'shaman');
  assert.equal(visual.classLabel, 'Shaman');
  assert.equal(visual.badgeText, 'S');
  assert.equal(visual.tone, 'ember');
  assert.equal(visual.bannerKey, 'shaman');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/druid-shaman.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/shaman.jpg');
});

test('character visual model maps PoE2 Monk2 to Invoker while keeping the monk portrait family', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    className: 'Monk2'
  });

  assert.equal(visual.portraitKey, 'monk');
  assert.equal(visual.bannerKey, 'monk-invoker');
  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.badgeText, 'M');
  assert.equal(visual.tone, 'azure');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/monk.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/monk-invoker.jpg');
});

test('character visual model maps PoE1 Templar to portrait and banner artwork', () => {
  const visual = deriveCharacterVisual({
    name: 'JaylenBaliston',
    className: 'Templar'
  });

  assert.equal(visual.portraitKey, 'templar');
  assert.equal(visual.bannerKey, 'templar');
  assert.equal(visual.classLabel, 'Templar');
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

  assert.equal(visual.portraitKey, 'mercenary');
  assert.equal(visual.classLabel, 'Gemling Legionnaire');
  assert.equal(visual.badgeText, 'M');
  assert.equal(visual.tone, 'brass');
  assert.equal(visual.bannerKey, 'mercenary');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/mercenary.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/mercenary.jpg');
});

test('character visual model maps PoE2 Huntress1 to Amazon', () => {
  const visual = deriveCharacterVisual({
    name: 'AbuserSpear',
    className: 'Huntress1'
  });

  assert.equal(visual.portraitKey, 'huntress');
  assert.equal(visual.classLabel, 'Amazon');
  assert.equal(visual.badgeText, 'H');
  assert.equal(visual.tone, 'jade');
  assert.equal(visual.bannerKey, 'huntress');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/huntress.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/huntress.jpg');
});

test('character visual model falls back to initials for unknown classes', () => {
  const visual = deriveCharacterVisual({
    name: 'Mystery Exile',
    className: 'UnreleasedClass'
  });

  assert.equal(visual.portraitKey, 'unknown');
  assert.equal(visual.classLabel, 'UnreleasedClass');
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
