const test = require('node:test');
const assert = require('node:assert/strict');

test('native character hint model keeps direct character identity fields when present', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  const result = deriveNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard'
  });

  assert.deepEqual(result, {
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard',
    confidence: 'high'
  });
});

test('native character hint model normalizes fallback fields into a medium-confidence hint', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  const result = deriveNativeCharacterHint({
    gameVersion: 'PoE1',
    class: 'Templar',
    league: 'Mercenaries'
  });

  assert.deepEqual(result, {
    source: 'native-game-info',
    poeVersion: 'poe1',
    characterName: null,
    className: 'Templar',
    league: 'Mercenaries',
    confidence: 'medium'
  });
});

test('native character hint model rejects empty payloads', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  assert.equal(deriveNativeCharacterHint({}), null);
  assert.equal(deriveNativeCharacterHint(null), null);
});

test('native character hint model rejects malformed non-string identity fields', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  assert.equal(deriveNativeCharacterHint({
    poeVersion: 'poe2',
    characterName: { raw: 'KELLEE' }
  }), null);

  assert.equal(deriveNativeCharacterHint({
    gameVersion: 'poe2',
    name: ['KELLEE']
  }), null);
});
