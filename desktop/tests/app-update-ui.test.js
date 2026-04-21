const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(appJsPath)} to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;
  const searchStartIndex = startIndex + (asyncStartIndex !== -1 ? asyncSignature.length : signature.length);

  for (let index = searchStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }
    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(appJsPath)}`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(appJsPath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('settings html includes desktop update status controls', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="app-version-value"/);
  assert.match(html, /id="app-update-status"/);
  assert.match(html, /id="app-update-detail"/);
  assert.match(html, /id="check-updates-btn"/);
  assert.match(html, /id="install-update-btn"/);
});

test('renderer about tab shows install action only when an update is downloaded', () => {
  const context = loadFunctions(['renderAppUpdateState'], {
    elements: {
      appVersionValue: { textContent: '' },
      appUpdateStatus: { textContent: '' },
      appUpdateDetail: { textContent: '' },
      checkUpdatesBtn: { disabled: false, textContent: '' },
      installUpdateBtn: { hidden: true, disabled: true, textContent: '' }
    },
    state: {
      appUpdate: {
        enabled: true,
        supported: true,
        checking: false,
        available: true,
        downloading: false,
        downloaded: true,
        progressPercent: 100,
        currentVersion: '1.0.0',
        nextVersion: '1.1.0',
        error: null
      }
    },
    window: {
      t: (key, values) => {
        if (key === 'settings.updateReady') return 'Update ready to install.';
        if (key === 'settings.updateAvailable') return `Update available: ${values.version}`;
        return key;
      }
    }
  });

  context.renderAppUpdateState();

  assert.equal(context.elements.appVersionValue.textContent, '1.0.0');
  assert.equal(context.elements.appUpdateStatus.textContent, 'Update ready to install.');
  assert.equal(context.elements.appUpdateDetail.textContent, '1.1.0');
  assert.equal(context.elements.installUpdateBtn.hidden, false);
  assert.equal(context.elements.installUpdateBtn.disabled, false);
  assert.equal(context.elements.checkUpdatesBtn.disabled, false);
});
