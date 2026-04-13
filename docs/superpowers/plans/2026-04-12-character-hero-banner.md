# Character Hero Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the desktop character summary card into a hero-style banner with a full-width character artwork background, circular portrait medallion, and compact `level / league / account / class` presentation.

**Architecture:** Extend the existing character visual model so it can return both `portraitPath` and `bannerPath`, then keep the renderer thin: it should only map normalized character/account state onto the banner surface. The dashboard card remains the same logical component, but its visual presentation becomes layered and art-driven rather than box-driven.

**Tech Stack:** Electron desktop renderer, existing dashboard HTML/CSS, existing `characterVisualModel`, `node:test`

---

## File Structure

- Modify: `desktop/src/modules/characterVisualModel.js`
  Purpose: return banner artwork metadata alongside portrait metadata and correct display labels for mapped classes.
- Modify: `desktop/src/index.html`
  Purpose: reshape the character card markup into a hero banner structure with portrait, heading, background host, and compact info row.
- Modify: `desktop/src/styles.css`
  Purpose: implement the hero banner layout, layered artwork background, medallion portrait, gradient readability mask, and responsive behavior.
- Modify: `desktop/src/app.js`
  Purpose: bind `bannerPath`, `bannerKey`, and compact info content into the redesigned card.
- Modify: `desktop/tests/character-visual-model.test.js`
  Purpose: validate portrait + banner mappings for PoE1 and PoE2 classes.
- Modify: `desktop/tests/dashboard-character-card.test.js`
  Purpose: validate renderer/banner DOM behavior and empty-state fallback.

---

### Task 1: Extend The Character Visual Model With Banner Artwork Metadata

**Files:**
- Modify: `desktop/src/modules/characterVisualModel.js`
- Modify: `desktop/tests/character-visual-model.test.js`

- [ ] **Step 1: Write the failing banner-mapping tests**

```js
test('character visual model returns both portrait and banner paths for PoE2 Monk2', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    className: 'Monk2'
  });

  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/monk.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/monk-invoker.jpg');
});

test('character visual model returns both portrait and banner paths for PoE1 Templar', () => {
  const visual = deriveCharacterVisual({
    name: 'JaylenBaliston',
    className: 'Templar'
  });

  assert.equal(visual.classLabel, 'Templar');
  assert.equal(visual.portraitPath, 'assets/characters/poe1/templar.jpg');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe1/templar.jpg');
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/character-visual-model.test.js`

Expected: FAIL because `bannerPath` is not yet returned.

- [ ] **Step 3: Implement minimal banner metadata support**

```js
const CLASS_VISUALS = {
  templar: {
    portraitKey: 'templar',
    bannerKey: 'templar',
    classLabel: 'Templar',
    portraitPath: 'assets/characters/poe1/templar.jpg',
    bannerPath: 'assets/characters/banners/poe1/templar.jpg'
  },
  monk: {
    portraitKey: 'monk',
    bannerKey: 'monk',
    classLabel: 'Monk',
    portraitPath: 'assets/characters/poe2/monk.png',
    bannerPath: 'assets/characters/banners/poe2/monk.jpg'
  }
};

const POE2_CLASS_VARIANTS = {
  monk2: {
    portraitKey: 'monk',
    bannerKey: 'monk-invoker',
    classLabel: 'Invoker',
    portraitPath: 'assets/characters/poe2/monk.png',
    bannerPath: 'assets/characters/banners/poe2/monk-invoker.jpg'
  }
};
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/character-visual-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/characterVisualModel.js desktop/tests/character-visual-model.test.js
git commit -m "feat: add character banner visual mappings"
```

### Task 2: Reshape The Character Card Markup Into A Hero Banner

**Files:**
- Modify: `desktop/src/index.html`
- Modify: `desktop/tests/dashboard-character-card.test.js`

- [ ] **Step 1: Write the failing hero-markup tests**

```js
test('dashboard html exposes hero banner targets for the character summary card', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="character-banner"/);
  assert.match(html, /id="character-banner-image"/);
  assert.match(html, /id="character-portrait-image"/);
  assert.match(html, /id="character-name"/);
  assert.match(html, /id="character-class"/);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: FAIL because the hero banner targets do not exist yet.

- [ ] **Step 3: Implement the minimal hero banner HTML**

```html
<div class="card character-card" id="character-summary-card" data-character-state="empty">
  <div class="character-banner" id="character-banner" data-character-tone="neutral">
    <img id="character-banner-image" alt="" hidden>
    <div class="character-banner-scrim"></div>
    <div class="character-hero">
      <div class="character-portrait-shell">
        <img id="character-portrait-image" alt="" hidden>
        <span id="character-portrait-badge">?</span>
        <strong id="character-level">—</strong>
      </div>
      <div class="character-hero-copy">
        <p class="character-status" id="character-status">Character sync needed</p>
        <div class="character-heading-row">
          <strong id="character-name">No character selected</strong>
          <span id="character-league">—</span>
          <span id="character-class">Unknown Class</span>
        </div>
        <div class="character-meta-grid">
          <div class="character-meta"><span>Level</span><strong id="character-level-meta">—</strong></div>
          <div class="character-meta"><span>League</span><strong id="character-league-meta">—</strong></div>
          <div class="character-meta"><span>Account</span><strong id="character-account">—</strong></div>
        </div>
      </div>
      <span class="card-badge" id="character-game-version">PoE</span>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/index.html desktop/tests/dashboard-character-card.test.js
