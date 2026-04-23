const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REALTIME_WS_MAX_PAYLOAD_BYTES,
  REALTIME_WS_MAX_TOKEN_LENGTH,
  parseRealtimeAuthMessage,
  shouldRejectClientMessageAfterAuth
} = require('../services/realtimeGatewayPolicy');

test('realtime gateway policy accepts a valid auth envelope', () => {
  const parsed = parseRealtimeAuthMessage(Buffer.from(JSON.stringify({
    type: 'AUTH',
    token: 'signed-realtime-token'
  })));

  assert.deepEqual(parsed, {
    type: 'AUTH',
    token: 'signed-realtime-token'
  });
});

test('realtime gateway policy rejects malformed auth envelopes and oversized tokens', () => {
  assert.throws(
    () => parseRealtimeAuthMessage(Buffer.from('not-json')),
    /invalid realtime auth payload/i
  );

  assert.throws(
    () => parseRealtimeAuthMessage(Buffer.from(JSON.stringify({ type: 'PING' }))),
    /auth message/i
  );

  assert.throws(
    () => parseRealtimeAuthMessage(Buffer.from(JSON.stringify({
      type: 'AUTH',
      token: 'x'.repeat(REALTIME_WS_MAX_TOKEN_LENGTH + 1)
    }))),
    /auth token/i
  );
});

test('realtime gateway policy exports bounded websocket limits and fail-closed post-auth behavior', () => {
  assert.equal(REALTIME_WS_MAX_PAYLOAD_BYTES, 16 * 1024);
  assert.equal(shouldRejectClientMessageAfterAuth(), true);
});
