const test = require('node:test');
const assert = require('node:assert/strict');

const poeApiService = require('../services/poeApiService');

test('mock character sync returns PoE1 and PoE2 characters with selected ids by game', async () => {
  const payload = await poeApiService.getAccountCharacters({
    id: 'user-1',
    username: 'Esquetta4179',
    poeMock: true
  });

  assert.equal(payload.charactersByGame.poe1.length > 0, true);
  assert.equal(payload.charactersByGame.poe2.length > 0, true);
  assert.equal(payload.selectedCharacterByGame.poe1, payload.charactersByGame.poe1[0].id);
  assert.equal(payload.selectedCharacterByGame.poe2, payload.charactersByGame.poe2[0].id);
  assert.equal(payload.charactersByGame.poe2[0].class, 'Shaman');
});

test('character normalizer tags realm characters with app poeVersion keys', () => {
  const normalized = poeApiService.normalizeCharacters([
    { id: 'poe1-id', name: 'One', level: 91, class: 'Ranger', league: 'Mercenaries' }
  ], 'poe1');

  assert.deepEqual(normalized, [{
    id: 'poe1-id',
    name: 'One',
    level: 91,
    class: 'Ranger',
    ascendancy: null,
    league: 'Mercenaries',
    poeVersion: 'poe1'
  }]);
});
