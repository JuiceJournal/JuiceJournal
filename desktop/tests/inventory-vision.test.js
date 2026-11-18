const test = require('node:test');
const assert = require('node:assert/strict');

const vision = require('../src/modules/inventoryVision');
const { DIGIT_PICTURES } = require('../src/modules/inventoryDigitPictures');

const WINDOW = { x: 0, y: 0, width: 2560, height: 1440 };
const GRID = vision.getGridRect('poe2', WINDOW);
const CELL_BACKGROUND = [40, 16, 8];
const BORDER = 58;

function blankGrid() {
  const data = new Uint8Array(GRID.width * GRID.height * 4);
  for (let y = 0; y < GRID.height; y += 1) {
    for (let x = 0; x < GRID.width; x += 1) {
      const i = (y * GRID.width + x) * 4;
      const onBorder = x % Math.round(GRID.pitchX) === 0 || y % Math.round(GRID.pitchY) === 0;
      data[i] = onBorder ? BORDER : CELL_BACKGROUND[0];
      data[i + 1] = onBorder ? BORDER : CELL_BACKGROUND[1];
      data[i + 2] = onBorder ? BORDER : CELL_BACKGROUND[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: GRID.width, height: GRID.height };
}

function drawGridLines(image) {
  const pitchX = GRID.pitchX;
  const pitchY = GRID.pitchY;
  const set = (x, y) => {
    const i = (y * image.width + x) * 4;
    image.data[i] = BORDER;
    image.data[i + 1] = BORDER;
    image.data[i + 2] = BORDER;
  };
  for (let col = 1; col < GRID.cols; col += 1) {
    const x = Math.round(col * pitchX);
    for (let y = 0; y < image.height; y += 1) set(x, y);
  }
  for (let row = 1; row < GRID.rows; row += 1) {
    const y = Math.round(row * pitchY);
    for (let x = 0; x < image.width; x += 1) set(x, y);
  }
}

// Art with a distinct repeatable texture, premultiplied BGRA, so a test needs no game files.
function makeArtPixels(size, seed) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      data[i] = Math.round(127 + 127 * Math.sin(seed * 3.1 + u * (5 + seed)));
      data[i + 1] = Math.round(127 + 127 * Math.sin(seed * 1.7 + v * (7 + seed)));
      data[i + 2] = Math.round(127 + 127 * Math.cos(seed * 2.3 + (u + v) * (3 + seed)));
      data[i + 3] = 255;
    }
  }
  return data;
}

function makeArt(name, seed) {
  return {
    name,
    coarse: makeArtPixels(vision.COARSE_SIZE, seed),
    fine: makeArtPixels(vision.FINE_ART_SIZE, seed)
  };
}

function paintCell(image, col, row, seed) {
  const startX = Math.round(col * GRID.pitchX);
  const startY = Math.round(row * GRID.pitchY);
  const size = Math.round(GRID.pitchX * 0.97);
  const pixels = makeArtPixels(size, seed);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const to = ((startY + y + 1) * image.width + startX + x) * 4;
      const from = (y * size + x) * 4;
      image.data[to] = pixels[from];
      image.data[to + 1] = pixels[from + 1];
      image.data[to + 2] = pixels[from + 2];
    }
  }
}

// Draws a stored digit picture into a cell where the game puts a stack number. Returns the digit's width.
function paintDigit(image, col, row, digit, offset = 0, down = 0) {
  const set = DIGIT_PICTURES[Math.round(GRID.pitchY)];
  const picture = set.pictures.find((entry) => entry.digit === digit);
  const lift = -Math.min(...picture.shape);
  const startX = Math.round(col * GRID.pitchX) + set.start[0] + offset - 1;
  const startY = Math.round(row * GRID.pitchY) + picture.top - 1 + down;
  for (let y = 0; y < picture.height; y += 1) {
    for (let x = 0; x < picture.width; x += 1) {
      const i = ((startY + y) * image.width + startX + x) * 4;
      const value = Math.round(picture.shape[y * picture.width + x] + lift);
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
    }
  }
  return picture.advance;
}

