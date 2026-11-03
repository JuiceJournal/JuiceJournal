// Creates the Ed25519 key that signs releases. The private key stays outside the repo; the printed public key goes
// into src/modules/updateSignature.js.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/generate-update-key.js <private key path outside the repo>');
  process.exit(1);
}

const insideRepo = !path.relative(path.resolve(__dirname, '..', '..'), path.resolve(outputPath)).startsWith('..');
if (insideRepo) {
  console.error('The private key must stay outside the repo: anything under desktop/src ships in every installer.');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
// The wx flag refuses to overwrite: replacing a release key cuts existing installs off from in-app updates.
fs.writeFileSync(outputPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });

console.log(publicKey.export({ type: 'spki', format: 'pem' }).trim());
