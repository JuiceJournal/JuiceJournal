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

  function getRequiredFeaturesForVersion(poeVersion) {
    if (normalizePoeVersion(poeVersion) === 'poe2') {
      return [...POE2_REQUIRED_FEATURES];
    }

    return [];
  }

  function normalizeNativeInfoPayload({ poeVersion, info } = {}) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);
    const me = info && typeof info === 'object' ? info.me : null;
    const characterName = normalizeString(me?.character_name);
    const className = normalizeString(
      me?.character_class
      || me?.characterClass
      || me?.class_name
      || me?.class
    );
    const ascendancy = normalizeString(
      me?.character_ascendancy
      || me?.characterAscendancy
      || me?.ascendancy_class
      || me?.ascendancy
    );

    if (!normalizedPoeVersion || !characterName) {
      return null;
    }

    const hint = {
      source: 'native-info',
      poeVersion: normalizedPoeVersion,
      characterName,
      level: normalizeNumber(me?.character_level),
      experience: normalizeNumber(me?.character_exp),
      confidence: 'high'
    };

    if (className) {
      hint.className = className;
    }

    if (ascendancy) {
      hint.ascendancy = ascendancy;
    }

    return hint;
  }

  return {
    getRequiredFeaturesForVersion,
    normalizeNativeInfoPayload
  };
});
