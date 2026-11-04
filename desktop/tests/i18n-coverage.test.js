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
  const html = read(path.join(desktopDir, 'src', 'index.html')) + read(path.join(desktopDir, 'src', 'overlay.html'));
  const appSource = read(path.join(desktopDir, 'src', 'app.js'));
  const mainSource = read(path.join(desktopDir, 'main.js'));

  for (const [, key] of html.matchAll(/data-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g)) {
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

test('desktop keys new in the Hub, Currency and Settings pass have their own ASCII Turkish strings', () => {
  // tr falls back to en, so the coverage tests above stay green when a Turkish string is missing.
  const translations = loadDesktopTranslations();
  const newKeys = [
    'farmingHub.offTitle',
    'farmingHub.openOnlineSettings',
    'farmingHub.refresh',
    'farmingHub.loading',
    'farmingHub.noMatch',
    'currency.syncNow',
    'currency.noMatch',
    'settings.onlineOffShort',
    'settings.hotkeyCaptureHint',
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
});

test('desktop bug report keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'settings.reportBug',
    'settings.bugReportDesc',
    'settings.bugReportPreviewAria',
    'settings.bugReportLoadFailed',
    'settings.openBugReportIssue',
    'settings.openingBugReportIssue',
    'settings.copyBugReport',
    'settings.errorLogNote',
    'login.troubleSigningIn',
    'login.reportProblem',
    'login.backToSignIn',
    'toast.bugReportCopied',
    'toast.bugReportIssueOpened',
    'toast.bugReportOpenManually',
    'toast.bugReportCopyFailed',
    'toast.bugReportOpenFailed',
    'toast.bugReportChanged',
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  // The issue form, README and CONTRIBUTING quote this label.
  assert.equal(translations.en['settings.reportBug'], 'Report a bug');
  assert.match(translations.tr['toast.bugReportOpenManually'], /\{url\}/);
});

test('desktop Data tab keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'settings.data',
    'settings.dataAppliesNow',
    'settings.dataFolder',
    'settings.dataFolderDesc',
    'settings.dataTotalSize',
    'settings.dataSizeLoading',
    'settings.dataSizeUnavailable',
    'settings.openDataFolder',
    'settings.clearLogs',
    'settings.clearLogsDesc',
    'settings.auditTrail',
    'settings.diagnosticsHint',
    'toast.logsCleared',
    'toast.logsClearFailed',
    'toast.dataActionBusy',
    'toast.dataFolderOpenFailed',
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  // The renamed log has one name in both languages.
  assert.equal(translations.en['settings.auditTrail'], 'Activity log');
  assert.equal(translations.tr['settings.auditTrail'], 'Etkinlik gunlugu');
  // The README quotes these labels.
  assert.equal(translations.en['settings.clearLogs'], 'Clear logs');
  assert.equal(translations.en['settings.openDataFolder'], 'Open folder');
  assert.equal(translations.en['settings.data'], 'Data');
  assert.match(translations.en['settings.dataTotalSize'], /\{size\}/);
  assert.match(translations.tr['settings.dataTotalSize'], /\{size\}/);
  // About points to the tab and the button by their own labels.
  assert.ok(translations.en['settings.errorLogNote'].includes(`${translations.en['settings.clearLogs']} in Settings > ${translations.en['settings.data']}`));
  assert.ok(translations.tr['settings.errorLogNote'].includes(`Ayarlar > ${translations.tr['settings.data']}`));
  assert.ok(translations.tr['settings.errorLogNote'].includes(translations.tr['settings.clearLogs']));
  for (const [key, value] of Object.entries(translations.en)) {
    if (key.startsWith('settings.') || key.startsWith('toast.')) {
      assert.doesNotMatch(value, /audit/i, `en ${key} still says audit`);
    }
  }
});

