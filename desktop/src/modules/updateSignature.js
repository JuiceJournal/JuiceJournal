const crypto = require('crypto');
const fs = require('fs');

// Public half of the release key. The private half stays outside this repo; see docs/releasing.md.
const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA819gdnh4QxFETfZHk3oIyorSwx5MVB3f8gDEDY3jM30=
-----END PUBLIC KEY-----`;

// The latest.yml field that carries the signature. electron-updater passes unknown fields through to its events.
const SIGNATURE_FIELD = 'juiceJournalSignature';

// Signing the version with the hash stops an old signed installer from being offered as a newer release.
function buildSignedMessage(version, sha512) {
  return Buffer.from(`juice-journal-update-v1\n${version}\n${sha512}\n`, 'utf8');
}

async function hashInstaller(file) {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('base64');
}

async function verifyUpdateSignature({ file, version, signature, publicKey = UPDATE_PUBLIC_KEY }) {
  if (typeof version !== 'string' || !version || typeof signature !== 'string' || !signature) {
    return false;
  }

  const message = buildSignedMessage(version, await hashInstaller(file));
  return crypto.verify(null, message, publicKey, Buffer.from(signature, 'base64'));
}

module.exports = {
  UPDATE_PUBLIC_KEY,
  SIGNATURE_FIELD,
  buildSignedMessage,
  hashInstaller,
  verifyUpdateSignature
};
