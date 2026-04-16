const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authRoutePath = path.join(__dirname, '..', 'routes', 'auth.js');

test('auth routes include character payload builder for current-user responses', () => {
  const source = fs.readFileSync(authRoutePath, 'utf8');

  assert.match(source, /async function buildCurrentUserPayload/);
  assert.match(source, /poeApiService\.getCachedAccountCharacters\(user\)/);
  assert.match(source, /characters:\s*characterPayload\.characters/);
  assert.match(source, /selectedCharacterByGame:\s*characterPayload\.selectedCharacterByGame/);
});

test('auth routes keep session JWTs out of login and register response bodies', () => {
  const source = fs.readFileSync(authRoutePath, 'utf8');

  assert.doesNotMatch(source, /data:\s*\{\s*user,\s*token,/);
  assert.doesNotMatch(source, /mode:\s*'live',\s*\.\.\.payload,\s*token,/);
  assert.match(source, /router\.get\('\/realtime-token'/);
});
