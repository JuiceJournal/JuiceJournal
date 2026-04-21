(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.appUpdateModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAppUpdateModel() {
  function getAppUpdateSupportState({ isPackaged, platform }) {
    const enabled = Boolean(isPackaged) && platform === 'win32';
    return {
      enabled,
      supported: enabled
    };
  }

  function createAppUpdateState({ currentVersion, isPackaged, platform }) {
    const support = getAppUpdateSupportState({ isPackaged, platform });
    return {
      ...support,
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progressPercent: 0,
      currentVersion: currentVersion || null,
      nextVersion: null,
      releaseName: null,
      releaseNotes: null,
      error: null,
      lastCheckedAt: null
    };
  }

  function applyAppUpdatePatch(state, patch = {}) {
    Object.assign(state, patch);
    return state;
  }

  const model = {
    getAppUpdateSupportState,
    createAppUpdateState,
    applyAppUpdatePatch
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = model;
  }

  return model;
});
