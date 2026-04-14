(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeBridgeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeBridgeModel() {
  function isBridgePayload(payload) {
    return Boolean(payload)
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && typeof payload.type === 'string'
      && payload.type.trim().length > 0
      && typeof payload.detectedAt === 'string'
      && payload.detectedAt.trim().length > 0;
  }

  function parseNativeBridgeLine(line) {
    if (typeof line !== 'string' || !line.trim()) {
      return null;
    }

    try {
      const payload = JSON.parse(line);
      return isBridgePayload(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  return {
    parseNativeBridgeLine
  };
});
