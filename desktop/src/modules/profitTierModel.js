(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.profitTierModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfitTierModel() {
  // Loot-filter style tiers for a single run's net profit, measured in divines so they hold across leagues.
  const DIVINE_TIER_THRESHOLDS = [
    { tier: 'unique', divines: 5 },
    { tier: 'rare', divines: 1 },
    { tier: 'magic', divines: 0.25 }
  ];

  function toPositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function getProfitTier(chaosValue, rates = {}) {
    const chaos = Number(chaosValue) || 0;
    if (chaos < 0) {
      return 'loss';
    }

    const mirrorChaos = toPositiveNumber(rates?.mirrorChaos);
    if (mirrorChaos && chaos >= mirrorChaos) {
      return 'mirror';
    }

    // Without a divine price the size of a gain is unknown, so it stays normal.
    const divineChaos = toPositiveNumber(rates?.divineChaos);
    if (!divineChaos) {
      return 'normal';
    }

    const divines = chaos / divineChaos;
    const match = DIVINE_TIER_THRESHOLDS.find((entry) => divines >= entry.divines);
    return match ? match.tier : 'normal';
  }

  // Meme badges only mark the extremes; the middle tiers stay quiet so lists do not get noisy.
  const TIER_MEMES = {
    loss: 'bricked',
    rare: 'pog',
    unique: 'juiced',
    mirror: 'mirror'
  };

  function getProfitTierMeme(tier) {
    return TIER_MEMES[tier] || null;
  }

  return {
    getProfitTier,
    getProfitTierMeme
  };
});
