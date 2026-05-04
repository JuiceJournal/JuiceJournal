(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeGameInfoProducerModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeGameInfoProducerModel() {
  const POE2_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info'];

  function stripWrappingQuotes(value) {
    let normalized = value.trim();
    const quotePairs = [
      ['"', '"'],
      ['\'', '\''],
      ['“', '”'],
      ['‘', '’']
    ];
    let stripped = true;

    while (stripped && normalized.length >= 2) {
      stripped = false;

      for (const [openQuote, closeQuote] of quotePairs) {
        if (normalized.startsWith(openQuote) && normalized.endsWith(closeQuote)) {
          normalized = normalized.slice(1, -1).trim();
          stripped = true;
          break;
        }
      }
    }

    return normalized;
  }

  function normalizeString(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return stripWrappingQuotes(value);
  }

  function getInfoBucket(info, bucketName) {
    if (!info || typeof info !== 'object') {
      return null;
    }

    if (info[bucketName] && typeof info[bucketName] === 'object') {
      return info[bucketName];
    }

    if (info.info && typeof info.info === 'object' && info.info[bucketName] && typeof info.info[bucketName] === 'object') {
      return info.info[bucketName];
    }

    return null;
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
    const me = getInfoBucket(info, 'me');
    const characterName = normalizeString(me?.character_name);
    const className = normalizeString(
      me?.character_class
      || me?.characterClass
      || me?.class_name
      || me?.class
    );
    const ascendancy = normalizeString(
      me?.character_ascendancy
      || me?.character_ascendancy_name
      || me?.characterAscendancy
      || me?.ascendancy_class
      || me?.ascendancy_name
      || me?.ascendancy
      || me?.sub_class
      || me?.subClass
    );
    const league = normalizeString(
      me?.character_league
      || me?.characterLeague
      || me?.league_name
      || me?.league
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

    if (league) {
      hint.league = league;
    }

    return hint;
  }

  return {
    getRequiredFeaturesForVersion,
    normalizeNativeInfoPayload
  };
});
