const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildPublishedFarmRunAttributes,
  serializePublishedFarmRun
} = require('../services/farmingHubService');

test('published farm run attributes keep only the safe public payload shape', () => {
  const attributes = buildPublishedFarmRunAttributes({
    poeVersion: 'poe1',
    visibility: 'public',
    league: 'Mirage',
    farmType: 'Breach',
    runCount: 2,
    durationSeconds: 600,
    setupDescription: '<script>alert(1)</script> Winged scarab setup',
    investmentKnown: true,
    calculationStatus: 'calculated',
    profitChaos: '120.5',
    priceContext: {
      chaosDivineRate: 120,
      mirrorChaosRate: 300000,
      syncedAt: '2026-05-24T09:55:00.000Z'
    },
    maps: [
      {
        localRunId: 'local-1',
        mapName: 'Dunes Map',
        durationSeconds: 300,
        profitChaos: 120.5,
        calculationStatus: 'calculated'
      }
    ],
    breakdown: {
      currency: { gainedChaos: 150, lostChaos: 29.5, netChaos: 120.5 }
    },
    topLoot: [
      { name: 'Divine Orb', quantity: 1, totalChaos: 120.5 }
    ],
    character: {
      className: 'Witch',
      ascendancy: 'Necromancer'
    },
    publisherDisplayName: ' Esquetta ',
    accountName: 'PrivateAccount#1234',
    poeAccessToken: 'secret-access',
    beforeSnapshot: { items: [{ name: 'secret-before' }] }
  }, 'user-1');

  assert.equal(attributes.userId, 'user-1');
  assert.equal(attributes.visibility, 'public');
  assert.equal(attributes.profitChaos, 120.5);
  assert.equal(attributes.setupDescription, 'alert(1) Winged scarab setup');
  assert.equal(attributes.publisherDisplayName, 'Esquetta');
  assert.ok(attributes.publishedAt instanceof Date);
  assert.deepEqual(attributes.characterContext, {
    className: 'Witch',
    ascendancy: 'Necromancer'
  });

  const serialized = JSON.stringify(attributes);
  assert.doesNotMatch(serialized, /PrivateAccount/);
  assert.doesNotMatch(serialized, /secret-access/);
  assert.doesNotMatch(serialized, /secret-before/);
});

test('private farm runs stay unpublished until visibility changes', () => {
  const attributes = buildPublishedFarmRunAttributes({
    poeVersion: 'poe2',
    visibility: 'private',
    runCount: 1,
    calculationStatus: 'notCalculated',
    maps: [
      { mapName: 'Channel', calculationStatus: 'notCalculated' }
    ]
  }, 'user-1');

  assert.equal(attributes.visibility, 'private');
  assert.equal(attributes.publishedAt, null);
  assert.equal(attributes.profitChaos, null);
  assert.equal(attributes.maps[0].profitChaos, null);
});

test('published farm run serializer hides heavy details from list responses', () => {
  const run = {
    id: 'run-1',
    visibility: 'public',
    poeVersion: 'poe1',
    league: 'Mirage',
    farmType: 'Breach',
    runCount: 1,
    startedAt: null,
    endedAt: null,
    durationSeconds: 300,
    setupDescription: 'Scarabs unknown',
    investmentKnown: false,
    calculationStatus: 'calculated',
    profitChaos: '39.9',
    priceContext: {},
    characterContext: {},
    publisherDisplayName: 'Esquetta',
    publishedAt: null,
    createdAt: null,
    user: { id: 'user-1', username: 'tester' },
    maps: [{ mapName: 'Dunes Map' }],
    breakdown: { currency: { netChaos: 39.9 } },
    topLoot: [{ name: 'Chaos Orb', totalChaos: 39.9 }]
  };

  const listShape = serializePublishedFarmRun(run);
  assert.equal(listShape.profitChaos, 39.9);
  assert.equal(listShape.maps, undefined);
  assert.equal(listShape.breakdown, undefined);
  assert.equal(listShape.topLoot, undefined);

  const detailShape = serializePublishedFarmRun(run, { includeDetails: true });
  assert.deepEqual(detailShape.maps, [{ mapName: 'Dunes Map' }]);
});

test('farming hub API is mounted and keeps publish operations authenticated', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'farmingHub.js'), 'utf8');
  const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_create_published_farm_runs.sql'), 'utf8');

  assert.match(serverSource, /app\.use\('\/api\/farming-hub',\s*farmingHubRoutes\)/);
  assert.match(routeSource, /router\.post\('\/runs',\s*authenticate,/);
  assert.match(routeSource, /router\.get\('\/runs',/);
  assert.match(routeSource, /router\.get\('\/runs\/:id',\s*optionalAuth,/);
  assert.match(routeSource, /router\.patch\('\/runs\/:id\/visibility',\s*authenticate,/);
  assert.match(routeSource, /router\.delete\('\/runs\/:id',\s*authenticate,/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS published_farm_runs/);
});

test('public farming hub list stays public-only and supports profit filters', () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'farmingHubService.js'), 'utf8');

  assert.match(serviceSource, /const where = \{ visibility: 'public' \}/);
  assert.match(serviceSource, /hasMinProfitFilter/);
  assert.match(serviceSource, /hasMaxProfitFilter/);
  assert.match(serviceSource, /Op\.gte/);
  assert.match(serviceSource, /Op\.lte/);
});
