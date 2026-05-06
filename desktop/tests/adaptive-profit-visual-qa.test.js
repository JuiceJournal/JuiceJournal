const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const visualQaSpecPath = path.join(desktopRoot, 'e2e', 'adaptive-profit-visual-qa.spec.js');
const gapRegisterPath = path.join(repoRoot, 'docs', 'farm-tracking-gap-register.md');

test('adaptive profit visual QA has reproducible screenshot coverage for all target surfaces', () => {
  assert.equal(
    fs.existsSync(visualQaSpecPath),
    true,
    'Expected desktop/e2e/adaptive-profit-visual-qa.spec.js to define the visual QA screenshot harness'
  );

  const spec = fs.readFileSync(visualQaSpecPath, 'utf8');

  for (const screenshotName of [
    'adaptive-profit-dashboard.png',
    'adaptive-profit-sessions.png',
    'adaptive-profit-stash-result.png',
    'adaptive-profit-overlay.png'
  ]) {
    assert.match(spec, new RegExp(`testInfo\\.outputPath\\('${screenshotName}'\\)`));
  }

  for (const selector of [
    '#last-map-result-card',
    '#sessions-page',
    '#stash-profit-result',
    '[data-overlay-state="visible"]'
  ]) {
    assert.match(spec, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('farm tracking gap register records adaptive profit visual QA evidence', () => {
  const gapRegister = fs.readFileSync(gapRegisterPath, 'utf8');

  assert.match(gapRegister, /\| Adaptive profit visual QA \| Ready \|/);
  assert.match(gapRegister, /adaptive-profit-visual-qa\.spec\.js/);
  assert.doesNotMatch(
    gapRegister,
    /1\. Add visual QA screenshots for adaptive profit display/
  );
});
