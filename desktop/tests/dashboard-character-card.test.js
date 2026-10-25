const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const stylesPath = path.join(desktopDir, 'src', 'styles.css');

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

test('dashboard html exposes hero banner targets for the character summary card', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="character-summary-card"/);
  assert.match(html, /class="character-banner"/);
  assert.match(html, /id="character-banner"/);
  assert.match(html, /id="character-banner-image"/);
  assert.match(html, /class="character-hero"/);
  assert.match(html, /class="character-hero-copy"/);
  assert.match(html, /class="character-portrait-shell"/);
  assert.match(html, /id="character-portrait-image"/);
  assert.match(html, /id="character-name"/);
  assert.match(html, /id="character-class"/);
  assert.match(html, /id="character-level"/);
  assert.match(html, /id="character-league"/);
});

test('character card stylesheet defines banner art and hero layout rules', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-banner/);
  assert.match(css, /\.character-banner-scrim/);
  assert.match(css, /\.character-hero/);
  assert.match(css, /\.character-portrait-shell/);
});

test('character portrait slot keeps PoE1 class art centered in a square circular crop', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-portrait-shell\s*\{[^}]*aspect-ratio:\s*1;/s);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*border-radius:\s*50%;/s);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*width:\s*100%;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*object-fit:\s*cover;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*object-position:\s*center top;/s);
});

test('character banner and portrait art are never recoloured', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  for (const selector of [/\.character-banner > img\s*\{[^}]*\}/, /\.character-portrait-shell img\s*\{[^}]*\}/]) {
    const [rule] = css.match(selector) || [''];
    assert.ok(rule, String(selector));
    assert.doesNotMatch(rule, /filter:/, rule);
  }
});

test('dashboard hero shows class, league and game chips instead of a meta grid', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /character-meta-grid|id="character-(level-meta|class-meta|account)"|data-i18n="dashboard\.characterSummary"/);
  assert.match(html, /id="character-summary-card" role="region" data-i18n-aria="dashboard\.characterSummary"/);

  const [chips] = html.match(/<div class="character-chips">[\s\S]*?<\/div>/) || [''];
  assert.match(chips, /id="character-class"/);
  assert.match(chips, /id="character-league"/);
  assert.match(chips, /id="character-game-version"/);
});

test('hero chips keep English casing for GGG names under any UI language', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // Uppercased under lang="tr", 'Witch' would read 'WİTCH'.
  for (const id of ['character-class', 'character-league', 'character-game-version']) {
    assert.match(html, new RegExp(`<span class="character-chip" id="${id}" lang="en">`), id);
  }
});

test('hero banner art is right-anchored, masked and slim', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  const [img] = css.match(/\.character-banner > img\s*\{[^}]*\}/) || [''];
  assert.match(img, /inset:\s*0 0 0 auto;/);
  assert.match(img, /width:\s*58%;/);
  assert.match(img, /mask-image:\s*linear-gradient\(90deg,\s*transparent/);
  assert.match(css, /\.character-banner\s*\{[^}]*min-height:\s*176px;/);
  assert.match(css, /\.character-hero\s*\{[^}]*min-height:\s*176px;/);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*width:\s*112px;/);
});

test('hero chips never blur the art behind them', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  const [chip] = css.match(/\.character-chip\s*\{[^}]*\}/) || [''];
  assert.ok(chip);
  assert.doesNotMatch(chip, /backdrop-filter|filter:/);
});

test('empty character card hides the class and league chips', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-card\[data-character-state="empty"\] :is\(#character-class, #character-league\)\s*\{\s*display:\s*none;/);
});

