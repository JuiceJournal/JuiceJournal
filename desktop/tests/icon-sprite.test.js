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
