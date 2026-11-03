const { applyAppUpdatePatch } = require('./appUpdateModel');
const { SIGNATURE_FIELD, verifyUpdateSignature } = require('./updateSignature');

const NOT_DOWNLOADED = {
  downloading: false,
  downloadPercent: null,
  verifying: false,
  readyToInstall: false
};

// latest.yml fields the signature does not cover, which change how the installer runs. This per-user build never
// sets them, so a release carrying them was not made by the release script.
function hasUnsignedInstallOptions(event) {
  const files = Array.isArray(event?.files) ? event.files : [];
  return event?.packages != null || files.some((file) => file?.isAdminRightsRequired);
}

// Releases carry no Windows publisher signature, so electron-updater would run whatever the feed points at. An update
// becomes installable only after its Ed25519 signature checks out, and only downloads or installs when the user asks.
function createAppUpdateFlow({ updater, state, onChange, normalizeError, pendingInstall, verify = verifyUpdateSignature }) {
  let verifiedUpdate = null;

  function patch(values) {
    applyAppUpdatePatch(state, values);
    onChange();
  }

  function clearDownload() {
    verifiedUpdate = null;
    return NOT_DOWNLOADED;
  }

  async function hasValidSignature(file, update) {
    try {
      return await verify({ file, version: update.version, signature: update.signature });
    } catch (error) {
      console.warn('Failed to verify the downloaded update', error);
      return false;
    }
  }

  function rejectUpdate() {
    patch({
      ...clearDownload(),
      error: 'The update failed its signature check.',
      errorKind: 'signature'
    });
  }

  // Once an install has begun, the verified file must be the one that runs, so nothing may replace it.
  function listen(eventName, handler) {
    updater.on(eventName, (...args) => {
      if (!state.installing) {
        return handler(...args);
      }
      return undefined;
    });
  }

  // The silent installer reports nothing back, so a version that did not change after the restart is the only sign.
  const attemptedVersion = pendingInstall.read();
  if (attemptedVersion) {
    pendingInstall.clear();
    // A newer version than the attempted one means the user has since installed by hand.
    if (attemptedVersion.localeCompare(state.currentVersion, undefined, { numeric: true }) > 0) {
      state.installFailedVersion = attemptedVersion;
    }
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.disableWebInstaller = true;
  updater.disableDifferentialDownload = true;

  listen('checking-for-update', () => {
    patch({
      checking: true,
      error: null,
      errorKind: null,
      lastCheckedAt: new Date().toISOString()
    });
  });

  listen('update-available', (info) => {
    const version = info?.version || null;
    patch({
      ...(version === state.nextVersion ? {} : clearDownload()),
      checking: false,
      available: true,
      nextVersion: version,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      error: null,
      errorKind: null
    });
  });

  listen('update-not-available', () => {
    patch({
      ...clearDownload(),
      checking: false,
      available: false,
      nextVersion: null,
      releaseName: null,
      releaseNotes: null,
      error: null,
      errorKind: null,
      lastCheckedAt: new Date().toISOString()
    });
  });

  listen('download-progress', (progress) => {
    const downloadPercent = Math.floor(progress?.percent || 0);
    if (state.downloading && downloadPercent !== state.downloadPercent) {
      patch({ downloadPercent });
    }
  });

  listen('update-downloaded', async (event) => {
    patch({ ...clearDownload(), verifying: true });

    const update = { version: event?.version, signature: event?.[SIGNATURE_FIELD] };
    if (hasUnsignedInstallOptions(event) || !await hasValidSignature(event?.downloadedFile, update)) {
      rejectUpdate();
      return;
    }

    verifiedUpdate = update;
    patch({ verifying: false, readyToInstall: true });
  });

  listen('error', (error) => {
    patch({
      checking: false,
      downloading: false,
      downloadPercent: null,
      error: normalizeError(error),
      errorKind: state.downloading ? 'download' : 'check'
    });
  });

  return {
    async check() {
      if (state.downloading || state.verifying || state.installing) {
        return;
      }
      await updater.checkForUpdates();
    },

    download() {
      if (!state.available || state.checking || state.downloading || state.verifying || state.readyToInstall || state.installing) {
        return;
      }
      patch({ downloading: true, downloadPercent: 0, error: null, errorKind: null });
      try {
        // Later failures reach the 'error' listener, which puts them in the state.
        updater.downloadUpdate().catch(() => {});
      } catch (error) {
        patch({
          downloading: false,
          downloadPercent: null,
          error: normalizeError(error),
          errorKind: 'download'
        });
      }
    },

    // The installer may have waited on disk for hours, so its signature is checked again before the quit starts.
    async beginInstall() {
      if (!state.readyToInstall || state.checking || state.verifying || state.installing || !verifiedUpdate) {
        return false;
      }

      patch({ verifying: true });
      const file = updater.installerPath;
      if (!file || !await hasValidSignature(file, verifiedUpdate)) {
        rejectUpdate();
        return false;
      }

      verifiedUpdate = { ...verifiedUpdate, file };
      patch({ verifying: false, installing: true });
      return true;
    },

    // Returns false when no install started, so the caller can still finish its quit.
    install() {
      if (!state.installing || !verifiedUpdate?.file || updater.installerPath !== verifiedUpdate.file) {
        return false;
      }
      try {
        pendingInstall.write(verifiedUpdate.version);
      } catch (error) {
        // This record only reports a failed install, so losing it must not stop the install.
        console.warn('Failed to record the update install', error);
      }
      updater.quitAndInstall(true, true);
      return true;
    }
  };
}

module.exports = {
  createAppUpdateFlow
};
