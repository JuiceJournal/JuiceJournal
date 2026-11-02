const test = require('node:test');
const assert = require('node:assert/strict');

const { FULL_LIST_MAX, getRowTop, selectRowWindow } = require('../src/modules/currencyRowWindowModel');

const LAYOUT = { count: 500, rowHeight: 40, viewHeight: 800 };

test('a window holds the screen plus a margin of rows on each side, and spacers stand for the rest', () => {
  assert.ok(FULL_LIST_MAX < 500);
  const atTop = selectRowWindow({ ...LAYOUT, viewTop: 0 });
  assert.equal(atTop.start, 0);
  assert.equal(atTop.end, 41);
  assert.equal(atTop.topHeight, 0);
  assert.equal(atTop.bottomHeight, (500 - 41) * 40);

  const inMiddle = selectRowWindow({ ...LAYOUT, viewTop: 4000 });
  assert.deepEqual(inMiddle, { start: 80, end: 141, topHeight: 3200, bottomHeight: 359 * 40 });

  const atEnd = selectRowWindow({ ...LAYOUT, viewTop: 500 * 40 - 800 });
  assert.equal(atEnd.end, 500);
  assert.equal(atEnd.bottomHeight, 0);

  // The rows and spacers always add up to the whole list.
  for (const window of [atTop, inMiddle, atEnd]) {
    assert.equal(window.topHeight + (window.end - window.start) * 40 + window.bottomHeight, 500 * 40);
  }
});

test('a place above or past the list gives its first or last rows', () => {
  assert.equal(selectRowWindow({ ...LAYOUT, viewTop: -300 }).start, 0);
  const past = selectRowWindow({ ...LAYOUT, viewTop: 900000 });
  assert.equal(past.end, 500);
  assert.equal(past.start, 479);
});

test('the window stays while the screen is well inside it and moves near its edge', () => {
  const current = selectRowWindow({ ...LAYOUT, viewTop: 4000 });
  // 10 rows down: still 10 rows in hand below the screen.
  assert.equal(selectRowWindow({ ...LAYOUT, viewTop: 4400, current }).start, current.start);
  // 16 rows down: only 4 left.
  assert.notEqual(selectRowWindow({ ...LAYOUT, viewTop: 4640, current }).start, current.start);
  // And the same going up.
  assert.equal(selectRowWindow({ ...LAYOUT, viewTop: 3600, current }).start, current.start);
  assert.notEqual(selectRowWindow({ ...LAYOUT, viewTop: 3360, current }).start, current.start);
  // A jump far away leaves nothing of it.
  const jumped = selectRowWindow({ ...LAYOUT, viewTop: 16000, current });
  assert.ok(jumped.start > current.end);

  // A window at the list's end has no more rows to want.
  const atEnd = selectRowWindow({ ...LAYOUT, viewTop: 500 * 40 - 800 });
  assert.equal(selectRowWindow({ ...LAYOUT, viewTop: 500 * 40 - 800, current: atEnd }).end, 500);
});

test('an open detail row pushes the rows after it down and counts in the spacer it falls under', () => {
  const layout = { ...LAYOUT, detailIndex: 10, detailHeight: 120 };
  assert.equal(getRowTop(10, layout), 400);
  assert.equal(getRowTop(11, layout), 440 + 120);
  assert.equal(getRowTop(10, LAYOUT), 400);

  // Inside the window, the rows hold it: the spacers do not.
  const holding = selectRowWindow({ ...layout, viewTop: 0 });
  assert.ok(holding.start <= 10 && holding.end > 10);
  assert.equal(holding.bottomHeight, (500 - holding.end) * 40);

  // Above the window, the top spacer holds it.
  const below = selectRowWindow({ ...layout, viewTop: 8000 });
  assert.equal(below.topHeight, below.start * 40 + 120);
  assert.equal(below.bottomHeight, (500 - below.end) * 40);

  // Below the window, the bottom spacer does.
  const above = selectRowWindow({ ...layout, detailIndex: 400, viewTop: 0 });
  assert.equal(above.topHeight, 0);
  assert.equal(above.bottomHeight, (500 - above.end) * 40 + 120);

  // The screen on the detail, or past it, finds the right rows.
  const onDetail = selectRowWindow({ ...layout, viewTop: 460, viewHeight: 10 });
  assert.equal(onDetail.start, 0);
  const pastDetail = selectRowWindow({ ...layout, viewTop: 40 * 100 + 120, viewHeight: 40 });
  assert.equal(pastDetail.start, 80);
  assert.equal(pastDetail.end, 122);
});
