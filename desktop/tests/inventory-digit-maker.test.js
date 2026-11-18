const test = require('node:test');
const assert = require('node:assert/strict');

const vision = require('../src/modules/inventoryVision');
const { DIGIT_PICTURES } = require('../src/modules/inventoryDigitPictures');
const { digitSetFor } = require('../src/modules/inventoryDigitMaker');

// A dark cell with a number drawn from a set's pictures where numbers start.
function cellWith(size, set, number, pick = (pictures) => pictures[0]) {
  const cell = { data: new Uint8Array(size * size * 4).fill(20), width: size, height: size };
  let left = set.start[0] + 2;
  for (const digit of String(number)) {
    const picture = pick(set.pictures.filter((entry) => entry.digit === digit));
    for (let y = 0; y < picture.height; y += 1) {
      for (let x = 0; x < picture.width; x += 1) {
        const at = ((picture.top - 1 + y) * size + left - 1 + x) * 4;
        cell.data.fill(picture.white[y * picture.width + x], at, at + 3);
      }
    }
    left += picture.advance + 2;
  }
  return cell;
}

test('a cell size checked on a filled inventory reads with its own pictures as they are', () => {
  assert.equal(digitSetFor(53, DIGIT_PICTURES), DIGIT_PICTURES[53]);
  assert.equal(digitSetFor(70, DIGIT_PICTURES), DIGIT_PICTURES[70]);
});

test('a cell size smaller or larger than every real one gets no pictures', () => {
  assert.equal(digitSetFor(52, DIGIT_PICTURES), null);
  assert.equal(digitSetFor(71, DIGIT_PICTURES), null);
  assert.equal(digitSetFor(60, {}), null);
  assert.equal(digitSetFor(60, { 66: DIGIT_PICTURES[66] }), null);
});

test('a size cut from stash tabs keeps its pictures and starts where the checked sizes say numbers start', () => {
  const set = digitSetFor(66, DIGIT_PICTURES);
  assert.equal(set.pictures, DIGIT_PICTURES[66].pictures);
  assert.ok(set.start[0] <= DIGIT_PICTURES[66].start[0] && set.start[1] >= DIGIT_PICTURES[66].start[1]);
  assert.ok(set.start[0] <= Math.floor((7 * 66) / 70) && set.start[1] >= Math.ceil((10 * 66) / 53));
});

test('pictures made for a size between the real ones hold every digit, whole', () => {
  for (const size of [54, 58, 60, 65, 68, 69]) {
    const set = digitSetFor(size, DIGIT_PICTURES);
    for (const digit of '0123456789') {
      assert.ok(set.pictures.some((picture) => picture.digit === digit), `digit ${digit} at ${size}`);
    }
    for (const picture of set.pictures) {
      assert.equal(picture.white.length, picture.width * picture.height);
      assert.equal(picture.width, picture.advance + 2);
      assert.ok(picture.spread > 0);
      assert.ok(picture.top >= 1 && picture.top + picture.height <= set.rows);
    }
  }
});

test('a made digit is about as tall as the real digits on either side of its size', () => {
  const heightOf = (set, digit) => Math.max(...set.pictures.filter((picture) => picture.digit === digit).map((picture) => picture.height));
  const made = digitSetFor(60, DIGIT_PICTURES);
  for (const digit of '0123456789') {
    assert.ok(heightOf(made, digit) >= heightOf(DIGIT_PICTURES[53], digit) - 1, `digit ${digit} is not smaller than at 53`);
    assert.ok(heightOf(made, digit) <= heightOf(DIGIT_PICTURES[70], digit) + 1, `digit ${digit} is not larger than at 70`);
  }
});

test('a number drawn with the real pictures of a size reads with pictures made from the other sizes only', () => {
  const made = digitSetFor(66, { 53: DIGIT_PICTURES[53], 70: DIGIT_PICTURES[70] });
  const real = { ...DIGIT_PICTURES[66], start: made.start };
  for (const number of [1, 3, 5, 6, 8, 10, 13, 45, 64, 180]) {
    const read = vision.readStackSize(cellWith(66, real, number), made);
    // Made pictures may leave a real number unread, and never read it as another number.
    assert.ok(read.quantity === number || read.quantity === null, `${number} read as ${read.quantity}`);
    assert.equal(read.digits, true, `${number}`);
  }
  assert.deepEqual(vision.readStackSize(cellWith(66, real, 13), made), { quantity: 13, digits: true });
});

test('a cell of a size without pictures of its own reads its stack number', () => {
  const size = 60;
  const set = digitSetFor(size, DIGIT_PICTURES);
  assert.deepEqual(vision.readStackSize(cellWith(size, set, 24)), { quantity: 24, digits: true });
  assert.deepEqual(vision.readStackSize(cellWith(size, set, 107)), { quantity: 107, digits: true });
  const empty = { data: new Uint8Array(size * size * 4).fill(20), width: size, height: size };
  assert.deepEqual(vision.readStackSize(empty), { quantity: 1, digits: false });
});
