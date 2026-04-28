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

test('character normalizer preserves exact PoE2 account class names for ascendancy artwork', () => {
  const normalized = poeApiService.normalizeCharacters([
    { id: 'amazon-id', name: 'AbuserSpear', level: 92, class: 'Amazon', league: 'Standard' },
    { id: 'invoker-id', name: 'BellMonk', level: 91, class: 'Invoker', league: 'Standard' }
  ], 'poe2');

  assert.equal(normalized[0].class, 'Amazon');
  assert.equal(normalized[1].class, 'Invoker');
  assert.equal(normalized[0].poeVersion, 'poe2');
  assert.equal(normalized[1].poeVersion, 'poe2');
});

test('character payload selects the highest-level character per game as default', () => {
  const payload = poeApiService.buildCharacterPayload({
    poe2: [
      { id: 'standard-huntress', name: 'AbuserSpear', level: 92, class: 'Huntress1', league: 'Standard' },
      { id: 'league-druid', name: 'KocaAyVeMasha', level: 96, class: 'Druid2', league: 'Fate of the Vaal' }
    ]
  });

  assert.equal(payload.selectedCharacterByGame.poe2, 'league-druid');
});

test('cached character payload dedupes concurrent loads and reuses warm values until invalidated', async () => {
  let loadCalls = 0;
  const user = {
    id: 'user-1',
    poeSub: 'poe-sub-1'
  };

  const loader = async () => {
    loadCalls += 1;
    return {
      characters: [{ id: 'a', name: 'One' }],
      charactersByGame: { poe1: [], poe2: [] },
      selectedCharacterByGame: {},
      syncedAt: '2026-04-16T00:00:00.000Z'
    };
  };

  const [first, second] = await Promise.all([
    poeApiService.getCachedAccountCharacters(user, { loader, ttlMs: 60_000 }),
    poeApiService.getCachedAccountCharacters(user, { loader, ttlMs: 60_000 })
  ]);

  assert.equal(loadCalls, 1);
  assert.deepEqual(first, second);

  const third = await poeApiService.getCachedAccountCharacters(user, { loader, ttlMs: 60_000 });
  assert.equal(loadCalls, 1);
  assert.deepEqual(third, first);

  poeApiService.invalidateAccountCharactersCache(user);

  await poeApiService.getCachedAccountCharacters(user, { loader, ttlMs: 60_000 });
  assert.equal(loadCalls, 2);
});
