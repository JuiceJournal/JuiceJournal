const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const strategyPath = path.join(repoRoot, 'docs', 'poe2-profit-source-strategy.md');
const gapRegisterPath = path.join(repoRoot, 'docs', 'farm-tracking-gap-register.md');
const { getCapabilitiesForGame } = require('../src/modules/capabilityModel');

test('PoE2 profit source strategy is documented as runtime-only until a reliable loot source exists', () => {
  assert.equal(
    fs.existsSync(strategyPath),
    true,
    'Expected docs/poe2-profit-source-strategy.md to record the chosen PoE2 profit source strategy'
  );

  const strategy = fs.readFileSync(strategyPath, 'utf8');

  assert.match(strategy, /Decision: runtime-only zero-profit tracking/i);
  assert.match(strategy, /Official stash\/account route/i);
  assert.match(strategy, /OCR fallback remains experimental/i);
  assert.match(strategy, /Do not calculate trusted PoE2 profit/i);
});

test('PoE2 profit capability and gap register stay aligned with the documented strategy', () => {
  assert.deepEqual(
    getCapabilitiesForGame('poe2').stashTracking,
    { enabled: false, reason: 'poe2_not_supported_yet' }
  );

  const gapRegister = fs.readFileSync(gapRegisterPath, 'utf8');
  assert.match(gapRegister, /\| PoE2 profit source strategy \| Ready \|/);
  assert.match(gapRegister, /poe2-profit-source-strategy\.md/);
  assert.doesNotMatch(
    gapRegister,
    /Decide the PoE2 profit source strategy/
  );
});
