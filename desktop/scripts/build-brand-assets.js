// Renders the brand SVG sources into the PNG and ICO files used by the app, tray and installer.
// Runs inside Electron so Chromium rasterises the SVGs: `npm run icon:build`.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const assetsDir = path.resolve(__dirname, '..', 'src', 'assets');
const markPath = path.join(assetsDir, 'brand', 'mark.svg');
const smallMarkPath = path.join(assetsDir, 'brand', 'mark-small.svg');

// The detailed mark turns to mush below 32px, so small sizes use the simplified mark.
const SMALL_MARK_MAX_SIZE = 24;
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
// Electron picks the @Nx files up as extra scale factors of tray-icon.png.
const PNG_OUTPUTS = [
  { file: 'icon.png', size: 1024 },
  { file: 'tray-icon.png', size: 16 },
  { file: 'tray-icon@1.25x.png', size: 20 },
  { file: 'tray-icon@1.5x.png', size: 24 },
  { file: 'tray-icon@2x.png', size: 32 }
];

function readSvgAtSize(size) {
  const source = fs.readFileSync(size <= SMALL_MARK_MAX_SIZE ? smallMarkPath : markPath, 'utf8');
  return source.replace('<svg ', `<svg width="${size}" height="${size}" `);
}

async function rasterize(win, size) {
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(readSvgAtSize(size)).toString('base64')}`;
  const pngDataUrl = await win.webContents.executeJavaScript(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(svgDataUrl)};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ${size};
    canvas.height = ${size};
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(pngDataUrl.slice(pngDataUrl.indexOf(',') + 1), 'base64');
}

// ICO with PNG-compressed entries (supported by Windows Vista and later).
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach(({ size, png }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

async function build() {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');

  for (const output of PNG_OUTPUTS) {
    fs.writeFileSync(path.join(assetsDir, output.file), await rasterize(win, output.size));
    console.log(`wrote ${output.file} (${output.size}px)`);
  }

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    icoEntries.push({ size, png: await rasterize(win, size) });
  }
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), buildIco(icoEntries));
  console.log(`wrote icon.ico (${ICO_SIZES.join(', ')})`);
}

// Software rendering keeps the output identical across machines and GPUs.
app.disableHardwareAcceleration();

app.whenReady()
  .then(build)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
