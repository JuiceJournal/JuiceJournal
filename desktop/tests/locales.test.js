const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.join(__dirname, '..');
const srcDir = path.join(desktopDir, 'src');
const localesDir = path.join(srcDir, 'modules', 'locales');
const FILE_LOCALES = ['de', 'fr', 'es', 'it', 'pt-BR', 'ru', 'ja', 'ko', 'zh-CN', 'zh-TW'];
// The lines overlayStateModel builds; its own table has them for English and Turkish.
const OVERLAY_KEYS = [
  'unknownMap', 'noFarmType', 'chooseFarmType', 'activeMapSession', 'confirmDetectedMap', 'confirmMapStart',
  'characterSyncNeeded', 'lastPlayedCharacter', 'waitingForArea', 'level', 'closesIn', 'startsIn', 'elapsed', 'map',
  'total', 'minutes', 'seconds'
];
const OWN_SCRIPT = {
  ru: /[Ѐ-ӿ]/,
  ja: /[぀-ヿ一-鿿]/,
  ko: /[가-힯]/,
  'zh-CN': /[一-鿿]/,
  'zh-TW': /[一-鿿]/
};

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

// The window's dictionaries as a page builds them: the locale files first, then translations.js.
function loadWindow({ withLocaleFiles = true } = {}) {
  const window = {};
  const context = vm.createContext({ window, document: { querySelectorAll: () => [], documentElement: {} }, console });
  if (withLocaleFiles) {
    for (const code of FILE_LOCALES) {
      vm.runInContext(read(localesDir, `${code}.js`), context);
    }
  }
  vm.runInContext(read(srcDir, 'modules', 'translations.js'), context);
  return window;
}

function loadMainDictionaries() {
  const source = read(desktopDir, 'main.js');
  const start = source.indexOf('const MAIN_PROCESS_TRANSLATIONS = {');
  const end = source.indexOf('\n};', start) + 3;
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end).replace('const MAIN_PROCESS_TRANSLATIONS', 'globalThis.dictionaries'), context);
  return context.dictionaries;
}

const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(' ');
const paragraphs = (text) => String(text).split('|').length;

test('the language list names each language the way it writes itself', () => {
  const labels = Object.fromEntries(loadWindow().LocaleOptions.map((option) => [option.code, option.label]));
  assert.deepEqual(labels, {
    en: 'English',
    tr: 'Türkçe',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    'pt-BR': 'Português (Brasil)',
    ru: 'Русский',
    ja: '日本語',
    ko: '한국어',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文'
  });
});

test('every language has its own text for every window and main-process string', () => {
  const english = loadWindow({ withLocaleFiles: false }).Translations.en;
  const mainEnglish = loadMainDictionaries().en;

  for (const code of FILE_LOCALES) {
    const locale = require(path.join(localesDir, `${code}.js`));
    assert.deepEqual(Object.keys(locale.ui).sort(), Object.keys(english).sort(), `${code} window keys`);
    assert.deepEqual(Object.keys(locale.main).sort(), Object.keys(mainEnglish).sort(), `${code} main-process keys`);
    for (const [group, source] of [['ui', english], ['main', mainEnglish]]) {
      for (const [key, value] of Object.entries(locale[group])) {
        assert.equal(typeof value, 'string', `${code} ${key}`);
        assert.ok(value.trim(), `${code} ${key} is empty`);
        assert.equal(placeholders(value), placeholders(source[key]), `${code} ${key} placeholders`);
        assert.equal(paragraphs(value), paragraphs(source[key]), `${code} ${key} paragraphs`);
        assert.doesNotMatch(value, /[\r\n\t]/, `${code} ${key} has a line break`);
      }
    }
    assert.deepEqual(Object.keys(locale.overlay), OVERLAY_KEYS, `${code} overlay lines`);
    for (const [key, value] of Object.entries(locale.overlay)) {
      assert.ok(typeof value === 'string' && value.trim(), `${code} overlay ${key}`);
    }
    assert.equal(placeholders(locale.overlay.closesIn), '{seconds}', `${code} closesIn`);
    assert.equal(placeholders(locale.overlay.startsIn), '{seconds}', `${code} startsIn`);
    assert.equal(placeholders(locale.overlay.elapsed), '{time}', `${code} elapsed`);
    // Names, units and a few shared words may match English; a language that mostly does was not translated.
    const same = Object.keys(english).filter((key) => locale.ui[key] === english[key]).length;
    assert.ok(same < Object.keys(english).length * 0.15, `${code} has ${same} strings identical to English`);
  }
});

test('Turkish keeps the placeholders and paragraphs of the English strings', () => {
  const { Translations } = loadWindow({ withLocaleFiles: false });
  const main = loadMainDictionaries();
  for (const [dictionary, source] of [[Translations.tr, Translations.en], [main.tr, main.en]]) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(source).sort());
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(placeholders(value), placeholders(source[key]), `tr ${key} placeholders`);
      assert.equal(paragraphs(value), paragraphs(source[key]), `tr ${key} paragraphs`);
    }
  }
});