test('getGridRect keeps the inventory on the right edge and scales with height', () => {
  assert.deepEqual(
    { x: GRID.x, y: GRID.y, cols: GRID.cols, rows: GRID.rows },
    { x: 1696, y: 787, cols: 12, rows: 5 }
  );

  const wide = vision.getGridRect('poe2', { x: 0, y: 0, width: 3440, height: 1440 });
  assert.equal(wide.x, 2576);
  assert.equal(wide.y, 787);

  const small = vision.getGridRect('poe2', { x: 100, y: 50, width: 1920, height: 1080 });
  assert.equal(small.x, 100 + 1920 - 648);
  assert.equal(small.y, 50 + Math.round((787 / 1440) * 1080));
  assert.ok(Math.abs(small.pitchX - 52.69) < 0.01);
});

test('getGridRect has no answer for a game without a measured layout or a window it cannot fit', () => {
  assert.equal(vision.getGridRect('poe1', WINDOW), null);
  assert.equal(vision.getGridRect('poe2', null), null);
  assert.equal(vision.getGridRect('poe2', { x: 0, y: 0, width: 0, height: 0 }), null);
  assert.equal(vision.getGridRect('poe2', { x: 0, y: 0, width: 400, height: 1440 }), null);
});

test('an inventory grid reads as open and a blank screen as closed', () => {
  const open = blankGrid();
  assert.ok(vision.scoreGridLines(open, GRID) >= vision.OPEN_SCORE);

  const closed = { data: new Uint8Array(GRID.width * GRID.height * 4).fill(90), width: GRID.width, height: GRID.height };
  assert.ok(vision.scoreGridLines(closed, GRID) < vision.OPEN_SCORE);
  assert.deepEqual(vision.readInventory(closed, GRID, []), { open: false, items: {} });
});

test('readInventory names items by their art and adds up their stacks', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
  paintDigit(image, 0, 0, '2');
  paintCell(image, 3, 2, 2);
  paintDigit(image, 3, 2, '5');
  paintCell(image, 7, 4, 1);
  paintDigit(image, 7, 4, '3');
  drawGridLines(image);

  const result = vision.readInventory(image, GRID, [makeArt('First Orb', 1), makeArt('Second Orb', 2), makeArt('Third Orb', 3)]);

  assert.equal(result.open, true);
  assert.deepEqual(result.items, { 'First Orb': 5, 'Second Orb': 5 });
});

test('a cell without a stack size counts as one item', () => {
  const image = blankGrid();
  paintCell(image, 1, 1, 2);
  drawGridLines(image);

  const result = vision.readInventory(image, GRID, [makeArt('First Orb', 1), makeArt('Second Orb', 2)]);

  assert.deepEqual(result.items, { 'Second Orb': 1 });
});

test('an item the library does not hold is left out', () => {
  const image = blankGrid();
  paintCell(image, 1, 1, 7);
  drawGridLines(image);

  const result = vision.readInventory(image, GRID, [makeArt('First Orb', 1), makeArt('Second Orb', 2)]);

  assert.deepEqual(result.items, {});
});

test('a tooltip over the grid makes the read report it as covered, with no items', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
  drawGridLines(image);
  const art = [makeArt('First Orb', 1)];
  assert.deepEqual(vision.readInventory(image, GRID, art).items, { 'First Orb': 1 });

  for (let y = 0; y < Math.round(GRID.pitchY * 2); y += 1) {
    for (let x = Math.round(GRID.pitchX * 3); x < Math.round(GRID.pitchX * 8); x += 1) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 8;
      image.data[i + 1] = 8;
      image.data[i + 2] = 8;
    }
  }

  assert.deepEqual(vision.readInventory(image, GRID, art), { open: true, covered: true, items: {} });
});

test('an item picture hiding the border inside it is not mistaken for a tooltip', () => {
  const image = blankGrid();
  drawGridLines(image);
  for (let y = 0; y < Math.round(GRID.pitchY * 2); y += 1) {
    for (let x = 5; x < Math.round(GRID.pitchX * 2) - 5; x += 1) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 90;
      image.data[i + 1] = 60;
      image.data[i + 2] = 40;
    }
  }

  assert.equal(vision.readInventory(image, GRID, []).covered, undefined);
});

