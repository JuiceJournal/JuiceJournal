const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

function loadFunctions(names, context) {
  vm.createContext(context);
  for (const name of names) {
    const match = new RegExp(`\\n(async )?function ${name}\\(`).exec(mainSource);
    assert.ok(match, `main.js should define ${name}()`);
    const end = mainSource.indexOf('\n}\n', match.index);
    vm.runInContext(`${mainSource.slice(match.index, end + 2)};\nthis.${name} = ${name};`, context);
  }
  return context;
}

test('while Delete everything runs, the item pictures are neither read back nor saved', () => {
  const calls = { reads: 0, writes: 0, made: [] };
  const context = loadFunctions(['getLearnedArtStore'], {
    learnedArtStore: null,
    learnedArtHeld: true,
    isSameInventorySample: () => false,
    path,
    app: { getPath: () => 'C:/user-data' },
    console: { warn() {} },
    fs: {
      readFileSync: () => { calls.reads += 1; return '{"pictures":[]}'; },
      mkdirSync: () => {},
      writeFileSync: () => { calls.writes += 1; },
      renameSync: () => {}
    },
    createLearnedArtStore: (options) => {
      calls.made.push(options);
      return { options };
    }
  });

  const held = context.getLearnedArtStore();
  assert.equal(held.options.load(), null);
  held.options.save({ pictures: [] });
  assert.deepEqual(calls, { reads: 0, writes: 0, made: calls.made });
  assert.equal(context.learnedArtStore, null, 'nothing is kept for after the delete');

  context.learnedArtHeld = false;
  const store = context.getLearnedArtStore();
  store.options.load();
  store.options.save({ pictures: [] });
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes, 1);
  assert.equal(context.getLearnedArtStore(), store);
});

test('Delete everything holds the pictures from the start, and lets them be read again when it did not restart', () => {
  const start = mainSource.indexOf('\nasync function deleteAllLocalData(');
  const body = mainSource.slice(start, mainSource.indexOf('\n}\n', start));
  assert.match(body, /learnedArtStore = null;\n    learnedArtHeld = true;/);
  assert.match(body, /if \(!restarting\) \{[\s\S]*learnedArtHeld = false;\n      learnedArtStore = null;\n    \}/);
  // The hold comes before the first wait of the delete.
  assert.ok(body.indexOf('learnedArtHeld = true;') < body.indexOf('await '));
});

test('a finished first-map card rests its flask and its step mark', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(css.includes([
    '.coach-card[data-coach-status="done"] .coach-flask-level::before,',
    '.coach-card[data-coach-status="done"] .coach-flask-bubble,',
    '.coach-card[data-coach-status="done"] .coach-node-mark { animation-play-state: paused; }'
  ].join('\n')));
});

test('the site offers the installer of the latest full release only', () => {
  const html = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
  assert.ok(html.includes("fetch('https://api.github.com/repos/JuiceJournal/JuiceJournal/releases/latest')"));
  assert.ok(html.includes('if (!release || release.prerelease || release.draft) return;'));
  assert.ok(!html.includes('releases?per_page='));
});

test('every action in the workflows is pinned to a full commit SHA', () => {
  const dir = path.join(root, '.github', 'workflows');
  for (const file of fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    const uses = [...fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
    assert.ok(uses.length > 0, file);
    for (const ref of uses) {
      assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file}: ${ref}`);
    }
  }
});
