const test = require('node:test');
const assert = require('node:assert/strict');

const { getCapabilitiesForGame } = require('../src/modules/capabilityModel');

test('capability model enables stash tracking for poe1 and disables it for poe2', () => {
  assert.deepEqual(getCapabilitiesForGame('poe1').stashTracking, { enabled: true, reason: null });
  assert.deepEqual(getCapabilitiesForGame('poe2').stashTracking, { enabled: false, reason: 'poe2_not_supported_yet' });
});

test('capability model disables poe1 stash tracking when the sign-in lacks account:stashes', () => {
  assert.deepEqual(
    getCapabilitiesForGame('poe1', { stashAccess: false }).stashTracking,
    { enabled: false, reason: 'stash_scope_missing' }
  );
  assert.deepEqual(getCapabilitiesForGame('poe1', { stashAccess: true }).stashTracking, { enabled: true, reason: null });
});
