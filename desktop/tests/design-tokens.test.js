const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;

test('stylesheet takes every UI color from tokens.css', () => {
  const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');

  assert.match(stylesCss, /@import url\('tokens\.css'\);/);
  assert.doesNotMatch(stylesCss, /:root\s*\{/);

  // Character class tones are portrait art colors, not theme colors.
  const withoutClassTones = stylesCss.replace(
    /[^{}]*data-character-tone="(?:ember|verdant|jade|violet)"[^{}]*\{[^}]*\}/g,
    ''
  );
  assert.deepEqual(withoutClassTones.match(COLOR_LITERAL) || [], []);
});

test('renderer markup and scripts use color tokens instead of literals', () => {
  for (const fileName of ['index.html', 'app.js']) {
    const source = fs.readFileSync(path.join(srcDir, fileName), 'utf8');
    assert.deepEqual(source.match(COLOR_LITERAL) || [], [], fileName);
  }
});
