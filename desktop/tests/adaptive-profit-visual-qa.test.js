const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const visualQaSpecPath = path.join(desktopRoot, 'e2e', 'adaptive-profit-visual-qa.spec.js');

test('adaptive profit visual QA has reproducible screenshot coverage for all target surfaces', () => {
  assert.equal(
    fs.existsSync(visualQaSpecPath),
    true,
    'Expected desktop/e2e/adaptive-profit-visual-qa.spec.js to define the visual QA screenshot harness'
  );

  const spec = fs.readFileSync(visualQaSpecPath, 'utf8');

  for (const screenshotName of [
    'character-hero.png',
    'adaptive-profit-dashboard.png',
    'adaptive-profit-sessions.png',
    'adaptive-profit-stash-result.png',
    'adaptive-profit-overlay.png'
  ]) {
    assert.match(spec, new RegExp(`testInfo\\.outputPath\\('${screenshotName}'\\)`));
  }

  for (const selector of [
    '#character-summary-card',
    '#last-map-result-card',
    '#sessions-page',
    '#stash-profit-result',
    '[data-overlay-state="visible"]'
  ]) {
    assert.match(spec, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