test('desktop Delete everything keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'settings.deleteAll',
    'settings.deleteAllDesc',
    'settings.deleteAllTitle',
    'settings.deleteAllBody',
    'settings.deleteAllKept',
    'settings.deleteAllAck',
    'settings.deleteAllCancel',
    'settings.deleteAllRunning',
    'toast.deleteAllFailedTitle',
    'toast.deleteAllFailed',
    'toast.deleteAllRetry',
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  // The README quotes this label.
  assert.equal(translations.en['settings.deleteAll'], 'Delete everything');
  // The failure toast's own button tries again, so its text asks for that and not for a restart, which ends at sign-in.
  assert.equal(translations.en['toast.deleteAllRetry'], 'Try again');
  for (const language of ['en', 'tr']) {
    assert.doesNotMatch(translations[language]['toast.deleteAllFailed'], /restart|yeniden baslat/i, language);
  }
  // Shared runs are "runlar" everywhere else in the Turkish UI.
  assert.match(translations.tr['settings.deleteAllKept'], /paylastigin runlar/);
});

test('desktop notice keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'toast.dismiss', 'toast.mapProfit', 'toast.mapLoss', 'toast.mapUnpriced', 'toast.mapNoLoot',
    'toast.tryAgain', 'toast.tryAgainShort', 'toast.restartHint',
    'toast.settingsLoadFailed', 'toast.settingsError', 'toast.settingsReset', 'toast.settingsResetFailed',
    'settings.savedState', 'settings.connectionFailed',
    'settings.hotkeyErrorRequired', 'settings.hotkeyErrorModifierOnly', 'settings.hotkeyErrorOneKey',
    'settings.hotkeyErrorDuplicate', 'settings.hotkeyErrorInUse',
    'toast.mapStartFailed', 'toast.mapEndFailed', 'toast.poeConnectFailed', 'toast.poeDisconnectError',
    'login.failedTitle', 'login.failedInline', 'login.failedHint', 'toast.serverSignInFailed',
    'toast.updateAvailableTitle', 'toast.updateAvailableBody', 'settings.openUpdatePage', 'toast.updatePageFailed',
    'toast.runOpenFailed', 'toast.sessionUpdateError', 'toast.farmPublished', 'toast.farmPublishFailed',
    'toast.diagnosticsSaved', 'toast.diagnosticsExportedSafe', 'toast.diagnosticsExportedSensitive', 'toast.diagnosticsFailed',
    'toast.logsClearFailedTitle', 'toast.bugReportChangedHint',
    'stash.unavailableTitle', 'stash.pricesSyncedTitle', 'stash.pricesSynced', 'stash.pricesSyncFailed',
    'stash.syncPricesFirst', 'stash.syncPricesFirstHint', 'stash.snapshotTakenTitle', 'stash.snapshotTaken',
    'stash.snapshotFailed', 'stash.profitFailed', 'stash.baselineFailedTitle', 'stash.baselineFailed', 'stash.readingStash',
    'stash.staleSnapshotTitle', 'stash.staleSnapshot', 'stash.completedWithoutStashTitle', 'stash.completedWithoutStash',
    'currency.syncRestrictedTitle', 'currency.syncRestricted', 'currency.syncFailed',
    'toast.noSession', 'toast.scanNothingFound', 'toast.scanNothingFoundHint', 'toast.scanFailed'
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  // The inline sign-in line fills in its reason, and the hint names the link below it by its own label.
  assert.match(translations.en['login.failedInline'], /\{reason\}/);
  assert.match(translations.tr['login.failedInline'], /\{reason\}/);
  assert.ok(translations.en['login.failedHint'].includes(translations.en['login.reportProblem']));
  assert.ok(translations.tr['login.failedHint'].includes(translations.tr['login.reportProblem']));
  // The try-again hint points to the bug report by the labels the app uses.
  assert.ok(translations.en['toast.tryAgain'].includes(`${translations.en['nav.settings']} > ${translations.en['settings.about']}`));
  assert.ok(translations.tr['toast.tryAgain'].includes(`${translations.tr['nav.settings']} > ${translations.tr['settings.about']}`));
});

