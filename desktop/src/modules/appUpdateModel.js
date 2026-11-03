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
      currentVersion: currentVersion || null,
      nextVersion: null,
      releaseName: null,
      releaseNotes: null,
      downloading: false,
      downloadPercent: null,
      verifying: false,
      readyToInstall: false,
      installing: false,
      installFailedVersion: null,
      error: null,
      errorKind: null,
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
