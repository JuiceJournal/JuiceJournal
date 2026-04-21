# Desktop Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Releases-backed desktop auto-update flow for packaged Windows builds, with Settings > About status, manual check, background download, and restart-to-install.

**Architecture:** Use `electron-updater` in the main process behind a normalized update-state layer. Expose the state and actions through preload IPC, then render the state in the About tab with explicit controls for check/install. Keep development mode and unsupported environments disabled and quiet.

**Tech Stack:** Electron, electron-builder, electron-updater, Node.js test runner, IPC via preload/contextBridge, static desktop translations.

---

### Task 1: Add Failing Main-Process Update Tests

**Files:**
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write a failing test for the packaged-environment update guard**

Add a new test that expects a new `getAppUpdateSupportState()` function in `desktop/main.js`:

```js
test('packaged windows runtime enables app updates while development mode stays disabled', () => {
  const packagedContext = loadFunctions(['getAppUpdateSupportState'], {
    app: { isPackaged: true },
    process: { platform: 'win32' }
  });

  const devContext = loadFunctions(['getAppUpdateSupportState'], {
    app: { isPackaged: false },
    process: { platform: 'win32' }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(packagedContext.getAppUpdateSupportState())), {
    enabled: true,
    supported: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(devContext.getAppUpdateSupportState())), {
    enabled: false,
    supported: false
  });
});
```

- [ ] **Step 2: Write a failing test for update-state normalization**

Add a test for a new `createAppUpdateState()` and `applyAppUpdatePatch()` pair:

```js
test('main update state tracks checking, availability, progress, and downloaded install readiness', () => {
  const context = loadFunctions(['createAppUpdateState', 'applyAppUpdatePatch'], {
    app: {
      isPackaged: true,
      getVersion: () => '1.0.0'
    },
    process: { platform: 'win32' }
  });

  const state = context.createAppUpdateState();
  context.applyAppUpdatePatch(state, {
    checking: true,
    available: true,
    nextVersion: '1.1.0',
    downloading: true,
    progressPercent: 45
  });
  context.applyAppUpdatePatch(state, {
    downloading: false,
    downloaded: true
  });

  assert.equal(state.currentVersion, '1.0.0');
  assert.equal(state.nextVersion, '1.1.0');
  assert.equal(state.downloaded, true);
  assert.equal(state.progressPercent, 45);
});
```

- [ ] **Step 3: Write a failing test for IPC handlers**

Add tests that expect new main-process handlers:

```js
test('main process exposes app update snapshot and install actions through ipc handlers', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /ipcMain\.handle\('get-app-update-state'/);
  assert.match(source, /ipcMain\.handle\('check-for-app-update'/);
  assert.match(source, /ipcMain\.handle\('install-app-update'/);
});
```

- [ ] **Step 4: Run the focused main-process tests to verify RED**

Run:

```bash
node --test desktop/tests/main-settings.test.js
```

Expected: FAIL because the new update functions and handlers do not exist yet.

### Task 2: Add Failing Preload and Renderer Tests

**Files:**
- Modify: `desktop/preload.js`
- Modify: `desktop/tests/settings-ui.test.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`

- [ ] **Step 1: Write a failing preload exposure test**

Add a preload test in `desktop/tests/main-settings.test.js` or a dedicated test file:

```js
test('desktop preload exposes app update methods and update-state subscription', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /getAppUpdateState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-app-update-state'\)/);
  assert.match(source, /checkForAppUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('check-for-app-update'\)/);
  assert.match(source, /installAppUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('install-app-update'\)/);
  assert.match(source, /onAppUpdateStateChanged:\s*\(callback\)\s*=>/);
  assert.match(source, /ipcRenderer\.on\('app-update-state-changed'/);
});
```

- [ ] **Step 2: Write a failing About-tab markup test**

Add assertions in `desktop/tests/settings-ui.test.js` for new About IDs:

