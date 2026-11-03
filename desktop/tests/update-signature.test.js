const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  UPDATE_PUBLIC_KEY,
  SIGNATURE_FIELD,
  buildSignedMessage,
  hashInstaller,
  verifyUpdateSignature
} = require('../src/modules/updateSignature');
const { signRelease } = require('../scripts/sign-update');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const testPublicKey = publicKey.export({ type: 'spki', format: 'pem' });

function makeRelease(t, { version = '1.0.1', contents = 'installer bytes' } = {}) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juice-update-signature-'));
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));

  const installer = path.join(distDir, `Juice Journal Setup ${version}.exe`);
  fs.writeFileSync(installer, contents);
  const sha512 = crypto.createHash('sha512').update(contents).digest('base64');
  fs.writeFileSync(path.join(distDir, 'latest.yml'), [
    `version: ${version}`,
    'files:',
    `  - url: Juice-Journal-Setup-${version}.exe`,
    `    sha512: ${sha512}`,
    `path: Juice-Journal-Setup-${version}.exe`,
    `sha512: ${sha512}`,
    "releaseDate: '2026-11-03T00:00:00.000Z'",
    ''
  ].join('\n'));
  return { distDir, installer, sha512, version };
}

function sign(version, sha512, key = privateKey) {
  return crypto.sign(null, buildSignedMessage(version, sha512), key).toString('base64');
}

function readSignature(distDir) {
  const metadata = fs.readFileSync(path.join(distDir, 'latest.yml'), 'utf8');
  return metadata.match(new RegExp(`^${SIGNATURE_FIELD}: (.+)$`, 'm'))?.[1];
}

test('the built-in public key is a usable Ed25519 key', () => {
  assert.equal(crypto.createPublicKey(UPDATE_PUBLIC_KEY).asymmetricKeyType, 'ed25519');
});

test('a correctly signed installer passes', async (t) => {
  const { installer, sha512, version } = makeRelease(t);

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version,
    signature: sign(version, sha512),
    publicKey: testPublicKey
  }), true);
});

test('a changed installer fails', async (t) => {
  const { installer, sha512, version } = makeRelease(t);
  fs.appendFileSync(installer, 'x');

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version,
    signature: sign(version, sha512),
    publicKey: testPublicKey
  }), false);
});

test('an old signed installer cannot pass as a newer version', async (t) => {
  const { installer, sha512 } = makeRelease(t);

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version: '9.9.9',
    signature: sign('1.0.1', sha512),
    publicKey: testPublicKey
  }), false);
});

test('a signature from another key fails', async (t) => {
  const { installer, sha512, version } = makeRelease(t);
  const other = crypto.generateKeyPairSync('ed25519');

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version,
    signature: sign(version, sha512, other.privateKey),
    publicKey: testPublicKey
  }), false);
});

test('a test signature does not pass the built-in key', async (t) => {
  const { installer, sha512, version } = makeRelease(t);

  assert.equal(await verifyUpdateSignature({ file: installer, version, signature: sign(version, sha512) }), false);
});

for (const signature of [undefined, null, '', 123, 'not base64 at all', Buffer.alloc(10).toString('base64')]) {
  test(`a missing or malformed signature fails: ${String(signature)}`, async (t) => {
    const { installer, version } = makeRelease(t);

    assert.equal(await verifyUpdateSignature({
      file: installer,
      version,
      signature,
      publicKey: testPublicKey
    }), false);
  });
}

test('a missing version fails', async (t) => {
  const { installer, sha512 } = makeRelease(t);

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version: undefined,
    signature: sign('undefined', sha512),
    publicKey: testPublicKey
  }), false);
});

test('hashInstaller matches the sha512 electron-builder writes', async (t) => {
  const { installer, sha512 } = makeRelease(t, { contents: Buffer.alloc(200000, 7) });

  assert.equal(await hashInstaller(installer), sha512);
});

test('signRelease writes a signature the app accepts', async (t) => {
  const { distDir, installer, version } = makeRelease(t);

  await signRelease({ distDir, privateKey, productName: 'Juice Journal', publicKey: testPublicKey });

  assert.equal(await verifyUpdateSignature({
    file: installer,
    version,
    signature: readSignature(distDir),
    publicKey: testPublicKey
  }), true);
});

test('signRelease keeps one signature when run twice', async (t) => {
  const { distDir } = makeRelease(t);

  await signRelease({ distDir, privateKey, productName: 'Juice Journal', publicKey: testPublicKey });
  await signRelease({ distDir, privateKey, productName: 'Juice Journal', publicKey: testPublicKey });

  const metadata = fs.readFileSync(path.join(distDir, 'latest.yml'), 'utf8');
  assert.equal(metadata.split(`${SIGNATURE_FIELD}:`).length - 1, 1);
});

test('signRelease refuses a key the app would reject', async (t) => {
  const { distDir } = makeRelease(t);

  await assert.rejects(
    signRelease({ distDir, privateKey, productName: 'Juice Journal' }),
    /does not match the public key/
  );
  assert.equal(readSignature(distDir), undefined);
});

test('signRelease refuses an installer that latest.yml does not describe', async (t) => {
  const { distDir, installer } = makeRelease(t);
  fs.appendFileSync(installer, 'x');

  await assert.rejects(
    signRelease({ distDir, privateKey, productName: 'Juice Journal', publicKey: testPublicKey }),
    /does not describe/
  );
});
