const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Tesseract = require('tesseract.js');
const OCRScanner = require('../src/modules/ocrScanner');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('OCR scanner keeps the language data in its cache folder instead of the working folder', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juice-journal-ocr-'));
  const cachePath = path.join(tempDir, 'ocr-cache');
  const createWorkerCalls = [];
  const originalCreateWorker = Tesseract.createWorker;
  Tesseract.createWorker = async (...args) => {
    createWorkerCalls.push(args);
    return { terminate: async () => {} };
  };
  t.after(() => {
    Tesseract.createWorker = originalCreateWorker;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const scanner = new OCRScanner({ cachePath });
  await scanner.initialize();

  assert.deepEqual(createWorkerCalls, [['eng', Tesseract.OEM.LSTM_ONLY, { cachePath }]]);
  assert.equal(fs.statSync(cachePath).isDirectory(), true);
});

test('main process stores the OCR language data under the app data folder', () => {
  assert.match(mainJs, /new OCRScanner\(\{ cachePath: path\.join\(app\.getPath\('userData'\), 'ocr-cache'\) \}\)/);
});