```js
test('settings html includes desktop update status controls', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="app-version-value"/);
  assert.match(html, /id="app-update-status"/);
  assert.match(html, /id="app-update-detail"/);
  assert.match(html, /id="check-updates-btn"/);
  assert.match(html, /id="install-update-btn"/);
});
```

- [ ] **Step 3: Write a failing renderer-state test**

Add a test expecting a new `renderAppUpdateState()`:

```js
test('renderer about tab shows install action only when an update is downloaded', () => {
  const context = loadFunctions(['renderAppUpdateState'], {
    elements: {
      appVersionValue: { textContent: '' },
      appUpdateStatus: { textContent: '' },
      appUpdateDetail: { textContent: '' },
      checkUpdatesBtn: { disabled: false, textContent: '' },
      installUpdateBtn: { hidden: true, disabled: true, textContent: '' }
    },
    state: {
      appUpdate: {
        currentVersion: '1.0.0',
        downloaded: true,
        nextVersion: '1.1.0',
        checking: false,
        downloading: false,
        available: true,
        progressPercent: 100,
        error: null
      }
    },
    window: {
      t: (key) => key
    }
  });

  context.renderAppUpdateState();

  assert.equal(context.elements.appVersionValue.textContent, '1.0.0');
  assert.equal(context.elements.installUpdateBtn.hidden, false);
  assert.equal(context.elements.installUpdateBtn.disabled, false);
});
```

- [ ] **Step 4: Run the renderer/UI tests to verify RED**

Run:

```bash
node --test desktop/tests/settings-ui.test.js
```

Expected: FAIL because the About-tab update controls and renderer helpers do not exist yet.

### Task 3: Implement Main-Process Update State and IPC

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/main.js`
- Create: `desktop/src/modules/appUpdateModel.js`

- [ ] **Step 1: Add `electron-updater` as a runtime dependency**

Update `desktop/package.json`:

```json
{
  "dependencies": {
    "electron-updater": "^6.6.2"
  }
}
```

- [ ] **Step 2: Add GitHub publish configuration to electron-builder**

Update the existing `build` block in `desktop/package.json`:

```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "JuiceJournal",
        "repo": "JuiceJournal"
      }
    ]
  }
}
```

- [ ] **Step 3: Create a focused update-state module**

Create `desktop/src/modules/appUpdateModel.js` with pure helpers:

```js
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
    currentVersion,
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

module.exports = {
  getAppUpdateSupportState,
  createAppUpdateState,
  applyAppUpdatePatch
};
```

- [ ] **Step 4: Wire `electron-updater` into `desktop/main.js`**

Add imports and updater state:

```js
const { autoUpdater } = require('electron-updater');
const {
  getAppUpdateSupportState,
  createAppUpdateState,
  applyAppUpdatePatch
} = require('./src/modules/appUpdateModel');

let appUpdateState = null;
let appUpdateInitialized = false;
```

Then implement:

```js
function broadcastAppUpdateState() {
  if (!mainWindow?.webContents || !appUpdateState) return;
  mainWindow.webContents.send('app-update-state-changed', { ...appUpdateState });
}