test('a stack whose digits cannot be read is left out as unread, and the rest still reads', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
  paintCell(image, 3, 1, 2);
  // Digits that make no stack size: a number does not start with 0.
  const width = paintDigit(image, 0, 0, '0');
  paintDigit(image, 0, 0, '4', width + 2);
  drawGridLines(image);

  assert.equal(vision.readStackSize(vision.cropCell(image, GRID, 0, 0)).quantity, null);
  const result = vision.readInventory(image, GRID, [makeArt('First Orb', 1), makeArt('Second Orb', 2)]);
  assert.deepEqual(result.items, { 'Second Orb': 1 });
  assert.deepEqual(result.cells['0,0'], { unknown: true });
  assert.equal(result.covered, undefined);
});

test('cells smaller than the matching size still match, so lower resolutions read', () => {
  const small = vision.getGridRect('poe2', { x: 0, y: 0, width: 1920, height: 1080 });
  const width = small.width;
  const height = small.height;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = CELL_BACKGROUND[0];
    data[i + 1] = CELL_BACKGROUND[1];
    data[i + 2] = CELL_BACKGROUND[2];
    data[i + 3] = 255;
  }
  const image = { data, width, height };
  const cellSize = Math.round(small.pitchX);
  const artSize = Math.round(small.pitchX * 0.97);
  const pixels = makeArtPixels(artSize, 2);
  for (let y = 0; y < artSize; y += 1) {
    for (let x = 0; x < artSize; x += 1) {
      const to = ((y + 1) * width + cellSize + x) * 4;
      const from = (y * artSize + x) * 4;
      data[to] = pixels[from];
      data[to + 1] = pixels[from + 1];
      data[to + 2] = pixels[from + 2];
    }
  }

  const read = vision.readCell(vision.cropCell(image, small, 1, 0), [makeArt('First Orb', 1), makeArt('Second Orb', 2)]);

  assert.equal(read.name, 'Second Orb');
});

test('window heights from 1080 to 1440 count as readable, and none under or over', () => {
  for (const height of [1080, 1200, 1353, 1440]) {
    assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 1920, height }), true, `height ${height}`);
  }
  assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 3440, height: 1440 }), true);
  for (const height of [900, 1079, 1441, 2160, NaN, undefined]) {
    assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 1920, height }), false, `height ${height}`);
  }
  assert.equal(vision.isMeasuredWindow(null), false);
});

test('every readable window height has digit pictures for its cell size', () => {
  for (let height = 1080; height <= 1440; height += 1) {
    const cell = Math.round(vision.getGridRect('poe2', { x: 0, y: 0, width: 1920, height }).pitchY);
    const empty = { data: new Uint8Array(cell * cell * 4).fill(20), width: cell, height: cell };
    assert.deepEqual(vision.readStackSize(empty), { quantity: 1, digits: false }, `height ${height}, cell ${cell}`);
  }
});

// A library entry whose art is a faint blend of another's: a look-alike that is ahead by less than the valuable bar.
function lookAlike(name, art, other, share) {
  const blend = (left, right) => Uint8Array.from(left, (value, i) => Math.round(value * (1 - share) + right[i] * share));
  return { name, coarse: blend(art.coarse, other.coarse), fine: blend(art.fine, other.fine), value: 0.01 };
}

// Cell 4,2 painted with art 1, made brighter by `lift` so it matches its own art less closely.
function liftedCell(lift = 0) {
  const image = blankGrid();
  paintCell(image, 4, 2, 1);
  drawGridLines(image);
  const cell = vision.cropCell(image, GRID, 4, 2);
  for (let i = 0; i < cell.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) cell.data[i + channel] = Math.min(255, cell.data[i + channel] + lift);
  }
  return cell;
}

// The cell's own art, a look-alike blended from it, and an unrelated item.
function lookAlikeLibrary({ name, value, twinName = 'Twin', twinValue = 0.01, share = 0.03 }) {
  const art = { ...makeArt(name, 1), value };
  return [art, { ...lookAlike(twinName, art, makeArt('Other', 2), share), value: twinValue }, { ...makeArt('Third', 3), value: 0.01 }];
}

