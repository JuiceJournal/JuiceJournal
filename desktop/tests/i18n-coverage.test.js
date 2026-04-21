const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const repoDir = path.resolve(__dirname, '..', '..');
const desktopDir = path.join(repoDir, 'desktop');
const webDir = path.join(repoDir, 'web');

function walkFiles(dir, predicate, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, result);
      continue;
    }

    if (predicate(fullPath)) {
      result.push(fullPath);
    }
  }

  return result;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractMatches(source, pattern) {
  const keys = new Set();
  for (const [, key] of source.matchAll(pattern)) {
    if (!key.includes('${')) {
      keys.add(key);
    }
  }
  return keys;
}

function extractDesktopUsedKeys() {
  const keys = new Set();
  const html = read(path.join(desktopDir, 'src', 'index.html'));
  const appSource = read(path.join(desktopDir, 'src', 'app.js'));
  const mainSource = read(path.join(desktopDir, 'main.js'));

  for (const [, key] of html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)) {
    keys.add(key);
  }

  for (const key of extractMatches(appSource, /window\.t\(\s*['"`]([^'"`]+)['"`]/g)) {
    keys.add(key);
  }

  for (const key of extractMatches(appSource, /getUserFacingErrorMessage\([^,\n]+,\s*['"`]([^'"`]+)['"`]/g)) {
    keys.add(key);
  }

  for (const key of extractMatches(appSource, /:\s*['"`]([a-z]+(?:\.[A-Za-z0-9_.-]+)+)['"`]/g)) {
    keys.add(key);
  }

  for (const [, key] of mainSource.matchAll(/appendAuditTrail\(\s*['"]([A-Za-z][A-Za-z0-9.-]*)['"]/g)) {
    keys.add(key);
  }

  if (appSource.includes('window.t(`sessions.${safeStatus}`)')) {
    ['sessions.active', 'sessions.completed', 'sessions.abandoned'].forEach((key) => keys.add(key));
  }

  return keys;
}

function extractWebUsedKeys() {
  const keys = new Set();
  const srcFiles = walkFiles(path.join(webDir, 'src'), (fullPath) => {
    if (fullPath.includes(`${path.sep}lib${path.sep}locales${path.sep}`)) {
      return false;
    }

    return /\.(js|jsx|ts|tsx)$/.test(fullPath);
  });

  for (const filePath of srcFiles) {
    const source = read(filePath);

    for (const key of extractMatches(source, /\bt\(\s*['"`]([^'"`]+)['"`]/g)) {
      keys.add(key);
    }

    for (const key of extractMatches(source, /\btranslate\(\s*['"`]([^'"`]+)['"`]/g)) {
      keys.add(key);
    }

    if (source.includes('translate(`status.${status}`')) {
      ['status.active', 'status.completed', 'status.abandoned'].forEach((key) => keys.add(key));
    }

    if (source.includes('translate(`itemType.${type}`')) {
      [
        'itemType.currency',
        'itemType.fragment',
        'itemType.scarab',
        'itemType.map',
        'itemType.divination_card',
        'itemType.gem',
        'itemType.unique',
        'itemType.oil',
        'itemType.incubator',
        'itemType.delirium_orb',
        'itemType.catalyst',
        'itemType.other',
      ].forEach((key) => keys.add(key));
    }
  }

  return keys;
}

function loadDesktopTranslations() {
  const context = vm.createContext({
    window: {},
    document: { querySelectorAll: () => [] },
    console,
  });

  const source = read(path.join(desktopDir, 'src', 'modules', 'translations.js'));
  vm.runInContext(source, context);
  return context.window.Translations;
}

async function loadWebTranslations() {
  const enModule = await import(pathToFileURL(path.join(webDir, 'src', 'lib', 'locales', 'en.js')).href);
  const trModule = await import(pathToFileURL(path.join(webDir, 'src', 'lib', 'locales', 'tr.js')).href);
  const westModule = await import(pathToFileURL(path.join(webDir, 'src', 'lib', 'locales', 'europe-west.js')).href);
  const eastModule = await import(pathToFileURL(path.join(webDir, 'src', 'lib', 'locales', 'europe-east.js')).href);
  const asiaModule = await import(pathToFileURL(path.join(webDir, 'src', 'lib', 'locales', 'asia.js')).href);

  const { EN_MESSAGES } = enModule;
  const { TR_MESSAGES } = trModule;
  const { DE_MESSAGES, FR_MESSAGES, ES_MESSAGES } = westModule;
  const { IT_MESSAGES, PT_BR_MESSAGES, RU_MESSAGES } = eastModule;
  const { JA_MESSAGES, KO_MESSAGES, ZH_CN_MESSAGES, ZH_TW_MESSAGES } = asiaModule;

  return {
    en: EN_MESSAGES,
    tr: { ...EN_MESSAGES, ...TR_MESSAGES },
    de: { ...EN_MESSAGES, ...DE_MESSAGES },
    fr: { ...EN_MESSAGES, ...FR_MESSAGES },
    es: { ...EN_MESSAGES, ...ES_MESSAGES },
    it: { ...EN_MESSAGES, ...IT_MESSAGES },
    'pt-BR': { ...EN_MESSAGES, ...PT_BR_MESSAGES },
    ru: { ...EN_MESSAGES, ...RU_MESSAGES },
    ja: { ...EN_MESSAGES, ...JA_MESSAGES },
    ko: { ...EN_MESSAGES, ...KO_MESSAGES },
    'zh-CN': { ...EN_MESSAGES, ...ZH_CN_MESSAGES },
    'zh-TW': { ...EN_MESSAGES, ...ZH_TW_MESSAGES },
  };
}

function diff(requiredKeys, definedKeys) {
  return [...requiredKeys].filter((key) => !definedKeys.has(key)).sort();
}

test('desktop english translation dictionary covers every used localization key', () => {
  const translations = loadDesktopTranslations();
  const usedKeys = extractDesktopUsedKeys();
  const definedKeys = new Set(Object.keys(translations.en));
  const missing = diff(usedKeys, definedKeys);

  assert.deepEqual(missing, []);
});

test('desktop locale dictionaries expose the full english key set after fallback', () => {
  const translations = loadDesktopTranslations();
  const englishKeys = new Set(Object.keys(translations.en));

  for (const [localeCode, dictionary] of Object.entries(translations)) {
    const localeKeys = new Set(Object.keys(dictionary));
    const missing = diff(englishKeys, localeKeys);

    assert.deepEqual(missing, [], `Missing desktop keys in locale ${localeCode}: ${missing.join(', ')}`);
  }
});

test('web english message dictionary covers every used localization key', async () => {
  const translations = await loadWebTranslations();
  const usedKeys = extractWebUsedKeys();
  const definedKeys = new Set(Object.keys(translations.en));
  const missing = diff(usedKeys, definedKeys);

  assert.deepEqual(missing, []);
});

test('web locale maps expose the full english key set through i18n composition', async () => {
  const translations = await loadWebTranslations();
  const englishKeys = new Set(Object.keys(translations.en));

  for (const [localeCode, dictionary] of Object.entries(translations)) {
    const localeKeys = new Set(Object.keys(dictionary));
    const missing = diff(englishKeys, localeKeys);

    assert.deepEqual(missing, [], `Missing web keys in locale ${localeCode}: ${missing.join(', ')}`);
  }
});
