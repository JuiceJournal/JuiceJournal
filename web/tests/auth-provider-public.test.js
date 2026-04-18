const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hookPath = path.join(__dirname, '..', 'src', 'hooks', 'useAuth.js');

test('AuthProvider skips the eager auth probe on public showroom routes', () => {
  const source = fs.readFileSync(hookPath, 'utf8');

  assert.match(source, /function isPublicPath/);
  assert.match(source, /pathname === '\/'/);
  assert.match(source, /pathname\.startsWith\('\/strategies\/public'\)/);
  assert.match(source, /if \(isPublicPath\(pathname\)\) \{/);
});