test('renderer fills hero banner artwork and chips from normalized account state', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
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
          className: 'Druid',
          ascendancy: 'Shaman',
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
        bannerKey: 'shaman',
        tone: 'ember',
        badgeText: 'S',
        classLabel: 'Shaman',
        baseClassLabel: 'Druid',
        portraitPath: 'assets/characters/poe2/shaman.png',
        bannerPath: 'assets/characters/banners/poe2/shaman.jpg'
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterSummaryCard.dataset.characterState, 'ready');
  assert.equal(elements.characterBanner.dataset.characterBanner, 'shaman');
  assert.equal(elements.characterBanner.dataset.characterTone, 'ember');
  assert.equal(elements.characterBannerImage.hidden, false);
  assert.equal(
    elements.characterBannerImage.src,
    'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/characters/banners/poe2/shaman.jpg'
  );
  assert.equal(elements.characterPortrait.dataset.characterPortrait, 'shaman');
  assert.equal(elements.characterPortrait.dataset.characterTone, 'ember');
  assert.equal(elements.characterPortraitImage.hidden, false);
  assert.equal(
    elements.characterPortraitImage.src,
    'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/characters/poe2/shaman.png'
  );
  assert.equal(elements.characterPortraitBadge.textContent, 'S');
  assert.equal(elements.characterPortraitBadge.style.display, 'none');
  assert.equal(elements.characterName.textContent, 'KocaGyVeMasha');
  assert.equal(elements.characterClass.textContent, 'Shaman · Druid');
  assert.equal(elements.characterLevel.textContent, '96');
  assert.equal(elements.characterLeague.textContent, 'Fate of the Vaal');
  assert.equal(elements.characterGameVersion.textContent, 'PoE 2');
});

test('renderer keeps the last detected game character badge when no game is active', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
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
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'Esquetta#4179',
        activePoeVersion: 'poe2',
        summary: {
          status: 'ready',
          name: 'KocaAyVeMasha',
          level: 96,
          className: 'Druid',
          ascendancy: 'Shaman',
          league: 'Fate of the Vaal',
          poeVersion: 'poe2'
        }
      },
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe1',
        lastDetectedPoeVersion: 'poe2'
      }
    },
    window: {
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'shaman',
        bannerKey: 'shaman',
        tone: 'ember',
        badgeText: 'S',
        classLabel: 'Shaman',
        baseClassLabel: 'Druid',
        portraitPath: 'assets/characters/poe2/shaman.png',
        bannerPath: 'assets/characters/banners/poe2/shaman.jpg'
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterGameVersion.textContent, 'PoE 2');
  assert.equal(elements.characterName.textContent, 'KocaAyVeMasha');
  assert.equal(elements.characterPortrait.dataset.characterPortrait, 'shaman');
});

test('renderer keeps hero text current when character art is unavailable', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
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
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'Esquetta#4179',
        summary: {
          status: 'ready',
          name: 'KELLEE',
          level: 92,
          className: 'Monk2',
          league: 'Standard'
        }
      },
      detectedGameVersion: 'poe2',
      settings: { poeVersion: 'poe2' }
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
        portraitKey: 'invoker',
        bannerKey: 'invoker',
        tone: 'azure',
        badgeText: 'I',
        classLabel: 'Invoker',
        baseClassLabel: 'Monk',
        portraitPath: '',
        bannerPath: ''
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterSummaryCard.dataset.characterState, 'ready');
  assert.equal(elements.characterBanner.dataset.characterBanner, 'invoker');
  assert.equal(elements.characterBanner.dataset.characterTone, 'azure');
  assert.equal(elements.characterBannerImage.hidden, true);
  assert.equal(elements.characterPortraitImage.hidden, true);
  assert.equal(elements.characterPortraitBadge.textContent, 'I');
  assert.notEqual(elements.characterPortraitBadge.style.display, 'none');
  assert.equal(elements.characterName.textContent, 'KELLEE');
  assert.equal(elements.characterClass.textContent, 'Invoker · Monk');
  assert.equal(elements.characterLevel.textContent, '92');
  assert.equal(elements.characterLeague.textContent, 'Standard');
});

test('renderer empty state shows em dashes and Unknown Class', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterClass: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard'], {
    elements,
    state: { account: null },
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({ badgeText: '?', classLabel: 'Unknown Class' })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterLevel.textContent, '—');
  assert.equal(elements.characterLeague.textContent, '—');
  assert.equal(elements.characterClass.textContent, 'Unknown Class');
  assert.equal(elements.characterSummaryCard.dataset.characterState, 'empty');
});

test('renderer shows only the class for an unascended character', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterClass: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard'], {
    elements,
    state: {
      account: {
        summary: { status: 'ready', name: 'Base', level: 12, className: 'Ranger', league: 'Standard' }
      }
    },
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({ classLabel: 'Ranger', baseClassLabel: 'Ranger', badgeText: 'R' })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterClass.textContent, 'Ranger');
});
