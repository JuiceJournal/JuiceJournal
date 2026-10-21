const test = require('node:test');
const assert = require('node:assert/strict');

const { getProfitTier } = require('../src/modules/profitTierModel');

const RATES = { divineChaos: 150, mirrorChaos: 300000 };

test('profit tier marks any net loss as loss', () => {
  assert.equal(getProfitTier(-0.5, RATES), 'loss');
  assert.equal(getProfitTier(-5000, RATES), 'loss');
});

test('profit tier scales gains by divine value', () => {
  assert.equal(getProfitTier(0, RATES), 'normal');
  assert.equal(getProfitTier(37, RATES), 'normal');
  assert.equal(getProfitTier(37.5, RATES), 'magic');
  assert.equal(getProfitTier(149, RATES), 'magic');
  assert.equal(getProfitTier(150, RATES), 'rare');
  assert.equal(getProfitTier(749, RATES), 'rare');
  assert.equal(getProfitTier(750, RATES), 'unique');
  assert.equal(getProfitTier(299999, RATES), 'unique');
  assert.equal(getProfitTier(300000, RATES), 'mirror');
});

test('profit tier keeps gains normal when the divine price is unknown', () => {
  assert.equal(getProfitTier(5000, {}), 'normal');
  assert.equal(getProfitTier(5000, { divineChaos: 0 }), 'normal');
  assert.equal(getProfitTier(5000, null), 'normal');
  assert.equal(getProfitTier(-1, {}), 'loss');
});

test('profit tier treats non-numeric values as zero', () => {
  assert.equal(getProfitTier(undefined, RATES), 'normal');
  assert.equal(getProfitTier('abc', RATES), 'normal');
  assert.equal(getProfitTier('300', RATES), 'rare');
});

test('profit tier memes mark only the extremes', () => {
  const { getProfitTierMeme } = require('../src/modules/profitTierModel');

  assert.equal(getProfitTierMeme('loss'), 'bricked');
  assert.equal(getProfitTierMeme('rare'), 'pog');
  assert.equal(getProfitTierMeme('unique'), 'juiced');
  assert.equal(getProfitTierMeme('mirror'), 'mirror');
  assert.equal(getProfitTierMeme('normal'), null);
  assert.equal(getProfitTierMeme('magic'), null);
  assert.equal(getProfitTierMeme(undefined), null);
});
