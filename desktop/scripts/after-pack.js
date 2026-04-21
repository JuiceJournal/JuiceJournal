const path = require('node:path');
const fs = require('node:fs');

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
    'version-string': {
      FileDescription: 'Juice Journal Desktop App',
      ProductName: 'Juice Journal',
      InternalFilename: `${productFilename}.exe`,
      OriginalFilename: `${productFilename}.exe`
    }
  });
}

module.exports = afterPack;
module.exports.default = afterPack;
