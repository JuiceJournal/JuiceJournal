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
});

test('character visual model maps PoE2 Druid to a dedicated portrait treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'OakCaller',
    className: 'Druid'
  });

  assert.equal(visual.portraitKey, 'druid');
  assert.equal(visual.classLabel, 'Druid');
  assert.equal(visual.badgeText, 'D');
  assert.equal(visual.tone, 'verdant');
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
});