git commit -m "feat: add hero banner character card markup"
```

### Task 3: Implement The Hero Banner Styling

**Files:**
- Modify: `desktop/src/styles.css`

- [ ] **Step 1: Write the failing style smoke assertion**

```js
test('character card stylesheet defines banner art and hero layout rules', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-banner/);
  assert.match(css, /\.character-banner-scrim/);
  assert.match(css, /\.character-hero/);
  assert.match(css, /\.character-portrait-shell/);
});
```

- [ ] **Step 2: Run test to verify red state**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: FAIL because the new hero banner classes do not exist yet.

- [ ] **Step 3: Implement the banner styles**

```css
.character-banner {
  position: relative;
  min-height: 228px;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(21, 17, 15, 0.98), rgba(10, 8, 8, 0.98));
}

.character-banner img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-banner-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(11, 9, 8, 0.94) 0%, rgba(11, 9, 8, 0.88) 34%, rgba(11, 9, 8, 0.58) 65%, rgba(11, 9, 8, 0.78) 100%),
    linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.42));
}

.character-hero {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 1.5rem;
  align-items: start;
  padding: 1.5rem;
}
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/styles.css desktop/tests/dashboard-character-card.test.js
git commit -m "feat: style the character hero banner"
```

### Task 4: Bind Banner Rendering In The Renderer

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/tests/dashboard-character-card.test.js`

- [ ] **Step 1: Write the failing renderer-binding tests**

```js
test('renderer fills hero banner image and portrait from normalized character visual state', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: { src: '', hidden: true, alt: '' },
    characterPortraitImage: { src: '', hidden: true, alt: '' },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLeague: { textContent: '' },
    characterAccount: { textContent: '' },
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
          league: 'Standard',
          poeVersion: 'poe2'
        }
      },
      detectedGameVersion: 'poe2',
      settings: { poeVersion: 'poe2' }
    },
    normalizePoeVersion: (value) => value,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'monk',
        bannerKey: 'monk-invoker',
        tone: 'azure',
        badgeText: 'M',
        classLabel: 'Invoker',
        portraitPath: 'assets/characters/poe2/monk.png',
        bannerPath: 'assets/characters/banners/poe2/monk-invoker.jpg'
      })
    }),
    window: {
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterBannerImage.hidden, false);
  assert.match(elements.characterBannerImage.src, /monk-invoker\.jpg$/);
  assert.equal(elements.characterPortraitImage.hidden, false);
  assert.match(elements.characterPortraitImage.src, /monk\.png$/);
  assert.equal(elements.characterClass.textContent, 'Invoker');
});
```

- [ ] **Step 2: Run test to verify red state**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: FAIL because banner rendering is not wired yet.

- [ ] **Step 3: Implement banner rendering**

```js
if (elements.characterBannerImage) {
  let bannerSource = visual.bannerPath || '';
  if (bannerSource && typeof URL === 'function' && window?.location?.href) {
    bannerSource = new URL(bannerSource, window.location.href).toString();
  }
  elements.characterBannerImage.hidden = !visual.bannerPath;
  elements.characterBannerImage.src = bannerSource;
  elements.characterBannerImage.alt = isReady ? `${summary.name} banner` : 'Character banner';
}
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/dashboard-character-card.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/tests/dashboard-character-card.test.js
git commit -m "feat: render character hero banner artwork"
```

## Self-Review

### Spec coverage

- full-width banner artwork: Task 1 and Task 4
- compact hero markup: Task 2
- no extra stats beyond level/league/account/class: Task 2 and Task 4
- crisp portrait + banner pairing: Task 1 and Task 3
- PoE1 and PoE2 mappings: Task 1

### Placeholder scan

- No `TODO`, `TBD`, or deferred notes remain.
- Every task includes exact file paths and runnable commands.
- Every behavior-changing step contains concrete code or assertions.

### Type consistency

- `portraitPath` and `bannerPath` remain the two stable rendering fields.
- `renderCharacterSummaryCard()` remains the renderer entry point.
- `bannerKey`, `portraitKey`, and `classLabel` remain aligned across visual model and renderer.