test('a cell that could be a valuable item counts only when its art is far ahead and close to the picture', () => {
  const cell = liftedCell();
  const { score, margin } = vision.matchCell(cell, lookAlikeLibrary({ name: 'Perfect Storm Rune', value: 15 }));
  assert.ok(margin >= 2.3 && margin < 5.8 && score <= 12, `ahead by ${margin} at ${score}: only the valuable bar refuses it`);

  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Perfect Storm Rune', value: 15 })), null);
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Perfect Storm Rune', value: null })), null, 'no known value counts as valuable');
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Perfect Storm Rune', value: 0.1 })).name, 'Perfect Storm Rune');
  // A cheap read is held to the same bar when the next picture is a valuable item: the cell could be either.
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Lesser Storm Rune', value: 0.01, twinValue: 15 })), null);

  // With no look-alike in the library the same valuable item reads.
  const alone = [{ ...makeArt('Perfect Storm Rune', 1), value: 15 }, { ...makeArt('Third', 3), value: 0.01 }];
  assert.equal(vision.readCell(cell, alone).name, 'Perfect Storm Rune');
});

test('a price changes a read only by crossing the valuable bar, so a read cached under other prices on the same side stands', () => {
  const cell = liftedCell();
  const read = (value, twinValue = 0.01) => vision.readCell(cell, lookAlikeLibrary({ name: 'Perfect Storm Rune', value, twinValue }))?.name || null;

  for (const cheap of [0.0001, 0.1, 0.49]) {
    assert.equal(vision.isCheapValue(cheap), true, String(cheap));
    assert.equal(read(cheap), 'Perfect Storm Rune', `the item at ${cheap}`);
    assert.equal(read(0.1, cheap), 'Perfect Storm Rune', `its look-alike at ${cheap}`);
  }
  for (const valuable of [0.5, 0.6, 15, 400, null, NaN]) {
    assert.equal(vision.isCheapValue(valuable), false, String(valuable));
    assert.equal(read(valuable), null, `the item at ${valuable}`);
    assert.equal(read(0.1, valuable), null, `its look-alike at ${valuable}`);
  }
  assert.equal(vision.isCheapValue(undefined), false);
});

test('an omen counts only when it is clearly itself, whatever it is worth', () => {
  const cell = liftedCell();
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Omen of Refreshment', value: 0.02 })), null);

  const alone = [{ ...makeArt('Omen of Refreshment', 1), value: 0.02 }, { ...makeArt('Third', 3), value: 0.01 }];
  assert.equal(vision.readCell(cell, alone).name, 'Omen of Refreshment');
});

test('an essence counts only when it is far ahead of every look-alike, and so does a cell an essence is next to', () => {
  const cell = liftedCell();
  const { margin } = vision.matchCell(cell, lookAlikeLibrary({ name: 'Greater Essence of Ice', value: 0.01 }));
  assert.ok(margin >= 2.3 && margin < 5, `ahead by ${margin}: only the essence bar refuses it`);

  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Greater Essence of Ice', value: 0.01 })), null);
  // A cheap item whose next picture is an essence could be that essence.
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Chaos Shard', value: 0.01, twinName: 'Essence of Ice' })), null);
  assert.equal(vision.readCell(cell, lookAlikeLibrary({ name: 'Chaos Shard', value: 0.01 })).name, 'Chaos Shard');

  // With no look-alike in the library the essence reads.
  const alone = [{ ...makeArt('Greater Essence of Ice', 1), value: 0.01 }, { ...makeArt('Third', 3), value: 0.01 }];
  assert.equal(vision.readCell(cell, alone).name, 'Greater Essence of Ice');
});

test('an unread cell that looks like an item says which two it looked like, with its stack size', () => {
  const image = blankGrid();
  paintCell(image, 2, 1, 1);
  paintDigit(image, 2, 1, '3');
  drawGridLines(image);

  const { items, cells } = vision.readInventory(image, GRID, lookAlikeLibrary({ name: 'Greater Essence of Ice', value: 0.01 }));

  assert.deepEqual(items, {});
  assert.deepEqual(cells['1,2'], { unknown: true, candidates: ['Greater Essence of Ice', 'Twin'], quantity: 3 });
});

