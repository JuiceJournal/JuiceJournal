const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authRoutePath = path.join(__dirname, '..', 'routes', 'auth.js');

test('auth routes include character payload builder for current-user responses', () => {
  const source = fs.readFileSync(authRoutePath, 'utf8');

  assert.match(source, /async function buildCurrentUserPayload/);
  assert.match(source, /poeApiService\.getAccountCharacters\(user\)/);
  assert.match(source, /characters:\s*characterPayload\.characters/);
  assert.match(source, /selectedCharacterByGame:\s*characterPayload\.selectedCharacterByGame/);
});
