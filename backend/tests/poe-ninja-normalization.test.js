const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCurrencyData,
  normalizeItemData,
  normalizeExchangeData,
  getExchangeDivineToChaos,
  getPoe1DivineToChaos
} = require('../services/poeNinjaService');

test('poe1 currency normalization derives divine values from the current league Divine Orb price', () => {
  const data = {
    lines: [
      {
        currencyTypeName: 'Mirror of Kalandra',
        chaosEquivalent: 357456
      },
      {
        currencyTypeName: 'Divine Orb',
        chaosEquivalent: 317.1
      }
    ]
  };

  const items = normalizeCurrencyData(data, 'Currency', 'poe1');
  const mirror = items.find(item => item.name === 'Mirror of Kalandra');
  const divine = items.find(item => item.name === 'Divine Orb');

  assert.equal(getPoe1DivineToChaos(data), 317.1);
  assert.equal(divine.divineValue, 1);
  assert.equal(mirror.divineValue, 1127.265847);
});

test('poe1 non-currency normalizers reuse the supplied league divine rate', () => {
  const fragmentData = {
    lines: [
      {
        currencyTypeName: 'Mortal Hope',
        chaosEquivalent: 634.2
      }
    ]
  };
  const itemData = {
    lines: [
      {
        name: 'Expensive Unique',
        chaosValue: 951.3
      }
    ]
  };

  const [fragment] = normalizeCurrencyData(fragmentData, 'Fragment', 'poe1', {
    divineToChaos: 317.1
  });
  const [item] = normalizeItemData(itemData, 'UniqueJewel', 'poe1', {
    divineToChaos: 317.1
  });

  assert.equal(fragment.divineValue, 2);
  assert.equal(item.divineValue, 3);
});

test('poe1 exchange normalization treats primaryValue as chaos and derives adaptive divine values', () => {
  const data = {
    core: {
      primary: 'chaos',
      secondary: 'divine',
      rates: {
        divine: 0.002677
      },
      items: [
        {
          id: 'divine',
          name: 'Divine Orb',
          image: '/divine.png'
        }
      ]
    },
    items: [
      {
        id: 'hinekoras-lock',
        name: "Hinekora's Lock",
        image: '/hinekoras-lock.png'
      }
    ],
    lines: [
      {
        id: 'hinekoras-lock',
        primaryValue: 83440,
        maxVolumeCurrency: 'divine',
        maxVolumeRate: 0.004477
      }
    ]
  };

  const items = normalizeExchangeData(data, 'Currency', 'poe1');
  const hinekora = items.find(item => item.name === "Hinekora's Lock");
  const divine = items.find(item => item.name === 'Divine Orb');

  assert.equal(hinekora.chaosValue, 83440);
  assert.equal(hinekora.divineValue, 223.36386);
  assert.equal(divine.chaosValue, 373.55);
  assert.equal(divine.divineValue, 1);
});

test('poe2 exchange normalization reads divine-to-chaos from core chaos rate', () => {
  const data = {
    core: {
      primary: 'divine',
      secondary: 'chaos',
      rates: {
        chaos: 26.65
      },
      items: [
        {
          id: 'divine',
          name: 'Divine Orb',
          image: '/divine.png'
        },
        {
          id: 'chaos',
          name: 'Chaos Orb',
          image: '/chaos.png'
        }
      ]
    },
    items: [
      {
        id: 'expensive-fragment',
        name: 'Expensive Fragment',
        image: '/fragment.png'
      }
    ],
    lines: [
      {
        id: 'divine',
        primaryValue: 1
      },
      {
        id: 'chaos',
        primaryValue: 0.03752
      },
      {
        id: 'expensive-fragment',
        primaryValue: 2.5
      }
    ]
  };

  const items = normalizeExchangeData(data, 'Fragments', 'poe2');
  const divine = items.find(item => item.name === 'Divine Orb');
  const chaos = items.find(item => item.name === 'Chaos Orb');
  const fragment = items.find(item => item.name === 'Expensive Fragment');

  assert.equal(getExchangeDivineToChaos(data), 26.65);
  assert.equal(divine.chaosValue, 26.65);
  assert.equal(divine.divineValue, 1);
  assert.equal(chaos.chaosValue, 1);
  assert.equal(chaos.divineValue, 0.03752);
  assert.equal(fragment.chaosValue, 66.63);
  assert.equal(fragment.divineValue, 2.5);
});