test('a cheap item only a little ahead of the next picture must also be close to its own art', () => {
  const library = (share) => lookAlikeLibrary({ name: 'Lesser Storm Rune', value: 0.01, share });
  const unclear = vision.matchCell(liftedCell(10), library(0.04));
  assert.ok(unclear.margin < 2.3 && unclear.score > 12, `ahead by ${unclear.margin} at ${unclear.score}`);

  assert.equal(vision.readCell(liftedCell(10), library(0.04)), null);
  assert.equal(vision.readCell(liftedCell(10), library(0.06)).name, 'Lesser Storm Rune', 'clearly ahead');
  assert.equal(vision.readCell(liftedCell(6), library(0.03)).name, 'Lesser Storm Rune', 'close to its own art');
});

test('a cell read reports its place, its stack and whether digits showed', () => {
  const image = blankGrid();
  paintCell(image, 4, 2, 1);
  paintDigit(image, 4, 2, '3');
  paintCell(image, 5, 2, 2);
  drawGridLines(image);

  const { cells } = vision.readInventory(image, GRID, [makeArt('First Orb', 1), makeArt('Second Orb', 2)]);

  assert.deepEqual(cells['2,4'], { name: 'First Orb', quantity: 3, digits: true });
  assert.deepEqual(cells['2,5'], { name: 'Second Orb', quantity: 1, digits: false });
  assert.equal(cells['0,0'], undefined);
});

test('a small dark patch over empty cells marks them unread instead of empty', () => {
  const image = blankGrid();
  drawGridLines(image);
  for (let y = 0; y < Math.round(GRID.pitchY); y += 1) {
    for (let x = Math.round(GRID.pitchX * 3) - 8; x < Math.round(GRID.pitchX * 4) + 8; x += 1) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 6;
      image.data[i + 1] = 6;
      image.data[i + 2] = 6;
    }
  }

  const result = vision.readInventory(image, GRID, []);

  assert.equal(result.covered, undefined);
  // Covered, not an item left unread: nothing was seen there.
  assert.deepEqual(result.cells['0,3'], { unknown: true, covered: true });
  assert.equal(result.cells['1,3'], undefined);
});

test('an item the reader cannot name is unread, but one under hidden side borders is covered', () => {
  const image = blankGrid();
  paintCell(image, 5, 2, 7);
  paintCell(image, 3, 0, 8);
  drawGridLines(image);
  // A dark tooltip over the edges of cell (0,3): both side borders and their dark flanks, with its picture between.
  for (let y = 0; y < Math.round(GRID.pitchY); y += 1) {
    for (const border of [3, 4]) {
      for (let x = Math.round(GRID.pitchX * border) - 9; x <= Math.round(GRID.pitchX * border) + 9; x += 1) {
        const i = (y * image.width + x) * 4;
        image.data[i] = 6;
        image.data[i + 1] = 6;
        image.data[i + 2] = 6;
      }
    }
  }

  const { cells } = vision.readInventory(image, GRID, []);

  assert.deepEqual(cells['2,5'], { unknown: true });
  assert.deepEqual(cells['0,3'], { unknown: true, covered: true });
});

test('tier bars that name nobody in the group leave the cell out rather than guess', () => {
  const library = [makeArt('Greater Regal Orb', 2), makeArt('Perfect Regal Orb', 2), makeArt('Other', 5)];
  const image = blankGrid();
  paintCell(image, 0, 0, 2);
  drawGridLines(image);

  assert.deepEqual(vision.readInventory(image, GRID, library).items, {});
});

test('two plain names sharing art leave the cell out rather than guess', () => {
  const library = [makeArt('Regal Orb', 2), makeArt('Royal Orb', 2), makeArt('Other', 5)];
  const image = blankGrid();
  paintCell(image, 0, 0, 2);
  drawGridLines(image);

  assert.deepEqual(vision.readInventory(image, GRID, library).items, {});
});

test('two plain names and a Lesser one still leave the cell out', () => {
  const library = [makeArt('Regal Orb', 2), makeArt('Royal Orb', 2), makeArt('Lesser Regal Orb', 2), makeArt('Other', 5)];
  const image = blankGrid();
  paintCell(image, 0, 0, 2);
  drawGridLines(image);

  assert.deepEqual(vision.readInventory(image, GRID, library).items, {});
});

test('a group whose lowest tier is Lesser reads that one without bars', () => {
  const library = [makeArt('Lesser Jeweller Orb', 2), makeArt('Greater Jeweller Orb', 2), makeArt('Other', 5)];
  const image = blankGrid();
  paintCell(image, 0, 0, 2);
  drawGridLines(image);

  assert.deepEqual(vision.readInventory(image, GRID, library).items, { 'Lesser Jeweller Orb': 1 });
});

