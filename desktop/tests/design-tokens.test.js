const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

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

test('corners are bevels from the shape tokens', () => {
  const overlayHtml = fs.readFileSync(path.join(srcDir, 'overlay.html'), 'utf8');
  const sources = {
    'styles.css': stripComments(fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8')),
    'overlay.html': stripComments(overlayHtml.slice(overlayHtml.indexOf('<style>'), overlayHtml.indexOf('</style>')))
  };

  for (const [fileName, css] of Object.entries(sources)) {
    // clip-path chamfers cut borders and focus rings off the diagonal; corner-shape draws them along it.
    assert.doesNotMatch(css, /clip-path\s*:/, fileName);
    assert.match(css, /corner-shape:\s*var\(--corner-shape\)/, fileName);

    for (const [, value] of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      assert.match(value, /^(var\(--bevel(-xs|-sm|-lg)?\)|inherit|50%)$/, `${fileName}: border-radius ${value}`);
    }
  }
});

test('circles opt out of the bevel', () => {
  const stylesCss = stripComments(fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8'));
  const circleRules = stylesCss.match(/[^{}]*\{[^}]*border-radius:\s*50%[^}]*\}/g) || [];
  assert.ok(circleRules.length > 0);
  for (const rule of circleRules) {
    assert.match(rule, /corner-shape:\s*round/, rule.slice(0, rule.indexOf('{')).trim());
  }

  const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
  const inlineCircles = appJs.match(/border-radius:\s*50%;?[^"']*/g) || [];
  for (const style of inlineCircles) {
    assert.match(style, /corner-shape:\s*round/, style);
  }
});

test('renderer markup and scripts use color tokens instead of literals', () => {
  for (const fileName of ['index.html', 'app.js']) {
    const source = fs.readFileSync(path.join(srcDir, fileName), 'utf8');
    assert.deepEqual(source.match(COLOR_LITERAL) || [], [], fileName);
  }
});

test('disabled buttons share one dimmed state and lose their hover', () => {
  const stylesCss = stripComments(fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8'));
  // Busy buttons are disabled too, but stay at full strength next to their spinner.
  const disabledRule = stylesCss.match(/\.btn:disabled:not\(\[aria-busy="true"\]\),\s*\.btn\[aria-disabled="true"\]\s*\{([^}]*)\}/);

  assert.ok(disabledRule, 'expected one .btn:disabled:not([aria-busy="true"]), .btn[aria-disabled="true"] rule');
  assert.match(disabledRule[1], /cursor:\s*not-allowed;/);
  assert.match(disabledRule[1], /opacity:\s*0?\.42;/);
  assert.match(disabledRule[1], /filter:\s*saturate\(0?\.25\);/);
  assert.match(disabledRule[1], /box-shadow:\s*inset 0 0 0 1px var\(--line\);/);
  assert.match(disabledRule[1], /transform:\s*none;/);
  assert.deepEqual(stylesCss.match(/\.btn-[a-z-]+:disabled/g) || [], []);

  for (const [selector] of stylesCss.matchAll(/\.btn-[a-z-]+:hover[^{,]*/g)) {
    assert.match(selector, /:not\(:disabled\)/, selector.trim());
  }
});

test('busy Path of Exile buttons spin in their flask tile, other buttons in place of their leading icon', () => {
  const stylesCss = stripComments(fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8'));

  // One spinner per button: the generic ::before skips .btn-poe, whose tile shows it instead of the flask.
  assert.match(stylesCss, /\.btn\[aria-busy="true"\]:not\(\.btn-poe\)::before,\s*\.btn-poe\[aria-busy="true"\] \.btn-glyph-brand::before\s*\{/);
  assert.match(stylesCss, /\.btn-poe\[aria-busy="true"\] \.btn-glyph-brand img\s*\{\s*display:\s*none;/);
  assert.match(stylesCss, /\.btn\[aria-busy="true"\]:not\(\.btn-poe\) > \.icon:first-child\s*\{\s*display:\s*none;/);
});
