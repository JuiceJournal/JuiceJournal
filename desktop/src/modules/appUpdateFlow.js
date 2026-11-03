const { applyAppUpdatePatch } = require('./appUpdateModel');
const { SIGNATURE_FIELD, verifyUpdateSignature } = require('./updateSignature');

const NOT_DOWNLOADED = {
  downloading: false,
  downloadPercent: null,
  verifying: false,
  readyToInstall: false
};

// Releases carry no Windows publisher signature, so electron-updater would run whatever the feed points at. An update
// becomes installable only after its Ed25519 signature checks out, and only downloads or installs when the user asks.
function createAppUpdateFlow({ updater, state, onChange, normalizeError, verify = verifyUpdateSignature }) {
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

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.disableWebInstaller = true;
  updater.disableDifferentialDownload = true;

  updater.on('checking-for-update', () => {
    patch({
      checking: true,
      error: null,
      errorKind: null,
      lastCheckedAt: new Date().toISOString()
    });
  });

  updater.on('update-available', (info) => {
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

  updater.on('update-not-available', () => {
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

  updater.on('download-progress', (progress) => {
    const downloadPercent = Math.floor(progress?.percent || 0);
    if (state.downloading && downloadPercent !== state.downloadPercent) {
      patch({ downloadPercent });
    }
  });

  updater.on('update-downloaded', async (event) => {
    patch({ ...clearDownload(), verifying: true });

    const update = { version: event?.version, signature: event?.[SIGNATURE_FIELD] };
    if (!await hasValidSignature(event?.downloadedFile, update)) {
      rejectUpdate();
      return;
    }

    verifiedUpdate = update;
    patch({ verifying: false, readyToInstall: true });
  });

  updater.on('error', (error) => {
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
      if (state.downloading || state.verifying) {
        return;
      }
      await updater.checkForUpdates();
    },

    download() {
      if (!state.available || state.downloading || state.verifying || state.readyToInstall) {
        return;
      }
      patch({ downloading: true, downloadPercent: 0, error: null, errorKind: null });
      // Failures also reach the 'error' listener, which puts them in the state.
      updater.downloadUpdate().catch(() => {});
    },

    // The installer may have waited on disk for hours, so its signature is checked again right before it runs.
    async verifyForInstall() {
      if (!state.readyToInstall || state.verifying || !verifiedUpdate) {
        return false;
      }

      patch({ verifying: true });
      if (!await hasValidSignature(updater.installerPath, verifiedUpdate)) {
        rejectUpdate();
        return false;
      }

      patch({ verifying: false });
      return true;
    },

    install() {
      updater.quitAndInstall(true, true);
    }
  };
}

module.exports = {
  createAppUpdateFlow
};