test('desktop journal notice keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'journal.unreadableTitle', 'journal.unreadableBody', 'journal.startNew', 'journal.openDataFolder',
    'toast.journalStarted', 'toast.journalStartFailed', 'toast.journalReadable', 'errors.journalUnreadable',
    'auditJournalStarted'
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
    assert.doesNotMatch(translations.en[key], /!|successfully/i, `en string for ${key}`);
  }
  // The README quotes this label.
  assert.equal(translations.en['journal.startNew'], 'Start a new journal');
});

test('desktop dashboard card, time and reset dialog keys have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'dashboard.noCharacterSelected', 'dashboard.unknownClass', 'dashboard.unknownLeague',
    'dashboard.characterSyncNeeded', 'dashboard.characterSynced',
    'dashboard.lastMapResult', 'dashboard.noCompletedMap', 'dashboard.mapResultsLoadError', 'dashboard.unknownFarmType',
    'dashboard.mapResultHistory', 'dashboard.mapResultFilterAria', 'dashboard.allFarms', 'dashboard.noMapResults',
    'mapResult.published', 'mapResult.draft', 'mapResult.local', 'mapResult.share', 'mapResult.shared',
    'time.justNow', 'time.minutesAgo', 'time.hoursAgo', 'time.daysAgo',
    'settings.resetTitle', 'settings.resetCancel'
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  for (const key of ['time.minutesAgo', 'time.hoursAgo', 'time.daysAgo']) {
    assert.match(translations.en[key], /\{count\}/, key);
    assert.match(translations.tr[key], /\{count\}/, key);
  }
});

