const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveCharacterVisual } = require('../src/modules/characterVisualModel');

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
  assert.equal(visual.portraitPath, 'assets/characters/poe2/druid-shaman.png');
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
  assert.equal(visual.portraitPath, 'assets/characters/poe2/druid-shaman.png');
});

test('character visual model maps PoE2 Monk2 to Invoker while keeping the monk portrait family', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    className: 'Monk2'
  });

  assert.equal(visual.portraitKey, 'monk');
  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.badgeText, 'M');
  assert.equal(visual.tone, 'azure');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/monk.png');
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
  assert.equal(visual.portraitPath, 'assets/characters/poe2/mercenary.png');
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
  assert.equal(visual.portraitPath, 'assets/characters/poe2/huntress.png');
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
  assert.equal(visual.portraitPath, null);
});
