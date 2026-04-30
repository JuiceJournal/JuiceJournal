const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('backend env config loads dotenv for non-server entrypoints', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juice-env-'));
  const dotenvPath = path.join(tempDir, '.env');
  fs.writeFileSync(dotenvPath, [
    'DB_HOST=127.0.0.1',
    'DB_PORT=15432',
    'DB_NAME=dotenv_db',
    'DB_USER=dotenv_user',
    'DB_PASSWORD=dotenv_password',
    'JWT_SECRET=dotenv-secret',
    ''
  ].join('\n'));

  const childEnv = { ...process.env, DOTENV_CONFIG_PATH: dotenvPath, NODE_ENV: 'development' };
  delete childEnv.DB_HOST;
  delete childEnv.DB_PORT;
  delete childEnv.DB_NAME;
  delete childEnv.DB_USER;
  delete childEnv.DB_PASSWORD;

  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const env = require(${JSON.stringify(path.join(__dirname, '..', 'config', 'env.js'))}); process.stdout.write(JSON.stringify(env.db));`
    ],
    {
      env: childEnv,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    host: '127.0.0.1',
    port: 15432,
    name: 'dotenv_db',
    user: 'dotenv_user',
    password: 'dotenv_password',
    autoSync: true
  });
});
