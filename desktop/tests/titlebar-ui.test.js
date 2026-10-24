const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(srcDir, 'tokens.css'), 'utf8');

function getTopLevelRule(selector) {
  const index = stylesCss.indexOf(`\n${selector} {`);
  assert.ok(index > 0, `Expected a top-level ${selector} rule`);
  return stylesCss.slice(index, stylesCss.indexOf('}', index) + 1);
}

test('the title bar height comes from one token', () => {
  assert.match(tokensCss, /--header-height:\s*56px;/);
  assert.match(getTopLevelRule('.header'), /height:\s*var\(--header-height\);/);
});

test('the session drawer and modals start below the title bar', () => {
  // The title bar is the frameless window's drag region and holds minimize, maximize and close.
  for (const selector of ['.session-drawer', '.modal']) {
    assert.match(getTopLevelRule(selector), /inset:\s*var\(--header-height\) 0 0 0;/, selector);
  }

  for (const [rule] of stylesCss.matchAll(/[^{}]*\{[^}]*position:\s*fixed[^}]*\}/g)) {
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    assert.doesNotMatch(rule, /inset:\s*0;|top:\s*0;/, `${selector} covers the title bar`);
  }
});

test('the title bar offers only the window controls while the login modal is open', () => {
  // The login modal has no close button, so the window controls are the only way out.
  assert.match(
    stylesCss,
    /body:has\(#login-modal:not\(\.hidden\)\) :is\(\.nav, #logout-btn\) \{\s*visibility: hidden;\s*\}/
  );
});
