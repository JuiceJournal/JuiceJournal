/**
 * Inventory Vision Module
 * Reads the inventory grid from screen pixels: is it open, which items are in it and how many.
 *
 * Works on raw BGRA pixels with no Electron or network access. Items are told apart by their art, which is the
 * same in every game language, so nothing here reads text except the stack digits.
 */

const { DIGIT_GLYPHS, GLYPH_WIDTH, GLYPH_HEIGHT } = require('./inventoryDigitGlyphs');

// Measured on PoE2 at 2560x1440. The game scales its interface with the window height and keeps the inventory on the
// right edge. PoE1's layout has not been measured, so it has no grid.
const GRIDS = {
  poe2: { rightOffset: 864 / 1440, top: 787 / 1440, pitchX: 70.25 / 1440, pitchY: 70.1 / 1440, cols: 12, rows: 5 }
};

const COARSE_SIZE = 16;
const FINE_SIZE = 64;
// The game draws art at 97% of a cell, slightly off centre and rounded differently from column to column.
const FINE_ART_SIZE = 62;
const FINE_OFFSETS_X = [-1, 0, 1];
const FINE_OFFSETS_Y = [0, 1, 2];
const SHORTLIST_SIZE = 12;
const OPEN_SCORE = 0.6;
const OCCUPIED_DEVIATION = 22;
// A match this close to the best one is the same picture: Greater and Perfect orbs share the base orb's art.
const SAME_ART_GAP = 0.25;
// On real screenshots items in the library scored at most 17.4 and everything else at least 21.5.
const ACCEPT_SCORE = 19;
const ACCEPT_MARGIN = 1;
const DIGIT_BRIGHTNESS = 185;
const TIER_BRIGHTNESS = 170;
const DIGIT_MAX_DISTANCE = 0.35;

function getGridRect(poeVersion, windowRect) {
  const layout = GRIDS[poeVersion];
  if (!layout || !windowRect || !(windowRect.width > 0) || !(windowRect.height > 0)) {
    return null;
  }

  const { height } = windowRect;
  const pitchX = layout.pitchX * height;
  const pitchY = layout.pitchY * height;
  const x = Math.round(windowRect.x + windowRect.width - layout.rightOffset * height);
  const y = Math.round(windowRect.y + layout.top * height);
  const width = Math.ceil(pitchX * layout.cols);
  const rectHeight = Math.ceil(pitchY * layout.rows);
  if (x < windowRect.x || x + width > windowRect.x + windowRect.width || y + rectHeight > windowRect.y + height) {
    return null;
  }

  return { x, y, width, height: rectHeight, pitchX, pitchY, cols: layout.cols, rows: layout.rows };
}

function luma(image, x, y) {
  const i = (y * image.width + x) * 4;
  return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
}

// How many cell borders stand out from the pixels on both sides of them, 0 to 1. Only the grid has these lines at
// this spacing, so the check needs no game text and is not fooled by items in the cells. `image` starts at the grid.
function scoreGridLines(image, grid) {
  const scale = grid.pitchX / 70.25;
  const reach = Math.max(1, Math.round(2 * scale));
  const side = Math.max(2, Math.round(5 * scale));
  const lines = [];

  const lineScore = (sample) => {
    let hits = 0;
    let total = 0;
    for (let t = 0.2; t < 0.85; t += 0.1) {
      for (const [line, flank] of sample(t)) {
        if (line - flank >= 6 && line < 110) hits += 1;
        total += 1;
      }
    }
    return hits / total;
  };

  for (let col = 1; col < grid.cols; col += 1) {
    const lineX = Math.round(col * grid.pitchX);
    lines.push(lineScore((t) => {
      const samples = [];
      for (let row = 0; row < grid.rows; row += 1) {
        const y = Math.round((row + t) * grid.pitchY);
        let line = 0;
        for (let d = -reach; d <= reach; d += 1) line = Math.max(line, luma(image, lineX + d, y));
        samples.push([line, (luma(image, lineX - side, y) + luma(image, lineX + side, y)) / 2]);
      }
      return samples;
    }));
  }

  for (let row = 1; row < grid.rows; row += 1) {
    const lineY = Math.round(row * grid.pitchY);
    lines.push(lineScore((t) => {
      const samples = [];
      for (let col = 0; col < grid.cols; col += 1) {
        const x = Math.round((col + t) * grid.pitchX);
        let line = 0;
        for (let d = -reach; d <= reach; d += 1) line = Math.max(line, luma(image, x, lineY + d));
        samples.push([line, (luma(image, x, lineY - side) + luma(image, x, lineY + side)) / 2]);
      }
      return samples;
    }));
  }

  return lines.reduce((sum, value) => sum + value, 0) / lines.length;
}

