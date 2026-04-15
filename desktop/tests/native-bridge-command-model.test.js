const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCharacterPoolCommand
} = require('../src/modules/nativeBridgeCommandModel');

test('buildCharacterPoolCommand serializes a full snapshot replace command', () => {
  const command = buildCharacterPoolCommand([
    {
      poeVersion: 'poe2',
      characterId: 'poe2-kellee',
      characterName: 'KELLEE',
      className: 'Monk2',
      ascendancy: 'Invoker',
      level: 92,
      league: 'Standard'
    }
  ]);

  assert.equal(command.type, 'set-character-pool');
  assert.equal(typeof command.detectedAt, 'string');
  assert.equal(command.characters.length, 1);
  assert.deepEqual(command.characters[0], {
    poeVersion: 'poe2',
    characterId: 'poe2-kellee',
    characterName: 'KELLEE',
    className: 'Monk2',
    ascendancy: 'Invoker',
    level: 92,
    league: 'Standard'
  });
});

test('buildCharacterPoolCommand fails closed for non-array input', () => {
  const command = buildCharacterPoolCommand(null);

  assert.equal(command.type, 'set-character-pool');
  assert.deepEqual(command.characters, []);
});

test('buildCharacterPoolCommand drops unsupported poe versions', () => {
  const command = buildCharacterPoolCommand([
    {
      poeVersion: 'poe3',
      characterId: 'bad-id',
      characterName: 'BadChar'
    },
    {
      poeVersion: 'poe1',
      characterId: 'poe1-ranger',
      characterName: 'Ranger'
    }
  ]);

  assert.deepEqual(command.characters, [
    {
      poeVersion: 'poe1',
      characterId: 'poe1-ranger',
      characterName: 'Ranger',
      className: null,
      ascendancy: null,
      level: null,
      league: null
    }
  ]);
});

test('buildCharacterPoolCommand serializes a supported account hint alongside the pool', () => {
  const command = buildCharacterPoolCommand(
    [
      {
        poeVersion: 'poe2',
        characterId: 'poe2-kellee',
        characterName: 'KELLEE'
      }
    ],
    {
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      className: 'Monk2',
      level: 92
    }
  );

  assert.deepEqual(command.accountHint, {
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    level: 92
  });
});
