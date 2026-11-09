const test = require('node:test');
const assert = require('node:assert/strict');

const vision = require('../src/modules/inventoryVision');
const { DIGIT_GLYPHS, GLYPH_WIDTH, GLYPH_HEIGHT } = require('../src/modules/inventoryDigitGlyphs');

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

// Draws a stored digit shape into a cell, as the game does, white over whatever is there.
function paintDigit(image, col, row, digit, offset = 0) {
  const glyph = DIGIT_GLYPHS.find((entry) => entry.digit === digit);
  const height = 18;
  const width = Math.max(2, Math.round(height * glyph.aspect));
  const startX = Math.round(col * GRID.pitchX) + 5 + offset;
  const startY = Math.round(row * GRID.pitchY) + 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx = Math.min(GLYPH_WIDTH - 1, Math.floor(((x + 0.5) / width) * GLYPH_WIDTH));
      const gy = Math.min(GLYPH_HEIGHT - 1, Math.floor(((y + 0.5) / height) * GLYPH_HEIGHT));
      if (!glyph.cells[gy * GLYPH_WIDTH + gx]) continue;
      const i = ((startY + y) * image.width + startX + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
    }
  }
  return width;
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
  // Digit-sized, but no digit: a solid white block.
  const startX = Math.round(GRID.pitchX * 0) + 5;
  for (let y = 4; y < 22; y += 1) {
    for (let x = startX; x < startX + 13; x += 1) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
    }
  }
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

test('only measured window heights count as readable', () => {
  assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 2560, height: 1440 }), true);
  assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 3440, height: 1440 }), true);
  assert.equal(vision.isMeasuredWindow({ x: 0, y: 0, width: 1920, height: 1080 }), false);
  assert.equal(vision.isMeasuredWindow(null), false);
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

test('every digit is stored and reads back as itself', () => {
  for (const digit of '0123456789') {
    const glyph = DIGIT_GLYPHS.find((entry) => entry.digit === digit);
    assert.ok(glyph, `digit ${digit} is missing`);
    assert.equal(vision.readDigit(glyph), digit);
  }
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
