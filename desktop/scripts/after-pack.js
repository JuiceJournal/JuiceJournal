const path = require('node:path');
const fs = require('node:fs');

// What the exe's Properties window shows. Without a company and a copyright it keeps Electron's own.
function versionStrings({ productFilename, companyName, year }) {
  return {
    CompanyName: companyName,
    LegalCopyright: `Copyright (C) ${year} ${companyName}`,
    FileDescription: 'Juice Journal',
    ProductName: 'Juice Journal',
    InternalFilename: `${productFilename}.exe`,
    OriginalFilename: `${productFilename}.exe`
  };
}

async function afterPack(context) {
  if (!context || context.electronPlatformName !== 'win32') {
    return;
  }

  const productFilename = context.packager?.appInfo?.productFilename || 'Juice Journal';
  const version = context.packager?.appInfo?.version || '1.0.0';
  const executablePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.resolve(__dirname, '..', 'src', 'assets', 'icon.ico');

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged Windows executable not found: ${executablePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Windows icon not found: ${iconPath}`);
  }

  const { rcedit } = await import('rcedit');

  await rcedit(executablePath, {
    icon: iconPath,
    'file-version': version,
    'product-version': version,
    'requested-execution-level': 'asInvoker',
    'version-string': versionStrings({
      productFilename,
      companyName: context.packager?.appInfo?.companyName || 'JuiceJournal Team',
      year: new Date().getFullYear()
    })
  });
}

module.exports = afterPack;
module.exports.versionStrings = versionStrings;
module.exports.default = afterPack;