function cropCell(image, grid, col, row) {
  const x = Math.round(col * grid.pitchX);
  const y = Math.round(row * grid.pitchY);
  const width = Math.round(grid.pitchX);
  const height = Math.round(grid.pitchY);
  const data = new Uint8Array(width * height * 4);
  for (let line = 0; line < height; line += 1) {
    const start = ((y + line) * image.width + x) * 4;
    data.set(image.data.subarray(start, start + width * 4), line * width * 4);
  }
  return { data, width, height };
}

function isOccupied(cell) {
  const count = cell.width * cell.height;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < count; i += 1) {
    const value = (cell.data[i * 4] + cell.data[i * 4 + 1] + cell.data[i * 4 + 2]) / 3;
    sum += value;
    squares += value * value;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, squares / count - mean * mean)) > OCCUPIED_DEVIATION;
}

// Area average, so a cell reads the same however the game's resolution rounds its size.
function downscale(cell, size) {
  const out = new Float32Array(size * size * 3);
  const weights = new Float32Array(size * size);
  for (let y = 0; y < cell.height; y += 1) {
    const targetY = Math.min(size - 1, Math.floor((y / cell.height) * size));
    for (let x = 0; x < cell.width; x += 1) {
      const targetX = Math.min(size - 1, Math.floor((x / cell.width) * size));
      const from = (y * cell.width + x) * 4;
      const to = targetY * size + targetX;
      out[to * 3] += cell.data[from];
      out[to * 3 + 1] += cell.data[from + 1];
      out[to * 3 + 2] += cell.data[from + 2];
      weights[to] += 1;
    }
  }
  for (let i = 0; i < weights.length; i += 1) {
    if (weights[i] > 0) {
      out[i * 3] /= weights[i];
      out[i * 3 + 1] /= weights[i];
      out[i * 3 + 2] /= weights[i];
    }
  }
  return out;
}

// The cell colour behind the art, from the bottom-left corner where neither digits nor tier marks sit.
function backgroundOf(cell) {
  const reachX = Math.max(2, Math.round(cell.width * 0.04));
  const size = Math.max(3, Math.round(cell.width * 0.07));
  const out = [0, 0, 0];
  let count = 0;
  for (let y = cell.height - reachX - size; y < cell.height - reachX; y += 1) {
    for (let x = reachX; x < reachX + size; x += 1) {
      const i = (y * cell.width + x) * 4;
      out[0] += cell.data[i];
      out[1] += cell.data[i + 1];
      out[2] += cell.data[i + 2];
      count += 1;
    }
  }
  return out.map((value) => value / count);
}

function isMarkArea(x, y, size) {
  return (x < size * 0.36 && y < size * 0.38) || (x > size * 0.6 && y > size * 0.66);
}

// Mean difference per colour channel between a cell and art drawn over the cell's background; art is premultiplied BGRA.
function compareArt(cellPixels, background, art, artSize, size, offsetX = 0, offsetY = 0) {
  let total = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    const artY = y - offsetY;
    for (let x = 0; x < size; x += 1) {
      if (isMarkArea(x, y, size)) continue;
      const artX = x - offsetX;
      const cell = (y * size + x) * 3;
      let blue = background[0];
      let green = background[1];
      let red = background[2];
      if (artX >= 0 && artY >= 0 && artX < artSize && artY < artSize) {
        const from = (artY * artSize + artX) * 4;
        const clear = 1 - art[from + 3] / 255;
        blue = art[from] + background[0] * clear;
        green = art[from + 1] + background[1] * clear;
        red = art[from + 2] + background[2] * clear;
      }
      total += Math.abs(cellPixels[cell] - blue) + Math.abs(cellPixels[cell + 1] - green) + Math.abs(cellPixels[cell + 2] - red);
      count += 3;
    }
  }
  return total / count;
}

