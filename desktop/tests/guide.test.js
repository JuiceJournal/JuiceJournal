const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { GUIDE_SECTIONS, buildGuide } = require('../src/modules/guideModel');

const srcDir = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

function loadTranslations() {
  const context = vm.createContext({ window: {}, document: {} });
  vm.runInContext(fs.readFileSync(path.join(srcDir, 'modules', 'translations.js'), 'utf8'), context);
  return context.window.Translations;
}

const translations = loadTranslations();
const translate = (language) => (key) => translations[language][key] || key;

test('every guide section and topic has its text in English and in Turkish', () => {
  const topics = GUIDE_SECTIONS.flatMap((section) => section.topics);
  assert.equal(new Set(topics).size, topics.length, 'a topic sits in one section only');

  for (const language of ['en', 'tr']) {
    const keys = [
      'nav.guide', 'guide.title', 'guide.intro', 'guide.search', 'guide.searchAria', 'guide.empty',
      ...GUIDE_SECTIONS.map((section) => `guide.section.${section.id}`),
      ...topics.flatMap((topic) => [`guide.${topic}.q`, `guide.${topic}.a`])
    ];
    for (const key of keys) {
      assert.equal(typeof translations[language][key], 'string', `${language} ${key}`);
      assert.notEqual(translations[language][key].trim(), '', `${language} ${key}`);
    }
  }

  // No text is left behind for a topic that is gone.
  const known = new Set(topics);
  for (const key of Object.keys(translations.en)) {
    const match = key.match(/^guide\.([A-Za-z0-9]+)\.[qa]$/);
    if (match) assert.ok(known.has(match[1]), `${key} belongs to no section`);
  }
});

test('the guide shows every section, with each answer split into its paragraphs', () => {
  const guide = buildGuide(translate('en'));

  assert.deepEqual(guide.map((section) => section.id), GUIDE_SECTIONS.map((section) => section.id));
  assert.equal(guide[0].title, 'Getting started');
  const firstMap = guide[0].topics[0];
  assert.equal(firstMap.question, 'How do I track my first map?');
  assert.equal(firstMap.paragraphs.length, 3);
  assert.ok(firstMap.paragraphs.every((paragraph) => !paragraph.includes('|')));
});

test('a search keeps the topics that hold every word, in the question, the answer or the section title', () => {
  const ids = (language, query) => buildGuide(translate(language), query).flatMap((section) => section.topics.map((topic) => topic.id));

  assert.deepEqual(ids('en', 'add farm type icon'), ['customFarm']);
  assert.deepEqual(ids('en', '  ENTRY   cost  ').includes('entryCost'), true);
  assert.deepEqual(ids('en', 'F9'), ['inventory', 'hotkeys']);
  // A word of the section title finds the whole section.
  assert.deepEqual(ids('en', 'overlay').slice(-3), ['overlayOn', 'startCard', 'overlayKeyboard']);
  assert.deepEqual(ids('tr', 'farm tipi ekle'), ['customFarm', 'startCard']);
  assert.deepEqual(ids('en', 'no such word here'), []);
  // Sections left without a topic are dropped.
  assert.deepEqual(buildGuide(translate('en'), 'F9').map((section) => section.id), ['loot', 'help']);
});

test('a search finds words whatever their accents or their Turkish i, typed either way', () => {
  const texts = {
    'guide.section.start': 'İlk adımlar',
    'guide.firstMap.q': 'Français, Español',
    'guide.firstMap.a': 'Işık açık'
  };
  const found = (query) => buildGuide((key) => texts[key] || key, query).flatMap((section) => section.topics.map((topic) => topic.id));

  for (const query of ['ilk', 'İLK', 'adimlar', 'francais', 'ESPANOL', 'isik', 'ışık', 'acik']) {
    assert.ok(found(query).includes('firstMap'), query);
  }
  assert.deepEqual(found('deutsch'), []);
});

test('the app has a Guide tab and page, and loads the guide after the app script', () => {
  assert.match(html, /<button class="nav-btn" data-page="guide">[\s\S]*?data-i18n="nav\.guide"/);
  assert.match(html, /<section id="guide-page" class="page">/);
  for (const id of ['guide-search', 'guide-list', 'guide-empty']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.indexOf('modules/guideModel.js') < scripts.indexOf('guide.js'));
  // guide.js wraps applyTranslations, which the app calls, so it comes last.
  assert.equal(scripts.at(-1), 'guide.js');
});
