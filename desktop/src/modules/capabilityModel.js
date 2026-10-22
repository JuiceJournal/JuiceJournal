(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.capabilityModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCapabilityModel() {
  // stashAccess: whether the Path of Exile sign-in was granted account:stashes; false turns PoE1 stash tracking off.
  function getCapabilitiesForGame(poeVersion, { stashAccess } = {}) {
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
      stashTracking: stashAccess === false
        ? { enabled: false, reason: 'stash_scope_missing' }
        : { enabled: true, reason: null }
    };
  }

  return {
    getCapabilitiesForGame
  };
});
