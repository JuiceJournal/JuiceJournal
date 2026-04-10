(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.capabilityModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCapabilityModel() {
  function getCapabilitiesForGame(poeVersion) {
    if (poeVersion === 'poe2') {
      return {
        characterSummary: { enabled: true, reason: null },
        runtimeTracking: { enabled: true, reason: null },
        stashTracking: { enabled: false, reason: 'poe2_not_supported_yet' }
      };
    }

    return {
      characterSummary: { enabled: true, reason: null },
      runtimeTracking: { enabled: true, reason: null },
      stashTracking: { enabled: true, reason: null }
    };
  }

  return {
    getCapabilitiesForGame
  };
});