function compareFineArt(cellPixels, background, art) {
  let best = Infinity;
  for (const offsetY of FINE_OFFSETS_Y) {
    for (const offsetX of FINE_OFFSETS_X) {
      best = Math.min(best, compareArt(cellPixels, background, art, FINE_ART_SIZE, FINE_SIZE, offsetX, offsetY));
    }
  }
  return best;
}

function brightParts(cell, region, threshold) {
  const { width, height } = region;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = ((region.y + y) * cell.width + region.x + x) * 4;
      if (Math.min(cell.data[i], cell.data[i + 1], cell.data[i + 2]) > threshold) {
        mask[y * width + x] = 1;
      }
    }
  }

  const seen = new Uint8Array(mask.length);
  const parts = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (queue.length > 0) {
      const at = queue.pop();
      const x = at % width;
      const y = Math.floor(at / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    parts.push({ minX, maxX, minY, maxY });
  }
  return { parts, mask, width };
}

function glyphOf(found, part) {
  const width = part.maxX - part.minX + 1;
  const height = part.maxY - part.minY + 1;
  const cells = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  for (let y = 0; y < GLYPH_HEIGHT; y += 1) {
    for (let x = 0; x < GLYPH_WIDTH; x += 1) {
      const sourceX = part.minX + Math.min(width - 1, Math.floor(((x + 0.5) / GLYPH_WIDTH) * width));
      const sourceY = part.minY + Math.min(height - 1, Math.floor(((y + 0.5) / GLYPH_HEIGHT) * height));
      cells[y * GLYPH_WIDTH + x] = found.mask[sourceY * found.width + sourceX];
    }
  }
  return { cells, aspect: width / height };
}

// The digit shapes in a cell's top-left corner, left to right. An empty list means the item shows no stack size.
function findStackGlyphs(cell) {
  const scale = cell.height / 70;
  const found = brightParts(cell, {
    x: 0,
    y: 0,
    width: Math.round(cell.width * 0.94),
    height: Math.round(cell.height * 0.46)
  }, DIGIT_BRIGHTNESS);
  const candidates = found.parts
    .filter((part) => {
      const height = part.maxY - part.minY + 1;
      const width = part.maxX - part.minX + 1;
      return height >= 12 * scale && height <= 22 * scale && width >= 2 && width <= 16 * scale && part.minY <= 14 * scale;
    })
    .sort((left, right) => left.minX - right.minX);

  const run = [];
  for (const part of candidates) {
    const limit = run.length === 0 ? part.minX <= 24 * scale : part.minX - run[run.length - 1].maxX <= 7 * scale;
    if (limit) run.push(part);
  }
  return run.map((part) => glyphOf(found, part));
}

function glyphDistance(left, right) {
  let total = 0;
  for (let i = 0; i < left.cells.length; i += 1) {
    total += Math.abs(left.cells[i] - right.cells[i]);
  }
  return total / left.cells.length + Math.abs(left.aspect - right.aspect) * 0.5;
}

function readDigit(glyph, samples = DIGIT_GLYPHS) {
  let best = null;
  for (const sample of samples) {
    const distance = glyphDistance(glyph, sample);
    if (!best || distance < best.distance) best = { digit: sample.digit, distance };
  }
  return best && best.distance <= DIGIT_MAX_DISTANCE ? best.digit : null;
}

