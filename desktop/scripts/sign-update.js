// Signs the built installer and adds the signature to dist/latest.yml. Run it after the build and before uploading.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  SIGNATURE_FIELD,
  UPDATE_PUBLIC_KEY,
  buildSignedMessage,
  hashInstaller,
  verifyUpdateSignature
} = require('../src/modules/updateSignature');

function readField(metadata, name) {
  const match = metadata.match(new RegExp(`^${name}: (.+?)\\s*$`, 'm'));
  if (!match) {
    throw new Error(`latest.yml has no ${name} field`);
  }
  return match[1];
}

async function signRelease({ distDir, privateKey, productName, publicKey = UPDATE_PUBLIC_KEY }) {
  const metadataPath = path.join(distDir, 'latest.yml');
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const version = readField(metadata, 'version');
  const installer = path.join(distDir, `${productName} Setup ${version}.exe`);

  const sha512 = await hashInstaller(installer);
  if (sha512 !== readField(metadata, 'sha512')) {
    throw new Error(`latest.yml does not describe ${path.basename(installer)}`);
  }

  const signature = crypto.sign(null, buildSignedMessage(version, sha512), privateKey).toString('base64');
  if (!await verifyUpdateSignature({ file: installer, version, signature, publicKey })) {
    throw new Error('This key does not match the public key in the app. Installed apps would reject this release.');
  }

  const unsigned = metadata.replace(new RegExp(`^${SIGNATURE_FIELD}: .*\\r?\\n`, 'm'), '');
  fs.writeFileSync(metadataPath, `${unsigned.trimEnd()}\n${SIGNATURE_FIELD}: ${signature}\n`);
  return { version, installer };
}

async function main() {
  const keyPath = process.argv[2] || process.env.JUICE_JOURNAL_UPDATE_KEY;
  if (!keyPath) {
    throw new Error('Usage: npm run sign:update -- <private key path>, or set JUICE_JOURNAL_UPDATE_KEY');
  }

  const { build } = require('../package.json');
  const { version, installer } = await signRelease({
    distDir: path.join(__dirname, '..', build.directories.output),
    privateKey: crypto.createPrivateKey(fs.readFileSync(keyPath)),
    productName: build.productName
  });
  console.log(`Signed ${path.basename(installer)} as version ${version}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { signRelease };
