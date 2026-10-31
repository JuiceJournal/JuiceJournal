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
    'toast.dismiss', 'toast.mapProfit', 'toast.mapLoss', 'toast.mapUnpriced',
    'toast.tryAgain', 'toast.tryAgainShort', 'toast.restartHint',
    'toast.settingsLoadFailed', 'toast.settingsError', 'toast.settingsReset', 'toast.settingsResetFailed',
    'settings.savedState', 'settings.connectionFailed',
    'settings.hotkeyErrorRequired', 'settings.hotkeyErrorModifierOnly', 'settings.hotkeyErrorOneKey',
    'settings.hotkeyErrorDuplicate', 'settings.hotkeyErrorInUse',
    'toast.mapStartFailed', 'toast.mapEndFailed', 'toast.poeConnectFailed', 'toast.poeDisconnectError',
    'login.failedTitle', 'login.failedInline', 'login.failedHint', 'toast.serverSignInFailed',
    'toast.updateReadyTitle', 'toast.updateReadyBody', 'toast.updateRestart', 'toast.updateInstallFailed',
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
    'mapDuration', 'journalUnreadableBody'
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
