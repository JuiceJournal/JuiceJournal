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

test('a stack whose digits cannot be read makes the whole read count as covered', () => {
  const image = blankGrid();
  paintCell(image, 0, 0, 1);
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

  assert.equal(vision.readStackSize(vision.cropCell(image, GRID, 0, 0)), null);
  assert.deepEqual(vision.readInventory(image, GRID, [makeArt('First Orb', 1)]), { open: true, covered: true, items: {} });
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

test('tier bars that name nobody in the group leave the cell out rather than guess', () => {
  const library = [makeArt('Greater Regal Orb', 2), makeArt('Perfect Regal Orb', 2), makeArt('Other', 5)];
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

  assert.deepEqual(vision.readInventory(image, GRID, []), { open: true, items: {} });
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

  assert.equal(vision.readStackSize(vision.cropCell(image, GRID, 2, 2)), 47);
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
