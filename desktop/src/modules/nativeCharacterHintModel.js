(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeCharacterHintModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeCharacterHintModel() {
  function normalizeString(value, fallback = null) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim();
    return normalized || fallback;
  }

  function normalizePoeVersion(value) {
    const normalized = normalizeString(value)?.toLowerCase();
    return normalized === 'poe1' || normalized === 'poe2' ? normalized : null;
  }

  function deriveNativeCharacterHint(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const poeVersion = normalizePoeVersion(payload.poeVersion || payload.gameVersion || payload.game);
    const characterName = normalizeString(payload.characterName || payload.name);
    const className = normalizeString(payload.className || payload.class);
    const ascendancy = normalizeString(payload.ascendancy || payload.ascendancyClass);
    const league = normalizeString(payload.league);

    if (!poeVersion || (!characterName && !className && !league)) {
      return null;
    }

    const hint = {
      source: normalizeString(payload.source, 'native-game-info'),
      poeVersion,
      characterName,
      className,
      league,
      confidence: characterName ? 'high' : 'medium'
    };

    if (ascendancy) {
      hint.ascendancy = ascendancy;
    }

    return hint;
  }

  return {
    deriveNativeCharacterHint
  };
});
