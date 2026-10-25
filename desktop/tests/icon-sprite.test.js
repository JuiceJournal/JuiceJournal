const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const sprite = fs.readFileSync(path.join(srcDir, 'assets', 'icons.svg'), 'utf8');
const indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');

test('every sprite icon reference resolves to a symbol in icons.svg', () => {
  const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
  const references = [...`${indexHtml}\n${appJs}`.matchAll(/assets\/icons\.svg#([\w-]+)/g)].map((match) => match[1]);

  assert.ok(references.length > 0, 'Expected sprite references in the renderer');
  for (const id of references) {
    assert.ok(symbols.has(id), `Missing sprite symbol #${id}`);
  }
});

test('renderer icons come from the sprite instead of inline paths', () => {
  // Window caption buttons mirror the OS controls and stay inline.
  const withoutCaptionButtons = indexHtml.replace(/<div class="window-controls">[\s\S]*?<\/div>/, '');

  for (const source of [withoutCaptionButtons, appJs]) {
    for (const svg of source.match(/<svg[\s\S]*?<\/svg>/g) || []) {
      assert.match(svg, /<use href="assets\/icons\.svg#[\w-]+"\/>/, svg.slice(0, 80));
    }
  }
});

test('buttons with an icon keep their translated text in a label span', () => {
  // applyTranslations sets textContent on every [data-i18n] element, which would wipe a button's icon.
  for (const [button, openTag] of indexHtml.matchAll(/(<button\b[^>]*>)[\s\S]*?<\/button>/g)) {
    if (!/<svg|<img/.test(button)) continue;
    assert.doesNotMatch(openTag, /data-i18n=/, openTag);
  }
});

test('selected toggles say so with aria-pressed as well as .active', () => {
  const toggles = [...indexHtml.matchAll(/<button class="(?:poe-toggle-btn|version-btn)( active)?"[^>]*>/g)];
  assert.equal(toggles.length, 4);
  for (const [tag, active] of toggles) {
    assert.match(tag, active ? /aria-pressed="true"/ : /aria-pressed="false"/, tag);
  }
});

test('sign-out buttons share one ghost look and the Path of Exile buttons share the flask tile', () => {
  const buttonById = (id) => indexHtml.match(new RegExp(`<button[^>]*id="${id}"[^>]*>[\\s\\S]*?</button>`))[0];

  for (const id of ['logout-btn', 'poe-disconnect-btn', 'online-sign-out']) {
    const button = buttonById(id);
    assert.match(button, /class="btn btn-ghost/, id);
    assert.match(button, /assets\/icons\.svg#sign-out/, id);
  }

  for (const id of ['poe-oauth-login', 'character-connect-btn', 'poe-connect-btn']) {
    const button = buttonById(id);
    assert.match(button, /class="btn btn-primary[^"]*\bbtn-poe\b/, id);
    assert.match(button, /assets\/brand\/mark-small\.svg/, id);
    assert.match(button, /assets\/icons\.svg#external/, id);
  }

  assert.match(buttonById('online-sign-in'), /assets\/icons\.svg#sign-in/);
});
