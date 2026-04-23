const REALTIME_WS_MAX_PAYLOAD_BYTES = 16 * 1024;
const REALTIME_WS_MAX_TOKEN_LENGTH = 4096;
const REALTIME_AUTH_TIMEOUT_MS = 5000;

function parseRealtimeAuthMessage(rawMessage) {
  let parsed;

  try {
    const text = Buffer.isBuffer(rawMessage)
      ? rawMessage.toString('utf8')
      : String(rawMessage ?? '');
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid realtime auth payload');
  }

  if (!parsed || parsed.type !== 'AUTH') {
    throw new Error('Realtime auth message is required');
  }

  const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
  if (!token || token.length > REALTIME_WS_MAX_TOKEN_LENGTH) {
    throw new Error('Realtime auth token is invalid');
  }

  return {
    type: 'AUTH',
    token
  };
}

function shouldRejectClientMessageAfterAuth() {
  return true;
}

module.exports = {
  REALTIME_WS_MAX_PAYLOAD_BYTES,
  REALTIME_WS_MAX_TOKEN_LENGTH,
  REALTIME_AUTH_TIMEOUT_MS,
  parseRealtimeAuthMessage,
  shouldRejectClientMessageAfterAuth
};
