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

module.exports = {
  normalizeNativeBridgeDiagnostic
};