// Stack size from the corner digits. Items without digits are single items; digits that cannot be read count as one
// too, so a misread can only undercount.
function readStackSize(cell) {
  const glyphs = findStackGlyphs(cell);
  if (glyphs.length === 0) return 1;
  let text = '';
  for (const glyph of glyphs) {
    const digit = readDigit(glyph);
    if (digit === null) return 1;
    text += digit;
  }
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

// Bars in the bottom-right corner: none is the base item, II is Greater and III is Perfect.
function readTierBars(cell) {
  const scale = cell.height / 70;
  const x = Math.round(cell.width * 0.58);
  const y = Math.round(cell.height * 0.6);
  const found = brightParts(cell, { x, y, width: cell.width - x, height: cell.height - y }, TIER_BRIGHTNESS);
  return found.parts.filter((part) => part.maxY - part.minY >= 11 * scale && part.maxX - part.minX <= 6 * scale).length;
}

function pickFromSameArt(names, bars) {
  const wanted = bars === 2 ? /^Greater /i : bars === 3 ? /^Perfect /i : /^(?!Greater |Perfect |Lesser )/i;
  return names.find((name) => wanted.test(name)) || names[0];
}

// The best art for a cell and how far ahead of the next different picture it is.
function matchCell(cell, art) {
  const background = backgroundOf(cell);
  const coarsePixels = downscale(cell, COARSE_SIZE);
  const shortlist = art
    .map((entry) => ({ entry, score: compareArt(coarsePixels, background, entry.coarse, COARSE_SIZE, COARSE_SIZE) }))
    .sort((left, right) => left.score - right.score)
    .slice(0, SHORTLIST_SIZE);

  const finePixels = downscale(cell, FINE_SIZE);
  const ranked = shortlist
    .map(({ entry }) => ({ entry, score: compareFineArt(finePixels, background, entry.fine) }))
    .sort((left, right) => left.score - right.score);
  if (ranked.length === 0) return null;

  const score = ranked[0].score;
  const next = ranked.find((item) => item.score - score > SAME_ART_GAP);
  return {
    score,
    margin: next ? next.score - score : Infinity,
    names: ranked.filter((item) => item.score - score <= SAME_ART_GAP).map((item) => item.entry.name)
  };
}

/**
 * Finds what is in a cell. `art` is the library of priced items: { name, coarse, fine } with premultiplied BGRA pixels,
 * coarse at COARSE_SIZE and fine at FINE_ART_SIZE. Returns { name, quantity } or null for an item it does not hold.
 */
function readCell(cell, art) {
  const match = matchCell(cell, art);
  if (!match || match.score >= ACCEPT_SCORE || match.margin < ACCEPT_MARGIN) return null;

  return {
    name: match.names.length > 1 ? pickFromSameArt(match.names, readTierBars(cell)) : match.names[0],
    quantity: readStackSize(cell)
  };
}

function hashCell(cell) {
  let hash = 2166136261;
  for (let i = 0; i < cell.data.length; i += 1) {
    if (i % 4 === 3) continue;
    hash ^= cell.data[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Reads a grid image into { open, items: { name: quantity } }. `cache` is an optional Map from cell pixels to results;
 * most cells stay the same between reads, so a repeat read costs almost nothing.
 */
function readInventory(image, grid, art, cache = null) {
  if (scoreGridLines(image, grid) < OPEN_SCORE) {
    return { open: false, items: {} };
  }

  const items = {};
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cell = cropCell(image, grid, col, row);
      if (!isOccupied(cell)) continue;

      const key = cache ? hashCell(cell) : null;
      let read;
      if (cache && cache.has(key)) {
        read = cache.get(key);
      } else {
        read = readCell(cell, art);
        if (cache) cache.set(key, read);
      }
      if (read) {
        items[read.name] = (items[read.name] || 0) + read.quantity;
      }
    }
  }
  return { open: true, items };
}

module.exports = {
  COARSE_SIZE,
  FINE_ART_SIZE,
  OPEN_SCORE,
  getGridRect,
  scoreGridLines,
  cropCell,
  isOccupied,
  matchCell,
  readCell,
  readStackSize,
  readTierBars,
  findStackGlyphs,
  readDigit,
  readInventory
};
