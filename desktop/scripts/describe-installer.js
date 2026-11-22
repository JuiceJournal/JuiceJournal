// Rewrites latest.yml to describe an installer that changed after the build, such as one that was code-signed.
// Any update signature in it is dropped, since it was made for the earlier file: run sign:update again.
// Usage: node scripts/describe-installer.js <installer> <latest.yml>
const fs = require('fs');
const { SIGNATURE_FIELD, hashInstaller } = require('../src/modules/updateSignature');

async function describeInstaller({ installer, metadataPath }) {
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const sha512 = await hashInstaller(installer);
  const { size } = fs.statSync(installer);

  if (!/^sha512: /m.test(metadata) || !/^ {4}sha512: /m.test(metadata) || !/^ {4}size: /m.test(metadata)) {
    throw new Error('latest.yml does not have the fields of a single-file release');
  }

  const described = metadata
    .replace(/^( *)sha512: .*$/gm, (line, indent) => `${indent}sha512: ${sha512}`)
    .replace(/^( *)size: .*$/gm, (line, indent) => `${indent}size: ${size}`)
    .replace(new RegExp(`^${SIGNATURE_FIELD}: .*\\r?\\n?`, 'm'), '');
  fs.writeFileSync(metadataPath, described);
  return { sha512, size };
}

if (require.main === module) {
  const [installer, metadataPath] = process.argv.slice(2);
  if (!installer || !metadataPath) {
    console.error('Usage: node scripts/describe-installer.js <installer> <latest.yml>');
    process.exit(1);
  }

  describeInstaller({ installer, metadataPath })
    .then(({ size }) => console.log(`latest.yml now describes ${installer} (${size} bytes)`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = { describeInstaller };