function initializeAppUpdater() {
  if (appUpdateInitialized) return appUpdateState;

  appUpdateState = createAppUpdateState({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform
  });

  if (!appUpdateState.enabled) {
    appUpdateInitialized = true;
    return appUpdateState;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    applyAppUpdatePatch(appUpdateState, {
      checking: true,
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-available', (info) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: true,
      downloading: true,
      downloaded: false,
      nextVersion: info?.version || null,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      error: null
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('download-progress', (progress) => {
    applyAppUpdatePatch(appUpdateState, {
      downloading: true,
      progressPercent: Math.round(progress?.percent || 0)
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-downloaded', (info) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: true,
      downloading: false,
      downloaded: true,
      progressPercent: 100,
      nextVersion: info?.version || appUpdateState.nextVersion || null
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-not-available', () => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progressPercent: 0,
      nextVersion: null,
      releaseName: null,
      releaseNotes: null,
      error: null
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('error', (error) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      downloading: false,
      error: error?.message || 'Failed to check for updates'
    });
    broadcastAppUpdateState();
  });

  appUpdateInitialized = true;
  return appUpdateState;
}
```

- [ ] **Step 5: Add IPC handlers**

Inside `setupIPC()` add:

```js
ipcMain.handle('get-app-update-state', () => {
  return { ...(initializeAppUpdater() || {}) };
});

ipcMain.handle('check-for-app-update', async () => {
  const state = initializeAppUpdater();
  if (!state?.enabled) return { ...state };
  await autoUpdater.checkForUpdates();
  return { ...appUpdateState };
});

ipcMain.handle('install-app-update', async () => {
  const state = initializeAppUpdater();
  if (!state?.downloaded) {
    throw new Error('No downloaded update is ready to install');
  }
  setImmediate(() => autoUpdater.quitAndInstall());
  return { accepted: true };
});
```

- [ ] **Step 6: Initialize updater after creating the window**

After `createMainWindow();` and before normal app use continues:

```js
initializeAppUpdater();
if (appUpdateState?.enabled) {
  autoUpdater.checkForUpdates().catch(() => {});
}
```

- [ ] **Step 7: Run main-process tests to verify GREEN**

Run:

```bash
node --test desktop/tests/main-settings.test.js
```

Expected: PASS for the new main-process update tests.

### Task 4: Implement Preload and Renderer Update UI

**Files:**
- Modify: `desktop/preload.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/modules/translations.js`

- [ ] **Step 1: Expose update IPC in preload**

Add to `desktop/preload.js`:

```js
getAppUpdateState: () => ipcRenderer.invoke('get-app-update-state'),
checkForAppUpdate: () => ipcRenderer.invoke('check-for-app-update'),
installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
onAppUpdateStateChanged: (callback) => {
  ipcRenderer.on('app-update-state-changed', (_event, data) => callback(data));
},
```

and allow listener cleanup for:

```js
'app-update-state-changed'
```

- [ ] **Step 2: Add About-tab UI controls**

Extend the About section in `desktop/src/index.html` with:

```html
<div class="about-row">
  <span data-i18n="settings.version">Version</span>
  <span id="app-version-value" class="text-gold">1.0.0</span>
</div>
<div class="settings-group">
  <h3 data-i18n="settings.updates">App Updates</h3>
  <p id="app-update-status" class="settings-desc"></p>
  <p id="app-update-detail" class="settings-desc"></p>
  <div class="settings-actions-row">
    <button id="check-updates-btn" class="btn btn-secondary btn-small" data-i18n="settings.checkForUpdates">Check for Updates</button>
    <button id="install-update-btn" class="btn btn-primary btn-small hidden" data-i18n="settings.installUpdate">Restart to Install</button>
  </div>
</div>
```

- [ ] **Step 3: Add translation keys**

Add English strings in `desktop/src/modules/translations.js`:

```js
'settings.updates': 'App Updates',
'settings.checkForUpdates': 'Check for Updates',
'settings.checkingForUpdates': 'Checking for updates...',
'settings.installUpdate': 'Restart to Install',
'settings.updateUpToDate': 'This app is up to date.',
'settings.updateAvailable': 'Update available: {version}',
'settings.updateDownloading': 'Downloading update... {percent}%',
'settings.updateReady': 'Update ready to install.',
'settings.updateDisabled': 'Automatic updates are available only in packaged Windows builds.',
'settings.updateError': 'Update check failed.',
'toast.updateReadyTitle': 'Update Ready',
'toast.updateReadyBody': 'A new version has been downloaded. Restart the app to install it.',
```

Allow non-English locales to inherit through the existing English fallback behavior.

- [ ] **Step 4: Add renderer state and render function**

In `desktop/src/app.js`, extend state:

```js
appUpdate: null,
```

add DOM references:

```js
appVersionValue: document.getElementById('app-version-value'),
appUpdateStatus: document.getElementById('app-update-status'),
appUpdateDetail: document.getElementById('app-update-detail'),
checkUpdatesBtn: document.getElementById('check-updates-btn'),
installUpdateBtn: document.getElementById('install-update-btn'),
```

and implement:

```js
function renderAppUpdateState() {
  const update = state.appUpdate;
  if (!elements.appVersionValue || !update) return;

  elements.appVersionValue.textContent = update.currentVersion || '—';

  if (!update.enabled) {
    elements.appUpdateStatus.textContent = window.t('settings.updateDisabled');
    elements.appUpdateDetail.textContent = '';
    elements.checkUpdatesBtn.disabled = true;
    elements.installUpdateBtn.hidden = true;
    elements.installUpdateBtn.disabled = true;
    return;
  }

  if (update.error) {
    elements.appUpdateStatus.textContent = window.t('settings.updateError');
    elements.appUpdateDetail.textContent = update.error;
  } else if (update.downloaded) {
    elements.appUpdateStatus.textContent = window.t('settings.updateReady');
    elements.appUpdateDetail.textContent = update.nextVersion || '';
  } else if (update.downloading) {
    elements.appUpdateStatus.textContent = window.t('settings.updateDownloading', { percent: update.progressPercent || 0 });
    elements.appUpdateDetail.textContent = update.nextVersion || '';
  } else if (update.checking) {
    elements.appUpdateStatus.textContent = window.t('settings.checkingForUpdates');
    elements.appUpdateDetail.textContent = '';
  } else if (update.available) {
    elements.appUpdateStatus.textContent = window.t('settings.updateAvailable', { version: update.nextVersion || '?' });
    elements.appUpdateDetail.textContent = '';
  } else {
    elements.appUpdateStatus.textContent = window.t('settings.updateUpToDate');
    elements.appUpdateDetail.textContent = '';
  }

  elements.checkUpdatesBtn.disabled = Boolean(update.checking || update.downloading);
  elements.installUpdateBtn.hidden = !update.downloaded;
  elements.installUpdateBtn.disabled = !update.downloaded;
}
```

- [ ] **Step 5: Load and subscribe to update state**

During startup listener setup in `desktop/src/app.js`:

```js
if (window.electronAPI?.onAppUpdateStateChanged) {
  window.electronAPI.onAppUpdateStateChanged((data) => {
    state.appUpdate = data || null;
    renderAppUpdateState();
    if (data?.downloaded) {
      showToast(window.t('toast.updateReadyTitle'), window.t('toast.updateReadyBody'), 'success');
    }
  });
}

if (window.electronAPI?.getAppUpdateState) {
  state.appUpdate = await window.electronAPI.getAppUpdateState();
  renderAppUpdateState();
}
```

Add handlers:

```js
async function handleCheckForAppUpdate() {
  try {
    state.appUpdate = await window.electronAPI.checkForAppUpdate();
    renderAppUpdateState();
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'settings.updateError'), 'error');
  }
}

async function handleInstallAppUpdate() {
  try {
    await window.electronAPI.installAppUpdate();
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'settings.updateError'), 'error');
  }
}
```

Wire buttons:

```js
if (elements.checkUpdatesBtn) {
  elements.checkUpdatesBtn.addEventListener('click', handleCheckForAppUpdate);
}
if (elements.installUpdateBtn) {
  elements.installUpdateBtn.addEventListener('click', handleInstallAppUpdate);
}
```

- [ ] **Step 6: Run renderer and preload tests to verify GREEN**

Run:

```bash
node --test desktop/tests/settings-ui.test.js desktop/tests/main-settings.test.js
```

Expected: PASS for update markup, renderer state, preload exposure, and handler wiring.

### Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the desktop update-focused verification set**

Run:

```bash
node --test desktop/tests/main-settings.test.js desktop/tests/settings-ui.test.js
```

Expected: PASS

- [ ] **Step 2: Run the full desktop suite**

Run:

```bash
npm test
```

Working directory: `desktop`

Expected: PASS

- [ ] **Step 3: Record rollout caveats**

Close-out must mention:

- auto-update only works for packaged Windows builds
- GitHub Releases must publish installer artifacts and `latest.yml`
- development mode stays disabled by design

