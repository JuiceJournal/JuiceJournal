const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROVIDER_REQUEST = '../src/modules/overwolfOverlayProvider';
const mainProcessPath = path.join(__dirname, '..', 'main.js');
const overlayHtmlPath = path.join(__dirname, '..', 'src', 'overlay.html');
const overlayJsPath = path.join(__dirname, '..', 'src', 'overlay.js');

function loadProviderModule() {
  try {
    delete require.cache[require.resolve(PROVIDER_REQUEST)];
    return require(PROVIDER_REQUEST);
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND' && error.message.includes(PROVIDER_REQUEST)) {
      assert.fail(`Expected desktop/src/modules/overwolfOverlayProvider.js to exist. Current red state: ${error.message}`);
    }

    throw error;
  }
}

test('overwolf overlay provider reports unavailable when the overlay api is absent', () => {
  const { createOverwolfOverlayProvider } = loadProviderModule();
  const provider = createOverwolfOverlayProvider();

  assert.equal(provider.isAvailable(), false);
  assert.deepEqual(provider.getStatus(), {
    provider: 'overwolf',
    available: false,
    reason: 'overlay-api-unavailable'
  });
});

test('overwolf overlay provider renders state through an in-game overlay window', async () => {
  const { createOverwolfOverlayProvider } = loadProviderModule();
  const calls = [];
  const overlayWindow = {
    loadFile(filePath) {
      calls.push(['loadFile', path.basename(filePath)]);
      return Promise.resolve();
    },
    executeJavaScript(script) {
      calls.push(['executeJavaScript', script.includes('window.JuiceOverlay.renderState')]);
      return Promise.resolve();
    },
    showInactive() {
      calls.push(['showInactive']);
      return Promise.resolve();
    },
    hide() {
      calls.push(['hide']);
      return Promise.resolve();
    }
  };
  const createWindowCalls = [];
  const overlayApi = {
    createWindow(options) {
      createWindowCalls.push(options);
      return Promise.resolve({
        window: overlayWindow
      });
    }
  };

  const provider = createOverwolfOverlayProvider({
    overlayApi,
    entryPath: path.join('desktop', 'src', 'overlay.html')
  });

  assert.equal(provider.isAvailable(), true);

  const result = await provider.renderState({
    visibility: 'visible',
    mode: 'map-result',
    mapResult: { result: { id: 'map-result-1' } }
  });

  assert.deepEqual(result, {
    handled: true,
    provider: 'overwolf'
  });
  assert.equal(createWindowCalls.length, 1);
  assert.equal(createWindowCalls[0].name, 'juice-journal-map-result-overlay');
  assert.equal(createWindowCalls[0].gameTargeting, 'active-game');
  assert.equal(createWindowCalls[0].clickThrough, true);
  assert.deepEqual(calls, [
    ['loadFile', 'overlay.html'],
    ['showInactive'],
    ['executeJavaScript', true]
  ]);
});

test('overwolf overlay provider hides the in-game overlay when state becomes hidden', async () => {
  const { createOverwolfOverlayProvider } = loadProviderModule();
  const calls = [];
  const overlayApi = {
    createWindow() {
      return Promise.resolve({
        window: {
          loadFile: () => Promise.resolve(),
          executeJavaScript: () => Promise.resolve(),
          showInactive: () => {
            calls.push('showInactive');
            return Promise.resolve();
          },
          hide: () => {
            calls.push('hide');
            return Promise.resolve();
          }
        }
      });
    }
  };
  const provider = createOverwolfOverlayProvider({
    overlayApi,
    entryPath: path.join('desktop', 'src', 'overlay.html')
  });

  await provider.renderState({ visibility: 'visible' });
  await provider.renderState({ visibility: 'hidden' });

  assert.deepEqual(calls, ['showInactive', 'hide']);
});

test('main process prefers Overwolf in-game overlay and keeps Electron overlay as fallback', () => {
  const source = fs.readFileSync(mainProcessPath, 'utf8');

  assert.match(source, /createOverwolfOverlayProvider/);
  assert.match(source, /getOverwolfOverlayProvider/);
  assert.match(source, /renderOverwolfOverlayWindow/);
  assert.match(source, /isOverwolfOverlayAvailable/);
  assert.match(source, /!overwolfAvailable/);
});

test('overlay card supports map-result slide in and slide out states', () => {
  const html = fs.readFileSync(overlayHtmlPath, 'utf8');
  const overlayJs = fs.readFileSync(overlayJsPath, 'utf8');

  assert.match(html, /slideInFromRight/);
  assert.match(html, /slideOutToRight/);
  assert.match(overlayJs, /data-overlay-exiting/);
});