test('an empty library reads nothing rather than failing', () => {
  const image = blankGrid();
  paintCell(image, 1, 1, 2);
  drawGridLines(image);

  const result = vision.readInventory(image, GRID, []);
  assert.equal(result.open, true);
  assert.deepEqual(result.items, {});
});

test('every cell size with digit pictures holds all ten digits', () => {
  assert.deepEqual(Object.keys(DIGIT_PICTURES), ['53', '66', '70']);
  for (const [size, set] of Object.entries(DIGIT_PICTURES)) {
    for (const digit of '0123456789') {
      assert.ok(set.pictures.some((picture) => picture.digit === digit), `digit ${digit} is missing at cell size ${size}`);
    }
  }
});

test('every digit reads back as itself', () => {
  for (const digit of '123456789') {
    const image = blankGrid();
    paintCell(image, 1, 1, 2);
    paintDigit(image, 1, 1, digit);
    assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 1, 1)), { quantity: Number(digit), digits: true }, `digit ${digit}`);
  }
});

test('the second digit of a number is never taken for its first', () => {
  const image = blankGrid();
  paintCell(image, 2, 2, 2);
  const width = paintDigit(image, 2, 2, '1');
  paintDigit(image, 2, 2, '0', width + 1);
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 2, 2)), { quantity: 10, digits: true });
});

test('a white patch of art in the corner is not a number', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
  for (let y = 4; y < 26; y += 1) {
    for (let x = 5; x < 22; x += 1) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
    }
  }
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 0, 0)), { quantity: 1, digits: false });
});

test('a digit standing off where numbers start leaves the cell unread, not without a number', () => {
  const image = blankGrid();
  paintCell(image, 1, 1, 2);
  paintDigit(image, 1, 1, '7', 9);
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 1, 1)), { quantity: null, digits: true });
});

test('a stack number reads at each cell size that has digit pictures', () => {
  for (const [size, set] of Object.entries(DIGIT_PICTURES)) {
    const side = Number(size);
    const cell = { data: new Uint8Array(side * side * 4).fill(20), width: side, height: side };
    let left = set.start[0];
    for (const digit of '24') {
      const picture = set.pictures.find((entry) => entry.digit === digit);
      const lift = -Math.min(...picture.shape);
      for (let y = 0; y < picture.height; y += 1) {
        for (let x = 0; x < picture.width; x += 1) {
          cell.data.fill(Math.round(picture.shape[y * picture.width + x] + lift), ((picture.top - 1 + y) * side + left - 1 + x) * 4, ((picture.top - 1 + y) * side + left - 1 + x) * 4 + 3);
        }
      }
      left += picture.advance + 2;
    }
    assert.deepEqual(vision.readStackSize(cell), { quantity: 24, digits: true }, `cell size ${size}`);
  }
});

test('a digit standing lower than numbers do leaves the cell unread, not without a number', () => {
  for (const digit of '19') {
    const image = blankGrid();
    paintCell(image, 1, 1, 2);
    paintDigit(image, 1, 1, digit, 0, 5);
    assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 1, 1)), { quantity: null, digits: true }, `digit ${digit}`);
  }
});

test('a digit standing further from the last one than digits do leaves the number unread, not cut short', () => {
  const image = blankGrid();
  paintCell(image, 1, 1, 2);
  const width = paintDigit(image, 1, 1, '4');
  paintDigit(image, 1, 1, '6', width + 8);
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 1, 1)), { quantity: null, digits: true });
});

test('two digits that fit a place equally well leave the number unread', () => {
  const set = DIGIT_PICTURES[Math.round(GRID.pitchY)];
  const four = set.pictures.find((entry) => entry.digit === '4');
  const twins = { ...set, pictures: [four, { ...four, digit: '9' }] };
  const image = blankGrid();
  paintCell(image, 1, 1, 2);
  paintDigit(image, 1, 1, '4');
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 1, 1), twins), { quantity: null, digits: true });
});

