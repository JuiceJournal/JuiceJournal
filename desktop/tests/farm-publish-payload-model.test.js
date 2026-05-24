const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFarmPublishPayload,
  sanitizePlainText
} = require('../src/modules/farmPublishPayloadModel');

test('farm publish payload aggregates local ledger runs into a safe public shape', () => {
  const payload = buildFarmPublishPayload([
    {
      localRunId: 'run-1',
      poeVersion: 'poe1',
      league: 'Mirage',
      farmType: 'Breach',
      mapName: 'Dunes Map',
      startedAt: '2026-05-24T10:00:00.000Z',
      endedAt: '2026-05-24T10:05:00.000Z',
      durationSeconds: 300,
      profitChaos: 120,
      calculationStatus: 'calculated',
      profitCurrencyRateSnapshot: {
        chaosDivineRate: 120,
        mirrorChaosRate: 300000,
        syncedAt: '2026-05-24T09:55:00.000Z'
      },
      lootCategoryBreakdown: {
        currency: { gainedChaos: 150, lostChaos: 30, netChaos: 120 }
      },
      topLootItems: [
        { name: 'Divine Orb', quantity: 1, totalChaos: 120 }
      ],
      characterClass: 'Witch',
      ascendancy: 'Necromancer'
    },
    {
      localRunId: 'run-2',
      poeVersion: 'poe1',
      league: 'Mirage',
      farmType: 'Breach',
      mapName: 'Mesa Map',
      startedAt: '2026-05-24T10:10:00.000Z',
      endedAt: '2026-05-24T10:14:00.000Z',
      durationSeconds: 240,
      profitChaos: 0,
      calculationStatus: 'zeroCalculated',
      lootCategoryBreakdown: {
        currency: { gainedChaos: 10, lostChaos: 10, netChaos: 0 }
      },
      topLootItems: [
        { name: 'Chaos Orb', quantity: 10, totalChaos: 10 }
      ]
    }
  ], {
    visibility: 'public',
    setupDescription: '<b>Breach scarabs</b> and atlas focus',
    publisherDisplayName: ' Esquetta ',
    investmentKnown: false
  });

  assert.equal(payload.poeVersion, 'poe1');
  assert.equal(payload.league, 'Mirage');
  assert.equal(payload.visibility, 'public');
  assert.equal(payload.farmType, 'Breach');
  assert.equal(payload.runCount, 2);
  assert.equal(payload.durationSeconds, 540);
  assert.equal(payload.profitChaos, 120);
  assert.equal(payload.calculationStatus, 'calculated');
  assert.equal(payload.setupDescription, 'Breach scarabs and atlas focus');
  assert.equal(payload.investmentKnown, false);
  assert.deepEqual(payload.priceContext, {
    chaosDivineRate: 120,
    mirrorChaosRate: 300000,
    syncedAt: '2026-05-24T09:55:00.000Z'
  });
  assert.deepEqual(payload.breakdown, {
    currency: { gainedChaos: 160, lostChaos: 40, netChaos: 120 }
  });
  assert.deepEqual(payload.topLoot, [
    { name: 'Divine Orb', quantity: 1, totalChaos: 120 },
    { name: 'Chaos Orb', quantity: 10, totalChaos: 10 }
  ]);
  assert.deepEqual(payload.character, {
    className: 'Witch',
    ascendancy: 'Necromancer'
  });
  assert.equal(payload.publisherDisplayName, 'Esquetta');
  assert.deepEqual(payload.maps, [
    {
      localRunId: 'run-1',
      mapName: 'Dunes Map',
      durationSeconds: 300,
      profitChaos: 120,
      calculationStatus: 'calculated'
    },
    {
      localRunId: 'run-2',
      mapName: 'Mesa Map',
      durationSeconds: 240,
      profitChaos: 0,
      calculationStatus: 'zeroCalculated'
    }
  ]);
});

test('farm publish payload excludes private local and stash data by construction', () => {
  const payload = buildFarmPublishPayload({
    localRunId: 'run-secret',
    poeVersion: 'poe1',
    league: 'Mirage',
    farmType: 'Breach',
    durationSeconds: 60,
    profitChaos: 10,
    calculationStatus: 'calculated',
    accountName: 'PrivateAccount#1234',
    oauthToken: 'secret-token',
    accessToken: 'secret-access',
    refreshToken: 'secret-refresh',
    stashTabId: 'secret-tab',
    beforeSnapshot: { items: [{ name: 'secret-before' }] },
    afterSnapshot: { items: [{ name: 'secret-after' }] },
    clientLogPath: 'C:/secret/Client.txt'
  }, {
    visibility: 'public'
  });

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /PrivateAccount/);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /secret-access/);
  assert.doesNotMatch(serialized, /secret-refresh/);
  assert.doesNotMatch(serialized, /secret-tab/);
  assert.doesNotMatch(serialized, /secret-before/);
  assert.doesNotMatch(serialized, /secret-after/);
  assert.doesNotMatch(serialized, /Client\.txt/);
});

test('farm publish payload preserves not-calculated maps without pretending profit is zero', () => {
  const payload = buildFarmPublishPayload({
    localRunId: 'run-missing',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmType: 'Abyss',
    durationSeconds: 90,
    profitChaos: null,
    calculationStatus: 'notCalculated'
  });

  assert.equal(payload.visibility, 'private');
  assert.equal(payload.calculationStatus, 'notCalculated');
  assert.equal(payload.profitChaos, null);
  assert.equal(payload.maps[0].profitChaos, null);
});

test('plain text sanitizer strips tags, compacts whitespace, and caps length', () => {
  const result = sanitizePlainText(`  <script>alert(1)</script>\nA   ${'x'.repeat(1300)}  `);

  assert.doesNotMatch(result, /<script>/);
  assert.doesNotMatch(result, /\s{2,}/);
  assert.equal(result.length, 1200);
});
