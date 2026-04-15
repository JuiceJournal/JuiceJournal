(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeBridgeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeBridgeModel() {
  function isObjectPayload(payload) {
    return Boolean(payload)
      && typeof payload === 'object'
      && !Array.isArray(payload);
  }

  function hasRequiredString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isBridgePayload(payload) {
    return isObjectPayload(payload)
      && payload.type?.trim() === 'bridge-diagnostic'
      && hasRequiredString(payload.detectedAt);
  }

  function normalizeBridgePayload(payload) {
    return {
      ...payload,
      type: payload.type.trim(),
      detectedAt: payload.detectedAt.trim()
    };
  }

  function isHintPayload(payload) {
    return isObjectPayload(payload)
      && payload.type?.trim() === 'active-character-hint'
      && (payload.poeVersion?.trim() === 'poe1' || payload.poeVersion?.trim() === 'poe2')
      && hasRequiredString(payload.characterName)
      && payload.confidence === 'high'
      && hasRequiredString(payload.source)
      && hasRequiredString(payload.detectedAt);
  }

  function normalizeHintPayload(payload) {
    return {
      ...payload,
      type: payload.type.trim(),
      poeVersion: payload.poeVersion.trim(),
      characterName: payload.characterName.trim(),
      source: payload.source.trim(),
      detectedAt: payload.detectedAt.trim()
    };
  }

  function parseNativeBridgeLine(line) {
    if (typeof line !== 'string' || !line.trim()) {
      return null;
    }

    try {
      const payload = JSON.parse(line);
      if (isHintPayload(payload)) {
        return normalizeHintPayload(payload);
      }

      return isBridgePayload(payload) ? normalizeBridgePayload(payload) : null;
    } catch {
      return null;
    }
  }

  return {
    parseNativeBridgeLine
  };
});