test('every digit picture has all its pixels and is not flat', () => {
  for (const set of Object.values(DIGIT_PICTURES)) {
    for (const picture of set.pictures) {
      assert.equal(picture.shape.length, picture.width * picture.height);
      assert.ok(picture.spread > 0);
      assert.equal(picture.width, picture.advance + 2);
    }
  }
});

test('a cell size with no digit pictures reads no stack size', () => {
  const cell = { data: new Uint8Array(40 * 40 * 4), width: 40, height: 40 };
  assert.deepEqual(vision.readStackSize(cell), { quantity: null, digits: true });
});

test('a number longer than a stack can be is unread', () => {
  const image = blankGrid();
  let offset = 0;
  for (let i = 0; i < 6; i += 1) offset += paintDigit(image, 0, 0, '1', offset) + 2;
  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 0, 0)), { quantity: null, digits: true });
});

test('multi-digit stacks read left to right', () => {
  const image = blankGrid();
  paintCell(image, 2, 2, 2);
  const width = paintDigit(image, 2, 2, '4');
  paintDigit(image, 2, 2, '7', width + 2);
  drawGridLines(image);

  assert.deepEqual(vision.readStackSize(vision.cropCell(image, GRID, 2, 2)), { quantity: 47, digits: true });
});

test('tier bars tell items that share art apart', () => {
  const library = [makeArt('Regal Orb', 2), makeArt('Greater Regal Orb', 2), makeArt('Perfect Regal Orb', 2), makeArt('Other', 5)];
  const paintBars = (image, col, row, count) => {
    const baseX = Math.round(col * GRID.pitchX) + 52;
    const baseY = Math.round(row * GRID.pitchY) + 48;
    for (let bar = 0; bar < count; bar += 1) {
      for (let y = 0; y < 14; y += 1) {
        for (let x = 0; x < 2; x += 1) {
          const i = ((baseY + y) * image.width + baseX + bar * 4 + x) * 4;
          image.data[i] = 255;
          image.data[i + 1] = 255;
          image.data[i + 2] = 255;
        }
      }
    }
  };

  const image = blankGrid();
  paintCell(image, 0, 0, 2);
  paintCell(image, 1, 0, 2);
  paintBars(image, 1, 0, 2);
  paintCell(image, 2, 0, 2);
  paintBars(image, 2, 0, 3);
  drawGridLines(image);

  const result = vision.readInventory(image, GRID, library);

  assert.deepEqual(result.items, { 'Regal Orb': 1, 'Greater Regal Orb': 1, 'Perfect Regal Orb': 1 });
});

test('the cell cache gives the same answer without matching again', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
  drawGridLines(image);
  const art = [makeArt('First Orb', 1), makeArt('Second Orb', 2)];
  const cache = new Map();

  const first = vision.readInventory(image, GRID, art, cache);
  const second = vision.readInventory(image, GRID, [], cache);

  assert.deepEqual(first.items, { 'First Orb': 1 });
  assert.deepEqual(second.items, first.items);
});

// An unread look-alike cell at `col`, `row` with a stack digit, and the library that leaves it unread.
function unreadLookAlike(col, row, digit, change = null) {
  const image = blankGrid();
  paintCell(image, col, row, 1);
  if (digit) paintDigit(image, col, row, digit);
  if (change) change(image, Math.round(col * GRID.pitchX), Math.round(row * GRID.pitchY));
  drawGridLines(image);
  return image;
}
const ESSENCE_LIBRARY = () => lookAlikeLibrary({ name: 'Greater Essence of Ice', value: 0.01 });

function learnedFrom(image, position, name) {
  const { samples } = vision.readInventory(image, GRID, ESSENCE_LIBRARY());
  return [{ name, ...samples[position] }];
}

test('an unread cell that looked like an item comes with its pixels, and a read with none has no samples', () => {
  const result = vision.readInventory(unreadLookAlike(2, 1, '3'), GRID, ESSENCE_LIBRARY());
  const size = Math.round(GRID.pitchX);

  assert.deepEqual(Object.keys(result.samples), ['1,2']);
  assert.equal(result.samples['1,2'].width, size);
  assert.equal(result.samples['1,2'].data.length, size * Math.round(GRID.pitchY) * 3);
  assert.equal('samples' in vision.readInventory(blankGrid(), GRID, []), false);
});