test('languages with their own script are written in it, not transliterated', () => {
  for (const [code, script] of Object.entries(OWN_SCRIPT)) {
    const { ui, main } = require(path.join(localesDir, `${code}.js`));
    const values = [...Object.values(ui), ...Object.values(main)];
    const inScript = values.filter((value) => script.test(value)).length;
    assert.ok(inScript > values.length * 0.85, `${code}: ${inScript} of ${values.length} strings use its script`);
  }
  const simplified = require(path.join(localesDir, 'zh-CN.js')).ui;
  const traditional = require(path.join(localesDir, 'zh-TW.js')).ui;
  const differing = Object.keys(simplified).filter((key) => simplified[key] !== traditional[key]).length;
  assert.ok(differing > Object.keys(simplified).length * 0.5, 'Traditional Chinese is not a copy of Simplified');
});

test('the window shows a language from its file, and English for a language whose file did not load', () => {
  const loaded = loadWindow();
  const german = require(path.join(localesDir, 'de.js')).ui;
  loaded._appState = { language: 'de' };
  assert.equal(loaded.t('nav.settings'), german['nav.settings']);
  assert.notEqual(loaded.t('nav.settings'), loaded.Translations.en['nav.settings']);

  const bare = loadWindow({ withLocaleFiles: false });
  bare._appState = { language: 'de' };
  assert.equal(bare.t('nav.settings'), bare.Translations.en['nav.settings']);
});

test('a name kept in English inside another language is marked English, so its capitals stay English', () => {
  // Under lang=tr an uppercase label turns i into a dotted capital: right for Turkish words, wrong for "Farming Hub".
  const element = (key) => {
    const attributes = { 'data-i18n': key };
    return {
      textContent: '',
      attributes,
      getAttribute: (name) => attributes[name],
      setAttribute: (name, value) => { attributes[name] = value; },
      removeAttribute: (name) => { delete attributes[name]; }
    };
  };
  const hub = element('nav.farmingHub');
  const settings = element('nav.settings');
  const window = {};
  const context = vm.createContext({
    window,
    document: {
      querySelectorAll: (selector) => (selector === '[data-i18n]' ? [hub, settings] : []),
      documentElement: {}
    },
    console
  });
  vm.runInContext(read(srcDir, 'modules', 'translations.js'), context);

  window._appState = { language: 'tr' };
  window.applyTranslations();
  assert.equal(hub.textContent, 'Farming Hub');
  assert.equal(hub.attributes.lang, 'en');
  assert.equal(settings.textContent, 'Ayarlar');
  assert.equal('lang' in settings.attributes, false);

  window._appState = { language: 'en' };
  window.applyTranslations();
  assert.equal('lang' in hub.attributes, false);

  const html = read(srcDir, 'index.html');
  assert.match(html, /<h1 lang="en">Juice Journal<\/h1>/);
  assert.match(html, /<span lang="en">Juice Journal<\/span>/);
});

test('both pages load every language file before the translations module', () => {
  for (const page of ['index.html', 'overlay.html']) {
    const scripts = [...read(srcDir, page).matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
    const translationsAt = scripts.indexOf('modules/translations.js');
    assert.notEqual(translationsAt, -1, page);
    for (const code of FILE_LOCALES) {
      const at = scripts.indexOf(`modules/locales/${code}.js`);
      assert.ok(at !== -1 && at < translationsAt, `${page} loads ${code} before translations.js`);
    }
  }
});

test('the main process speaks every language in the list, and English for one it does not know', () => {
  const source = read(desktopDir, 'main.js');
  const list = source.match(/for \(const code of (\[[^\]]+\])\) \{\r?\n  MAIN_PROCESS_TRANSLATIONS\[code\] = require\(`\.\/src\/modules\/locales\/\$\{code\}\.js`\)\.main;/);
  assert.ok(list, 'main.js loads the language files');
  assert.deepEqual(JSON.parse(list[1].replace(/'/g, '"')), FILE_LOCALES);

  const getLanguage = source.match(/function getLanguage\(\) \{[\s\S]*?\r?\n\}/)[0];
  const languageFor = (stored) => vm.runInNewContext(`${getLanguage}; getLanguage()`, {
    MAIN_PROCESS_TRANSLATIONS: { en: {}, tr: {}, de: {}, 'zh-TW': {} },
    store: { get: () => stored }
  });
  assert.equal(languageFor('de'), 'de');
  assert.equal(languageFor('zh-TW'), 'zh-TW');
  assert.equal(languageFor('tr'), 'tr');
  assert.equal(languageFor('xx'), 'en');
  assert.equal(languageFor('constructor'), 'en');
  assert.equal(languageFor(undefined), 'en');
});
