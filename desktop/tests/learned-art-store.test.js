const test = require('node:test');
const assert = require('node:assert/strict');

const { createLearnedArtStore } = require('../src/modules/learnedArtStore');

// A 2x2 picture filled with one value; two pictures are the same item when their values are.
function pixels(value) {
  return { width: 2, height: 2, data: new Uint8Array(12).fill(value) };
}

function setup(saved = null) {
  const disk = { saved, saves: 0 };
  const store = createLearnedArtStore({
    load: () => disk.saved,
    save: (content) => {
      disk.saved = JSON.parse(JSON.stringify(content));
      disk.saves += 1;
    },
    isSameSample: (left, right) => left.data[0] === right.data[0]
  });
  return { store, disk };
}

const LOOK = ['Essence of Ice', 'Greater Essence of Ice'];

test('a named offer becomes art for that item, in its own game only', () => {
  const { store } = setup();
  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);

  assert.equal(store.count(), 0);
  assert.equal(store.confirm('s1', LOOK, 'Greater Essence of Ice'), true);

  assert.equal(store.count(), 1);
  assert.deepEqual(store.list('poe2').samples, [{ game: 'poe2', name: 'Greater Essence of Ice', ...pixels(7) }]);
  assert.deepEqual(store.list('poe1').samples, []);
});

test('nothing is learned from a name the offer did not make, an offer without pixels or one already settled', () => {
  const { store } = setup();
  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }, { names: ['Vaal Orb', 'Chaos Orb'], quantity: 2 }]);

  assert.equal(store.confirm('s1', LOOK, 'Mirror of Kalandra'), false);
  assert.equal(store.confirm('s1', LOOK, 'Essence of Ice'), false, 'the offer went with the first answer');
  assert.equal(store.confirm('s1', ['Vaal Orb', 'Chaos Orb'], 'Vaal Orb'), false);
  assert.equal(store.confirm('s2', LOOK, 'Essence of Ice'), false);
  assert.equal(store.count(), 0);
});

test('an offer of cells that do not show one picture teaches nothing, and one of the same picture does', () => {
  const { store } = setup();
  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 2, samples: [pixels(7), pixels(9)] }]);
  assert.equal(store.confirm('s1', LOOK, 'Essence of Ice'), false);

  store.hold('s2', 'poe2', [{ names: LOOK, quantity: 2, samples: [pixels(7), pixels(7)] }]);
  assert.equal(store.confirm('s2', LOOK, 'Essence of Ice'), true);
  assert.equal(store.list('poe2').samples.length, 1);

  store.hold('s3', 'poe2', [{ names: LOOK, quantity: 5, samples: [1, 2, 3, 4, 5].map(() => pixels(7)) }]);
  assert.equal(store.confirm('s3', LOOK, 'Essence of Ice'), false, 'more cells than are kept');
});

test('a dismissed offer is forgotten', () => {
  const { store } = setup();
  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);
  store.drop('s1', LOOK);

  assert.equal(store.confirm('s1', LOOK, 'Essence of Ice'), false);
});

test('the same pixels named again keep one picture, and named differently keep the newer name', () => {
  const { store } = setup();
  const name = (sessionId, item) => {
    store.hold(sessionId, 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);
    return store.confirm(sessionId, LOOK, item);
  };

  assert.equal(name('s1', 'Essence of Ice'), true);
  assert.equal(name('s2', 'Essence of Ice'), true);
  assert.equal(store.list('poe2').samples.length, 1);

  assert.equal(name('s3', 'Greater Essence of Ice'), true);
  assert.deepEqual(store.list('poe2').samples.map((sample) => sample.name), ['Greater Essence of Ice']);
});

test('an item keeps its three newest pictures', () => {
  const { store } = setup();
  for (const value of [1, 2, 3, 4]) {
    store.hold(`s${value}`, 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(value)] }]);
    store.confirm(`s${value}`, LOOK, 'Essence of Ice');
  }

  assert.deepEqual(store.list('poe2').samples.map((sample) => sample.data[0]), [2, 3, 4]);
  assert.equal(store.count(), 1);
});

test('the list is the same object until the art changes, and its revision moves when it does', () => {
  const { store } = setup();
  const before = store.list('poe2');
  assert.equal(store.list('poe2'), before);

  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);
  assert.equal(store.list('poe2'), before, 'a waiting offer is not art yet');
  store.confirm('s1', LOOK, 'Essence of Ice');

  assert.notEqual(store.list('poe2').revision, before.revision);
  const learned = store.list('poe2');
  store.clear();
  assert.notEqual(store.list('poe2').revision, learned.revision);
  assert.equal(store.count(), 0);
});

test('named pictures come back after a restart, waiting offers do not reach the disk, and at most thirty wait', () => {
  const first = setup();
  first.store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);
  first.store.confirm('s1', LOOK, 'Essence of Ice');
  first.store.hold('s2', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(9)] }]);
  assert.deepEqual(Object.keys(first.disk.saved), ['version', 'pictures']);
  assert.equal(first.disk.saved.pictures.length, 1);

  const second = setup(first.disk.saved);
  assert.deepEqual(second.store.list('poe2').samples, [{ game: 'poe2', name: 'Essence of Ice', ...pixels(7) }]);
  assert.equal(second.store.confirm('s2', LOOK, 'Greater Essence of Ice'), false, 'the open offer was in memory only');

  const many = setup();
  for (let i = 0; i < 31; i += 1) many.store.hold(`s${i}`, 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(i)] }]);
  assert.equal(many.store.confirm('s0', LOOK, 'Essence of Ice'), false, 'the oldest offer was let go');
  assert.equal(many.store.confirm('s30', LOOK, 'Essence of Ice'), true);
});

test('a file that cannot be used starts empty, and broken entries in one are left out', () => {
  assert.equal(setup(null).store.count(), 0);
  assert.equal(setup('nonsense').store.count(), 0);

  const good = { game: 'poe2', name: 'Essence of Ice', width: 2, height: 2, data: Buffer.from(new Uint8Array(12)).toString('base64') };
  const { store } = setup({
    pictures: [good, { ...good, name: '' }, { ...good, width: 3 }, { ...good, data: 5 }, { ...good, game: null }, null],
    waiting: [{ key: JSON.stringify(['s1', ...LOOK]), game: 'poe2', samples: [{ width: 2, height: 2, data: good.data }] }]
  });

  assert.equal(store.list('poe2').samples.length, 1);
  assert.equal(store.confirm('s1', LOOK, 'Essence of Ice'), false, 'offers in a file are not taken up');
});

test('only a named picture or a clear is written to disk', () => {
  const { store, disk } = setup();
  store.hold('s1', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(7)] }]);
  store.hold('s2', 'poe2', [{ names: LOOK, quantity: 1, samples: [pixels(8)] }]);
  store.drop('s2', LOOK);
  store.list('poe2');
  assert.equal(store.confirm('s3', LOOK, 'Essence of Ice'), false);
  assert.equal(disk.saves, 0);

  store.confirm('s1', LOOK, 'Essence of Ice');
  assert.equal(disk.saves, 1);
  store.clear();
  assert.equal(disk.saves, 2);
});