test('art the player named reads the same item in another cell and with another stack size', () => {
  const learned = learnedFrom(unreadLookAlike(2, 1, '3'), '1,2', 'Greater Essence of Ice');

  const later = vision.readInventory(unreadLookAlike(7, 3, '5'), GRID, ESSENCE_LIBRARY(), null, learned);

  assert.deepEqual(later.items, { 'Greater Essence of Ice': 5 });
  assert.deepEqual(later.cells['3,7'], { name: 'Greater Essence of Ice', quantity: 5, digits: true });
  assert.equal('samples' in later, false);
});

test('named art does not read a tier with other bars, a look-alike or a cell of another brightness', () => {
  const learned = learnedFrom(unreadLookAlike(2, 1, '3'), '1,2', 'Greater Essence of Ice');
  const size = Math.round(GRID.pitchX);
  const fill = (image, fromX, fromY, width, height, add) => {
    for (let y = fromY; y < fromY + height; y += 1) {
      for (let x = fromX; x < fromX + width; x += 1) {
        const i = (y * image.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) image.data[i + channel] = Math.max(0, Math.min(255, image.data[i + channel] + add));
      }
    }
  };
  const readsWith = (change) => vision.readInventory(unreadLookAlike(2, 1, '3', change), GRID, ESSENCE_LIBRARY(), null, learned).items;

  assert.deepEqual(readsWith(null), { 'Greater Essence of Ice': 3 });
  // Two tier bars in the bottom-right corner.
  assert.deepEqual(readsWith((image, x, y) => {
    fill(image, x + Math.round(size * 0.72), y + Math.round(size * 0.72), 3, 14, 255);
    fill(image, x + Math.round(size * 0.82), y + Math.round(size * 0.72), 3, 14, 255);
  }), {});
  // A look-alike: the same picture but for a small part.
  assert.deepEqual(readsWith((image, x, y) => fill(image, x + 30, y + 40, 5, 5, -120)), {});
  // The whole cell a little brighter, as under the pointer.
  assert.deepEqual(readsWith((image, x, y) => fill(image, x + 1, y + 1, size - 2, size - 2, 4)), {});
});

test('named art of two names for one picture reads as neither, and art of another cell size is not used', () => {
  const image = unreadLookAlike(2, 1, '3');
  const [sample] = learnedFrom(image, '1,2', 'Greater Essence of Ice');
  const read = (learned) => vision.readInventory(image, GRID, ESSENCE_LIBRARY(), null, learned);

  assert.deepEqual(read([sample, { ...sample, name: 'Essence of Ice' }]).items, {});
  assert.deepEqual(read([sample, { ...sample }]).items, { 'Greater Essence of Ice': 3 });
  assert.deepEqual(read([{ ...sample, width: sample.width - 1 }]).items, {});
  assert.equal(vision.matchLearned(vision.cropCell(image, GRID, 2, 1), null), null);
});

test('a cell the price list reads keeps that read, whatever named art says', () => {
  const image = blankGrid();
  paintCell(image, 4, 2, 1);
  drawGridLines(image);
  const library = [makeArt('First Orb', 1), makeArt('Second Orb', 2)];
  const cell = vision.cropCell(image, GRID, 4, 2);
  const size = cell.width * cell.height;
  const data = new Uint8Array(size * 3);
  for (let i = 0; i < size; i += 1) data.set(cell.data.subarray(i * 4, i * 4 + 3), i * 3);

  const result = vision.readInventory(image, GRID, library, null, [{ name: 'Named Wrongly', width: cell.width, height: cell.height, data }]);

  assert.deepEqual(result.items, { 'First Orb': 1 });
});

test('two samples are the same picture only when their pixels are', () => {
  const { samples } = vision.readInventory(unreadLookAlike(2, 1, '3'), GRID, ESSENCE_LIBRARY());
  const other = vision.readInventory(unreadLookAlike(9, 4, '7'), GRID, ESSENCE_LIBRARY()).samples['4,9'];
  const changed = { ...other, data: Uint8Array.from(other.data, (value, i) => (i > 9000 && i < 9600 ? 255 - value : value)) };

  assert.equal(vision.isSameSample(samples['1,2'], other), true);
  assert.equal(vision.isSameSample(samples['1,2'], changed), false);
});
