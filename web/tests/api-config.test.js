const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const apiPath = path.join(__dirname, '..', 'src', 'lib', 'api.js');
const source = fs.readFileSync(apiPath, 'utf8');

test('api client fails closed for missing production API URL', () => {
  assert.match(source, /function resolveApiUrl\(\)/);
  assert.match(source, /if \(!envUrl\) \{/);
  assert.match(source, /NEXT_PUBLIC_API_URL environment variable is required in production\./);
  assert.match(source, /throw new Error\(/);
});

test('api client requires https API URL in production', () => {
  assert.match(source, /if \(!envUrl\.startsWith\('https:\/\/'\)\) \{/);
  assert.match(source, /NEXT_PUBLIC_API_URL must use https:\/\/ in production/);
  assert.doesNotMatch(source, /console\.warn\(\s*`\[api\] NEXT_PUBLIC_API_URL/);
});

test('api client and ops health use the same resolved base URL', () => {
  assert.match(source, /const API_URL = resolveApiUrl\(\);/);
  assert.match(source, /baseURL:\s*`\$\{API_URL\}\/api`/);
  assert.match(source, /axios\.get\(`\$\{API_URL\}\/health`\)/);
});
