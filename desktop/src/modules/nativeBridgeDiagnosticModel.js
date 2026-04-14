(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeBridgeDiagnosticModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeBridgeDiagnosticModel() {
  function normalizeNativeBridgeDiagnostic(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    if (payload.type !== 'bridge-diagnostic' || typeof payload.detectedAt !== 'string') {
      return null;
    }

    return {
      type: payload.type,
      message: typeof payload.message === 'string' ? payload.message : '',
      detectedAt: payload.detectedAt,
      data: payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? payload.data
        : {}
    };
  }

  return {
    normalizeNativeBridgeDiagnostic
  };
});
