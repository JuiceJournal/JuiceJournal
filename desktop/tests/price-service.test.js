const test = require('node:test');
const assert = require('node:assert/strict');

const PriceService = require('../src/modules/priceService');
const registry = require('../src/modules/currencyRegistry');

test('poe1 price service uses the current poe.ninja stash economy endpoints', async () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  const calls = [];
  service.client.get = async (url, options = {}) => {
    calls.push({ url, params: options.params });
    return { data: { lines: [] } };
  };

  await service._fetchCurrencyOverview('Mirage', 'Currency');
  await service._fetchItemOverview('Mirage', 'Map');

  assert.deepEqual(calls, [
    {
      url: 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview',
      params: { league: 'Mirage', type: 'Currency' }
    },
    {
      url: 'https://poe.ninja/poe1/api/economy/stash/current/item/overview',
      params: { league: 'Mirage', type: 'Map' }
    }
  ]);
});

test('poe1 currency indexing derives stable divine values from the current Divine Orb rate', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    lines: [
      {
        currencyTypeName: 'Mirror of Kalandra',
        chaosEquivalent: 357456,
        receiveSparkLine: { data: [1, 2, 3] }
      },
      {
        currencyTypeName: 'Divine Orb',
        chaosEquivalent: 317.1
      },
      {
        currencyTypeName: 'Broken Rate',
        chaosEquivalent: 'not-a-number'
      }
    ],
    currencyDetails: [
      {
        name: 'Mirror of Kalandra',
        icon: 'https://example.test/mirror.png',
        tradeId: 'mirror'
      }
    ]
  }, 'Currency');

  const mirror = service.getPriceInfo('Mirror of Kalandra');
  const divine = service.getPriceInfo('Divine Orb');
  const broken = service.getPriceInfo('Broken Rate');

  assert.equal(mirror.chaosValue, 357456);
  assert.equal(mirror.divineValue, 1127.265847);
  assert.equal(mirror.icon, 'https://example.test/mirror.png');
  assert.deepEqual(mirror.sparkline, [1, 2, 3]);
  assert.equal(divine.chaosValue, 317.1);
  assert.equal(divine.divineValue, 1);
  assert.equal(broken.chaosValue, 0);
  assert.equal(broken.divineValue, null);
});

test('priceItems tolerates malformed snapshot items without producing invalid totals', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    lines: [
      {
        currencyTypeName: 'Divine Orb',
        chaosEquivalent: 120
      }
    ]
  }, 'Currency');

  const result = service.priceItems([
    { quantity: 2 },
    { baseType: 'Unknown Drop', quantity: 1 }
  ]);

  assert.equal(service.getChaosValue(null), 0);
  assert.equal(result.totalChaos, 0);
  assert.equal(result.totalDivine, 0);
  assert.equal(result.divinePrice, 120);
  assert.equal(result.pricedCount, 0);
  assert.equal(result.unpricedCount, 2);
  assert.ok(result.items.every(item => Number.isFinite(item.chaosValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.totalChaosValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.divineValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.totalDivineValue)));
});

test('poe1 price registry fetches exchange-like farm loot through currency overview types', () => {
  registry.setPoeVersion('poe1');

  assert.equal(registry.getCurrencyTypes().includes('Scarab'), true);
  assert.equal(registry.getCurrencyTypes().includes('Essence'), true);
  assert.equal(registry.getCurrencyTypes().includes('DeliriumOrb'), true);
  assert.equal(registry.getCurrencyTypes().includes('AllflameEmber'), true);
  assert.equal(registry.getItemTypes().includes('Scarab'), false);
  assert.equal(registry.getItemTypes().includes('Essence'), false);
  assert.equal(registry.getItemTypes().includes('DeliriumOrb'), false);
  assert.equal(registry.getItemTypes().includes('AllflameEmber'), false);
});
