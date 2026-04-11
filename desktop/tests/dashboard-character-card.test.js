const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const startIndex = source.indexOf(signature);

  if (startIndex === -1) {
    assert.fail(`Expected app.js to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;

  for (let index = startIndex + signature.length; index < source.length; index += 1) {
    const char = source[index];

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }

    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in app.js`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from app.js`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('dashboard html includes a character summary card with portrait fields', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="character-summary-card"/);
  assert.match(html, /id="character-portrait"/);
  assert.match(html, /id="character-portrait-image"/);
  assert.match(html, /id="character-name"/);
  assert.match(html, /id="character-class"/);
  assert.match(html, /id="character-level"/);
  assert.match(html, /id="character-league"/);
});

test('renderer fills character summary card from normalized account state', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterPortrait: { dataset: {} },
    characterPortraitImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterAccount: { textContent: '' },
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'KocaGyVeMasha',
        summary: {
          status: 'ready',
          name: 'KocaGyVeMasha',
          level: 96,
          className: 'Shaman',
          ascendancy: 'Ritualist',
          league: 'Fate of the Vaal'
        }
      },
      detectedGameVersion: 'poe2',
      settings: { poeVersion: 'poe1' }
    },
    window: {
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL,
    normalizePoeVersion: (value) => value,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'shaman',
        tone: 'ember',
        badgeText: 'S',
        classLabel: 'Shaman',
        portraitPath: 'assets/characters/poe2/druid-shaman.png'
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterSummaryCard.dataset.characterState, 'ready');
  assert.equal(elements.characterPortrait.dataset.characterPortrait, 'shaman');
  assert.equal(elements.characterPortrait.dataset.characterTone, 'ember');
  assert.equal(elements.characterPortraitImage.hidden, false);
  assert.equal(
    elements.characterPortraitImage.src,
    'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/characters/poe2/druid-shaman.png'
  );
  assert.equal(elements.characterPortraitBadge.textContent, 'S');
  assert.equal(elements.characterPortraitBadge.style.display, 'none');
  assert.equal(elements.characterName.textContent, 'KocaGyVeMasha');
  assert.equal(elements.characterClass.textContent, 'Shaman');
  assert.equal(elements.characterLevel.textContent, '96');
  assert.equal(elements.characterLeague.textContent, 'Fate of the Vaal');
  assert.equal(elements.characterAccount.textContent, 'KocaGyVeMasha');
  assert.equal(elements.characterGameVersion.textContent, 'PoE 2');
});
