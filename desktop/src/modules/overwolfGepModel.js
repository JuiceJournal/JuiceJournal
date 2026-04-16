(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.overwolfGepModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOverwolfGepModel() {
  const REQUIRED_GEP_METHODS = ['setRequiredFeatures', 'getInfo', 'on', 'removeListener'];
  const POE2_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info'];

  function normalizeString(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim();
  }

  function normalizeNumber(value) {
    if (value == null || typeof value === 'boolean') {
      return null;
    }

    if (typeof value === 'string') {
      value = value.trim();

      if (!value) {
        return null;
      }
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  function normalizePoeVersion(value) {
    const normalized = normalizeString(value).toLowerCase();

    if (normalized === 'poe2') {
      return 'poe2';
    }

    return null;
  }

  function getOverwolfGepCapability(gep) {
    const missing = REQUIRED_GEP_METHODS.filter(methodName => typeof gep?.[methodName] !== 'function');

    return {
      status: missing.length === 0 ? 'available' : 'unavailable',
      missing
    };
  }

  function getRequiredFeaturesForVersion(poeVersion) {
    if (normalizePoeVersion(poeVersion) === 'poe2') {
      return [...POE2_REQUIRED_FEATURES];
    }

    return [];
  }

  function normalizeOverwolfInfoHint({ poeVersion, info } = {}) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);
    const me = info && typeof info === 'object' ? info.me : null;
    const characterName = normalizeString(me?.character_name);

    if (!normalizedPoeVersion || !characterName) {
      return null;
    }

    const className = normalizeString(me?.character_class) || null;

    return {
      source: 'overwolf-gep',
      poeVersion: normalizedPoeVersion,
      characterName,
      className,
      level: normalizeNumber(me?.character_level),
      experience: normalizeNumber(me?.character_exp),
      confidence: 'high'
    };
  }

  return {
    getOverwolfGepCapability,
    getRequiredFeaturesForVersion,
    normalizeOverwolfInfoHint
  };
});
