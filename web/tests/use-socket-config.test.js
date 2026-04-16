const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hookPath = path.join(__dirname, '..', 'src', 'hooks', 'useSocket.js');

test('useSocket fails closed in production when NEXT_PUBLIC_WS_URL is not wss', () => {
  const source = fs.readFileSync(hookPath, 'utf8');

  assert.match(source, /if \(!envUrl\.startsWith\('wss:\/\/'\)\) \{/);
  assert.match(source, /throw new Error\(/);
  assert.doesNotMatch(source, /console\.error\(\s*`\[useSocket\] NEXT_PUBLIC_WS_URL must use wss:\/\//);
});
