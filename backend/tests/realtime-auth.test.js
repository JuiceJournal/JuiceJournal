const test = require('node:test');
const assert = require('node:assert/strict');

const authModulePath = '../middleware/auth';

function loadAuthModule() {
  delete require.cache[require.resolve(authModulePath)];
  return require(authModulePath);
}

test('verifyRealtimeToken accepts realtime JWTs and rejects regular session JWTs', () => {
  process.env.JWT_SECRET = 'x'.repeat(48);

  const {
    generateToken,
    generateRealtimeToken,
    verifyRealtimeToken
  } = loadAuthModule();

  const sessionToken = generateToken('user-1');
  const realtimeToken = generateRealtimeToken('user-1');

  const decodedRealtime = verifyRealtimeToken(realtimeToken);
  assert.equal(decodedRealtime.userId, 'user-1');
  assert.equal(decodedRealtime.kind, 'realtime');

  assert.throws(
    () => verifyRealtimeToken(sessionToken),
    /realtime/i
  );
});
