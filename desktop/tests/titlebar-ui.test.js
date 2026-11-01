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

  // Any fixed layer that sets a top edge must start at the title bar's height; bottom-anchored ones set none.
  for (const [rule] of stylesCss.matchAll(/[^{}]*\{[^}]*position:\s*fixed[^}]*\}/g)) {
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    for (const [, value] of rule.matchAll(/(?<![-\w])(?:inset|top)\s*:\s*([^;}]+)/g)) {
      assert.match(value, /var\(--header-height\)/, `${selector} covers the title bar`);
    }
  }
});

test('the title bar offers only the window controls while any modal is open', () => {
  // Modals no longer cover the title bar, so the nav and Logout must not stay clickable behind them.
  // The login modal has no close button, so the window controls are the only way out.
  assert.match(
    stylesCss,
    /body:has\(\.modal:not\(\.hidden\)\)\s*:is\(\.nav,\s*#logout-btn\)\s*\{\s*visibility:\s*hidden;\s*\}/
  );
});

test('the title bar fits at the minimum window width', () => {
  // The account name shrinks with an ellipsis, so a long name or locale never pushes the close button off.
  assert.match(getTopLevelRule('.user-info'), /min-width:\s*0;/);
  const username = getTopLevelRule('.user-info > span');
  assert.match(username, /min-width:\s*0;/);
  assert.match(username, /text-overflow:\s*ellipsis;/);
  assert.match(username, /white-space:\s*nowrap;/);
  assert.match(getTopLevelRule('.window-controls'), /flex-shrink:\s*0;/);
});

test('the icon-only Logout button keeps a translated tooltip', () => {
  // Below 1360 px only the sign-out glyph shows, so sighted users get the label as a tooltip.
  const html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const translationsJs = fs.readFileSync(path.join(srcDir, 'modules', 'translations.js'), 'utf8');
  assert.match(html, /id="logout-btn"[^>]*data-i18n-title="user\.logout"/);
  assert.ok(translationsJs.includes("querySelectorAll('[data-i18n-title]')"));
});
