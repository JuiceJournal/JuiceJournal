(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeGameInfoProducerModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeGameInfoProducerModel() {
  const POE2_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info'];

  function normalizeString(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim();
  }

  function normalizeNumber(value) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  function getRequiredFeaturesForVersion(poeVersion) {
    if (poeVersion === 'poe2') {
      return [...POE2_REQUIRED_FEATURES];
    }

    return [];
  }

  function normalizeNativeInfoPayload({ poeVersion, info } = {}) {
    const me = info && typeof info === 'object' ? info.me : null;
    const characterName = normalizeString(me?.character_name);

    if (!poeVersion || !characterName) {
      return null;
    }

    return {
      source: 'native-info',
      poeVersion,
      characterName,
      level: normalizeNumber(me?.character_level),
      experience: normalizeNumber(me?.character_exp),
      confidence: 'high'
    };
  }

  return {
    getRequiredFeaturesForVersion,
    normalizeNativeInfoPayload
  };
});