test('desktop dashboard, sessions, hub and modal labels have their own ASCII Turkish strings', () => {
  const translations = loadDesktopTranslations();
  const newKeys = [
    'game.notRunning', 'dashboard.farmType', 'dashboard.noFarmType', 'dashboard.clearFarmType', 'mapResult.notCalculated',
    'sessions.allGames', 'sessions.allLeagues', 'sessions.searchPlaceholder',
    'farmingHub.leaguePlaceholder', 'farmingHub.minProfitPlaceholder', 'farmingHub.unknownAuthor', 'farmingHub.noSetupNotes',
    'farmingHub.maps', 'farmingHub.duration',
    'mapSession.kicker', 'mapSession.mapName', 'mapSession.startSubtitle', 'mapSession.startMap', 'mapSession.defaultContext',
    'mapSession.cancel', 'mapSession.endTitle', 'mapSession.endSubtitle', 'mapSession.activeRun', 'mapSession.keepTracking',
    'farmPublish.title', 'farmPublish.subtitle', 'farmPublish.selectedRun', 'farmPublish.visibility', 'farmPublish.public',
    'farmPublish.unlisted', 'farmPublish.private', 'farmPublish.setupNotes', 'farmPublish.setupNotesPlaceholder',
    'farmPublish.investmentKnown', 'farmPublish.cancel', 'farmPublish.publish', 'misc.unknownItem'
  ];

  for (const key of newKeys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
});

test('every Turkish desktop string is ASCII', () => {
  const translations = loadDesktopTranslations();
  for (const [key, value] of Object.entries(translations.tr)) {
    if (value !== translations.en[key]) {
      assert.match(value, /^[\x20-\x7e]*$/, `tr string for ${key} is not ASCII`);
    }
  }
});

test('desktop index.html options and placeholders are localized', () => {
  // Option labels and placeholders that stay the same in every language: game names, language names and sample input.
  const fixedOptionLabels = new Set(['PoE 1', 'PoE 2', 'Turkce', 'English', 'Standard']);
  const fixedPlaceholders = new Set(['Dunes Map, City Square Map', 'Standard', 'C:/Path of Exile/logs/Client.txt']);
  const html = read(path.join(desktopDir, 'src', 'index.html'));

  for (const [, attrs, label] of html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)) {
    if (/[A-Za-z]/.test(label) && !fixedOptionLabels.has(label.trim())) {
      assert.match(attrs, /data-i18n="/, `option "${label.trim()}" has no data-i18n`);
    }
  }
  for (const [tag] of html.matchAll(/<(?:input|textarea)[^>]*\splaceholder="[^"]*"[^>]*>/g)) {
    const placeholder = tag.match(/\splaceholder="([^"]*)"/)[1];
    if (!fixedPlaceholders.has(placeholder)) {
      assert.match(tag, /data-i18n-placeholder="/, `placeholder "${placeholder}" has no data-i18n-placeholder`);
    }
  }
});

test('desktop aria-labels and titles are bound to translations in en and tr', () => {
  const translations = loadDesktopTranslations();
  const html = read(path.join(desktopDir, 'src', 'index.html'));
  const appSource = read(path.join(desktopDir, 'src', 'app.js'));
  const assertBound = (tag, attribute, binding) => {
    const key = tag.match(new RegExp(`\\s${binding}="([^"]+)"`))?.[1];
    assert.ok(key, `${attribute} without ${binding}: ${tag}`);
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  };

  const labelled = [...html.matchAll(/<[a-z][^>]*\saria-label="[^"]*"[^>]*>/g)].map(([tag]) => tag);
  assert.ok(labelled.length >= 20, String(labelled.length));
  labelled.forEach((tag) => assertBound(tag, 'aria-label', 'data-i18n-aria'));
  for (const [tag] of html.matchAll(/<[a-z][^>]*\stitle="[^"]*"[^>]*>/g)) {
    assertBound(tag, 'title', 'data-i18n-title');
  }
  // Built in app.js, an aria-label comes from t() as well.
  assert.deepEqual(appSource.match(/aria-label="(?!\$\{window\.t\()[^"]*"/g), null);
  assert.deepEqual(appSource.match(/setAttribute\('aria-label',(?!\s*window\.t\()[^)]*\)/g), null);

  // The overlay is its own window: same binding, through the translations script it loads itself.
  const overlayHtml = read(path.join(desktopDir, 'src', 'overlay.html'));
  const overlayLabelled = [...overlayHtml.matchAll(/<[a-z][^>]*\saria-label="[^"]*"[^>]*>/g)].map(([tag]) => tag);
  assert.ok(overlayLabelled.length >= 2, String(overlayLabelled.length));
  overlayLabelled.forEach((tag) => assertBound(tag, 'aria-label', 'data-i18n-aria'));
  for (const [tag] of overlayHtml.matchAll(/<[a-z][^>]*\stitle="[^"]*"[^>]*>/g)) {
    assertBound(tag, 'title', 'data-i18n-title');
  }
  assert.match(overlayHtml, /<script src="modules\/translations\.js"><\/script>/);
  assert.deepEqual(read(path.join(desktopDir, 'src', 'overlay.js')).match(/aria-label/g), null);
});

test('image alt text is never hard-coded: decorative images are empty, game art takes its name from data', () => {
  for (const file of ['index.html', 'overlay.html']) {
    assert.deepEqual(read(path.join(desktopDir, 'src', file)).match(/<img[^>]*\salt="[^"]+"[^>]*>/g), null, file);
  }
  for (const file of ['app.js', 'overlay.js']) {
    const source = read(path.join(desktopDir, 'src', file));
    assert.deepEqual(source.match(/\salt="[^"$][^"]*"/g), null, file);
    assert.deepEqual(source.match(/\.alt\s*=[^;\n]*(?:'[^'\r\n]+'|`[^`\r\n]+`)/g), null, file);
  }
});

test('applyTranslations gives the index.html aria-labels the current language', () => {
  const html = read(path.join(desktopDir, 'src', 'index.html'));
  const labelled = [...html.matchAll(/<[a-z][^>]*\saria-label="[^"]*"[^>]*>/g)].map(([tag]) => {
    const attributes = { id: tag.match(/\sid="([^"]*)"/)?.[1], 'data-i18n-aria': tag.match(/\sdata-i18n-aria="([^"]*)"/)?.[1] };
    return { attributes, getAttribute: (name) => attributes[name], setAttribute: (name, value) => { attributes[name] = value; } };
  });
  const labelOf = (id) => labelled.find((element) => element.attributes.id === id).attributes['aria-label'];

  for (const [language, minimize, maximize, close, drawerClose, sessionGame] of [
    ['en', 'Minimize', 'Maximize', 'Close', 'Close', 'Filter sessions by game'],
    ['tr', 'Kucult', 'Buyut', 'Kapat', 'Kapat', "Session'lari oyuna gore filtrele"]
  ]) {
    const context = vm.createContext({
      window: { _appState: { language } },
      document: { querySelectorAll: (selector) => (selector === '[data-i18n-aria]' ? labelled : []), documentElement: {} },
      console,
    });
    vm.runInContext(read(path.join(desktopDir, 'src', 'modules', 'translations.js')), context);

    context.window.applyTranslations();

    assert.equal(labelOf('win-minimize'), minimize);
    assert.equal(labelOf('win-maximize'), maximize);
    assert.equal(labelOf('win-close'), close);
    assert.equal(labelOf('session-drawer-close'), drawerClose);
    assert.equal(labelOf('session-version-filter'), sessionGame);
  }
  // The markup's own text is what shows before the first pass, and it is not Turkish.
  assert.doesNotMatch(html, /aria-label="(?:Ana navigasyon|Kucult|Buyut|Kapat)"/);
});

test('the Vaal and Runegraft rail tabs have their strings in en and tr', () => {
  const translations = loadDesktopTranslations();
  for (const language of ['en', 'tr']) {
    assert.equal(translations[language]['category.vaal'], 'Vaal');
    assert.equal(translations[language]['category.runegraft'], 'Runegraft');
  }
});

test('the Turkish UI does not get Turkish case mapping on its ASCII-folded uppercase labels', () => {
  // Chromium uppercases i to a dotted capital I under lang=tr; the tr copy has no dotless i, so it renders as en.
  for (const [language, expected] of [['tr', 'en'], ['en', 'en'], ['de', 'de']]) {
    const documentElement = { lang: '' };
    const context = vm.createContext({
      window: { _appState: { language } },
      document: { querySelectorAll: () => [], documentElement },
      console,
    });
    vm.runInContext(read(path.join(desktopDir, 'src', 'modules', 'translations.js')), context);

    context.window.applyTranslations();

    assert.equal(documentElement.lang, expected, language);
  }
});

test('retired toast keys are gone from every locale', () => {
  const translations = loadDesktopTranslations();
  const retiredKeys = [
    'toast.loginSuccess', 'toast.loginFailed', 'toast.registerSuccess', 'toast.registerFailed', 'login.title', 'register.title',
    'toast.mapEnteredTitle', 'toast.mapEnteredBody', 'toast.mapExitedTitle', 'toast.mapExitedBody',
    'toast.sessionStartedTitle', 'toast.sessionStartedBody', 'toast.sessionCompletedTitle', 'toast.sessionProfitBody',
    'toast.sessionLossBody', 'toast.currencyTitle', 'toast.poeTitle', 'toast.poeDisconnected', 'toast.settingsSaved',
    'toast.connectionSuccess', 'toast.connectionFailed', 'toast.onlineSignedIn', 'toast.sessionUpdated',
    'toast.sessionError', 'toast.endSessionError', 'toast.serverUnavailable', 'toast.diagnosticsExported',
    'currency.syncSuccess', 'game.detected',
    'toast.error', 'toast.lootAddedTitle', 'toast.scanComplete', 'toast.scanError'
  ];
  const appSource = read(path.join(desktopDir, 'src', 'app.js'));

  for (const key of retiredKeys) {
    for (const [localeCode, dictionary] of Object.entries(translations)) {
      assert.equal(dictionary[key], undefined, `${localeCode} still defines ${key}`);
    }
    assert.ok(!appSource.includes(`'${key}'`), `app.js still uses ${key}`);
  }
});

test('main process dialogs use keys that exist in en and tr', () => {
  // main.js t() falls back to the raw key, so a typo would show 'dataClearLogsTitle' in a dialog.
  const mainSource = read(path.join(desktopDir, 'main.js'));
  const start = mainSource.indexOf('const MAIN_PROCESS_TRANSLATIONS = {');
  const end = mainSource.indexOf('\n};', start);
  const translations = vm.runInNewContext(
    `(${mainSource.slice(start + 'const MAIN_PROCESS_TRANSLATIONS = '.length, end + 2)})`
  );
  const enKeys = Object.keys(translations.en);

  assert.deepEqual(Object.keys(translations.tr).sort(), [...enKeys].sort());
  for (const [, key] of mainSource.matchAll(/[^\w.]t\(\s*'([A-Za-z0-9]+)'/g)) {
    assert.ok(translations.en[key], `Missing main process string for ${key}`);
  }
  // Keys are never built at runtime: the only t( without a string literal is the definition.
  assert.deepEqual(
    [...mainSource.matchAll(/[^\w.]t\(\s*[^'\s]/g)].map((match) => mainSource.slice(match.index + 1, match.index + 19)),
    ['t(key, values = {}']
  );
  for (const key of enKeys.filter((name) => name.startsWith('data'))) {
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
  }
  for (const key of [
    'dataClearLogsTitle', 'dataClearLogsMessage', 'dataClearLogsDetail', 'dataClearLogsConfirm', 'promptCancel',
    'dataNewJournalTitle', 'dataNewJournalMessage', 'dataNewJournalDetail', 'dataNewJournalConfirm'
  ]) {
    assert.ok(translations.en[key], `Missing en main process string for ${key}`);
    assert.ok(translations.tr[key], `Missing tr main process string for ${key}`);
  }
  // OS notifications name the outcome; the generic titles and the dropped notices are gone.
  for (const key of [
    'notificationError', 'notificationInfo', 'notificationMapStarted', 'notificationMapCompleted', 'mapStartedBody',
    'mapProfit', 'mapLoss', 'gameDetected', 'gameSwitched', 'stashNoItems'
  ]) {
    assert.equal(translations.en[key], undefined, `en still defines ${key}`);
    assert.equal(translations.tr[key], undefined, `tr still defines ${key}`);
  }
  for (const key of [
    'scanNoMapTitle', 'noActiveSession', 'scanFailedTitle', 'screenCaptureFailed', 'scanNothingTitle', 'scanNoItems',
    'lootScanFailed', 'sessionStartFailed', 'sessionEndFailed', 'notificationTryAgain', 'mapProfitBody', 'mapLossBody',
    'mapDuration', 'mapDurationSeconds', 'mapNoLootBody', 'promptMessage', 'promptDetail', 'promptEndConfirm',
    'promptEndMessage', 'promptEndDetail', 'journalUnreadableBody'
  ]) {
    assert.ok(translations.en[key], `Missing en main process string for ${key}`);
    assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
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

test('custom farm type strings exist in en and in ASCII Turkish, for every colour and icon', () => {
  const translations = loadDesktopTranslations();
  const { CUSTOM_FARM_TYPE_COLORS, CUSTOM_FARM_TYPE_ICONS } = require('../src/modules/farmTypeModel');
  const appSource = read(path.join(desktopDir, 'src', 'app.js'));
  const html = read(path.join(desktopDir, 'src', 'index.html'));
  const staticKeys = [...`${appSource}\n${html}`.matchAll(/customFarm\.[A-Za-z]+/g)].map(([key]) => key);
  const keys = [
    ...new Set(staticKeys),
    ...CUSTOM_FARM_TYPE_COLORS.map((color) => `customFarm.color.${color}`),
    ...CUSTOM_FARM_TYPE_ICONS.map((icon) => `customFarm.icon.${icon}`)
  ];

  assert.ok(staticKeys.length > 15, String(staticKeys.length));
  const sameInBothLanguages = new Set(['customFarm.icon.farm-tablet']);
  for (const key of keys) {
    assert.ok(translations.en[key], `Missing en string for ${key}`);
    assert.ok(translations.tr[key], `Missing tr string for ${key}`);
    assert.match(translations.tr[key], /^[\x20-\x7e]+$/, `tr string for ${key} is not ASCII`);
    if (!sameInBothLanguages.has(key)) {
      assert.notEqual(translations.tr[key], translations.en[key], `tr falls back to en for ${key}`);
    }
  }
});
