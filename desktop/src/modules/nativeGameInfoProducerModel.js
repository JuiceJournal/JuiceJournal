(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeGameInfoProducerModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeGameInfoProducerModel() {
  const RUNTIME_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill'];

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

    if (normalized === 'poe1') {
      return 'poe1';
    }

    if (normalized === 'poe2') {
      return 'poe2';
    }

    return null;
  }

  function getRequiredFeaturesForVersion(poeVersion) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);

    if (normalizedPoeVersion === 'poe1' || normalizedPoeVersion === 'poe2') {
      return [...RUNTIME_REQUIRED_FEATURES];
    }

    return [];
  }

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return null;
  }

  function createNativePayload({
    poeVersion,
    characterName = null,
    className = null,
    level = null,
    experience = null,
    currentZone = null,
    openedPage = null,
    inTown = null,
    scene = null,
    eventName = null,
    eventData = null,
    confidence = 'medium'
  } = {}) {
    return {
      source: 'native-info',
      poeVersion,
      characterName,
      className,
      level,
      experience,
      currentZone,
      openedPage,
      inTown,
      scene,
      eventName,
      eventData,
      confidence
    };
  }

  function pickFirstString(...values) {
    for (const value of values) {
      const normalized = normalizeString(value);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function normalizeNativeInfoPayload({ poeVersion, info } = {}) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);
    const me = info && typeof info === 'object' ? info.me : null;
    const matchInfo = info && typeof info === 'object' ? info.match_info : null;
    const gameInfo = info && typeof info === 'object' ? info.game_info : null;
    const characterName = normalizeString(me?.character_name);

    if (!normalizedPoeVersion || !characterName) {
      return null;
    }

    const experience = normalizedPoeVersion === 'poe1'
      ? normalizeNumber(me?.character_experience)
      : normalizeNumber(me?.character_exp ?? me?.character_experience);

    return createNativePayload({
      poeVersion: normalizedPoeVersion,
      characterName,
      className: pickFirstString(me?.character_class),
      level: normalizeNumber(me?.character_level),
      experience,
      currentZone: pickFirstString(matchInfo?.current_zone, gameInfo?.current_zone),
      openedPage: pickFirstString(matchInfo?.opened_page, gameInfo?.opened_page),
      inTown: normalizeBoolean(matchInfo?.in_town ?? gameInfo?.in_town),
      scene: pickFirstString(gameInfo?.scene, matchInfo?.scene),
      confidence: 'high'
    });
  }

  function normalizeNativeEventPayload({ poeVersion, event } = {}) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);

    if (!normalizedPoeVersion || !event || typeof event !== 'object') {
      return null;
    }

    const eventName = normalizeString(event.name || event.eventName || event.event);

    if (!eventName || eventName.toLowerCase() === 'chat') {
      return null;
    }

    const rawData = Object.prototype.hasOwnProperty.call(event, 'data')
      ? event.data
      : event.eventData;
    const eventData = typeof rawData === 'string'
      ? normalizeString(rawData, null)
      : (rawData == null ? null : String(rawData));

    return createNativePayload({
      poeVersion: normalizedPoeVersion,
      eventName,
      eventData,
      confidence: 'medium'
    });
  }

  return {
    getRequiredFeaturesForVersion,
    normalizeNativeInfoPayload,
    normalizeNativeEventPayload
  };
});
