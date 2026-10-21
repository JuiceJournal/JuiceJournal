const test = require('node:test');
const assert = require('node:assert/strict');

const { getCapabilitiesForGame } = require('../src/modules/capabilityModel');

test('PoE2 profit stays runtime-only until a reliable loot source exists', () => {
  assert.deepEqual(
    getCapabilitiesForGame('poe2').stashTracking,
    { enabled: false, reason: 'poe2_not_supported_yet' }
  );
});
