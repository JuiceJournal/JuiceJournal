const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(desktopRoot, 'src', 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(desktopRoot, 'src', 'styles.css'), 'utf8');

function getCssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesCss.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}

test('currency page uses an integrated left market category list', () => {
  assert.match(indexHtml, /class="currency-market-layout"/);
  assert.match(indexHtml, /class="currency-type-panel"/);
  assert.match(indexHtml, /id="currency-type-filter" class="currency-type-tabs"/);
  assert.match(stylesCss, /\.currency-market-layout\s*\{[\s\S]*grid-template-columns:\s*172px minmax\(0,\s*1fr\)/);
  assert.match(stylesCss, /\.currency-type-tabs\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.doesNotMatch(getCssRule('.currency-type-panel'), /background:/);
});

test('currency category buttons avoid version accent side rails', () => {
  assert.doesNotMatch(getCssRule('.currency-type-btn.poe1-exclusive'), /border-left/);
  assert.doesNotMatch(getCssRule('.currency-type-btn.poe2-exclusive'), /border-left/);
});
