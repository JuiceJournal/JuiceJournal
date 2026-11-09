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

const MEASURED_WINDOW_HEIGHTS = new Set([1440]);

const COARSE_SIZE = 16;
const FINE_SIZE = 64;
// The game draws art at 97% of a cell, slightly off centre and rounded differently from column to column.
const FINE_ART_SIZE = 62;
const FINE_OFFSETS_X = [-1, 0, 1];
const FINE_OFFSETS_Y = [0, 1, 2];
const SHORTLIST_SIZE = 12;
const OPEN_SCORE = 0.6;
// Real inventories hid at most one border in a row and a tooltip-sized box at least three.
const COVERED_BORDER_RUN = 3;
const HIDDEN_BORDER_FLANK = 40;
const OCCUPIED_DEVIATION = 22;
// A match this close to the best one is the same picture: Greater and Perfect orbs share the base orb's art.
const SAME_ART_GAP = 0.25;
// On real screenshots items in the library scored at most 17.4 and everything else at least 21.5.
const ACCEPT_SCORE = 19;
const ACCEPT_MARGIN = 1;
// A cell whose best or next picture is an item worth this many Divine Orbs or more could be either, and an item missing
// from the price list reads as its look-alike, so such a cell counts only when its art is far ahead and close to the
// picture. A wrong read of a valuable item is what moves a map's total, so a cell that is not clear stays unread. An item
// whose value is not known counts as valuable. Measured on one real screenshot at three sizes and on rendered cells
// with the true item left out: real right reads were at least 6.7 ahead and scored at most 16.1.
const VALUABLE_DIVINE = 0.5;
const VALUABLE_MARGIN = 5.8;
const VALUABLE_SCORE = 17;
// Omens are one family of look-alikes, cheap and dear mixed, and a missing omen reads as a sibling whose own value says
// nothing. Real omen reads were at least 9.1 ahead and scored at most 11.8; sibling reads were at most 4.8 ahead.
const OMEN_MARGIN = 5;
const OMEN_SCORE = 14;
// Essences are look-alikes too: the tiers of one essence differ little, and essences of one colour as well. Each
// essence drawn from the game's art onto a real empty cell read as itself, but as little as 0.4 ahead of a sibling (real
// screenshots: 2.2 to 5.0); with itself left out it read as a sibling up to 4.0 ahead. Measured on 204 rendered cells
// with every essence's art in the library, 2026-11-09. So an essence, or a cell an essence is next to, counts only far
// ahead; any other is left for the player, who gets the two it looked like.
const ESSENCE_MARGIN = 5;
const ESSENCE_PATTERN = /Essence of /;
// Any other cell that is only a little ahead of the next picture must also be close to its own: what it shows may be a
// valuable item missing from the price list. Such wrong reads were at most 2.2 ahead and scored at least 14.8. At worst
// this leaves a cheap item unread.
const CLEAR_MARGIN = 2.3;
const CLEAR_SCORE = 12;
const DIGIT_BRIGHTNESS = 185;
const TIER_BRIGHTNESS = 170;
const DIGIT_MAX_DISTANCE = 0.35;

// The only window heights the digits and art limits have been checked on with real screenshots.
function isMeasuredWindow(windowRect) {
  return MEASURED_WINDOW_HEIGHTS.has(windowRect?.height);
}

function hasInventoryLayout(poeVersion) {
  return Object.prototype.hasOwnProperty.call(GRIDS, poeVersion);
}

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

// A border is hidden when it does not show and the area around it is dark, as under a tooltip. Bright item art next to
// a border can drown it out too, but that is not something covering the grid.
function isCellBorderHidden(image, grid, col, row) {
  const scale = grid.pitchX / 70.25;
  const reach = Math.max(1, Math.round(2 * scale));
  const side = Math.max(2, Math.round(5 * scale));
  const lineX = Math.round(col * grid.pitchX);
  let hits = 0;
  let flanks = 0;
  let total = 0;
  for (let t = 0.2; t < 0.85; t += 0.1) {
    const y = Math.round((row + t) * grid.pitchY);
    let line = 0;
    for (let d = -reach; d <= reach; d += 1) line = Math.max(line, luma(image, lineX + d, y));
    const flank = (luma(image, lineX - side, y) + luma(image, lineX + side, y)) / 2;
    if (line - flank >= 6 && line < 110) hits += 1;
    flanks += flank;
    total += 1;
  }
  return hits / total < 0.5 && flanks / total < HIDDEN_BORDER_FLANK;
}

// Whether something covers a cell that shows no picture: real empty cells show their borders, a dark tooltip does not.
function isCellCovered(image, grid, col, row) {
  const leftHidden = col === 0 || isCellBorderHidden(image, grid, col, row);
  const rightHidden = col === grid.cols - 1 || isCellBorderHidden(image, grid, col + 1, row);
  return leftHidden && rightHidden;
}

// The longest run of cell borders hidden in any row. An item's picture can hide the one border inside it, but a tooltip
// hides many in a row, and the items under it would be missing from the read.
function longestHiddenBorderRun(image, grid) {
  let longest = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    let run = 0;
    for (let col = 1; col < grid.cols; col += 1) {
      run = isCellBorderHidden(image, grid, col, row) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return longest;
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

// Area average, so a cell reads the same however the game's resolution rounds its size. Every target pixel covers at
// least one source pixel, also when the cell is smaller than the target.
function downscale(cell, size) {
  const out = new Float32Array(size * size * 3);
  for (let targetY = 0; targetY < size; targetY += 1) {
    const fromY = Math.floor((targetY * cell.height) / size);
    const toY = Math.max(fromY + 1, Math.ceil(((targetY + 1) * cell.height) / size));
    for (let targetX = 0; targetX < size; targetX += 1) {
      const fromX = Math.floor((targetX * cell.width) / size);
      const toX = Math.max(fromX + 1, Math.ceil(((targetX + 1) * cell.width) / size));
      const to = (targetY * size + targetX) * 3;
      for (let y = fromY; y < toY; y += 1) {
        for (let x = fromX; x < toX; x += 1) {
          const from = (y * cell.width + x) * 4;
          out[to] += cell.data[from];
          out[to + 1] += cell.data[from + 1];
          out[to + 2] += cell.data[from + 2];
        }
      }
      const count = (toY - fromY) * (toX - fromX);
      out[to] /= count;
      out[to + 1] /= count;
      out[to + 2] /= count;
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

// Stack size from the corner digits; items without digits are single items. Null means digits that cannot be read:
// a guess in one read would turn into a false gain or loss against the next.
function readStackSize(cell) {
  const glyphs = findStackGlyphs(cell);
  if (glyphs.length === 0) return { quantity: 1, digits: false };
  let text = '';
  for (const glyph of glyphs) {
    const digit = readDigit(glyph);
    if (digit === null) return { quantity: null, digits: true };
    text += digit;
  }
  const value = Number(text);
  return { quantity: Number.isInteger(value) && value > 0 ? value : null, digits: true };
}

// Bars in the bottom-right corner: none is the base item, II is Greater and III is Perfect.
function readTierBars(cell) {
  const scale = cell.height / 70;
  const x = Math.round(cell.width * 0.58);
  const y = Math.round(cell.height * 0.6);
  const found = brightParts(cell, { x, y, width: cell.width - x, height: cell.height - y }, TIER_BRIGHTNESS);
  return found.parts.filter((part) => part.maxY - part.minY >= 11 * scale && part.maxX - part.minX <= 6 * scale).length;
}

// Null when the bars do not name exactly one item in the group: a wrong tier can be worth hundreds of times more.
function pickFromSameArt(names, bars) {
  const only = (pattern) => {
    const found = names.filter((name) => pattern.test(name));
    return found.length === 1 ? found[0] : null;
  };
  if (bars === 2) return only(/^Greater /i);
  if (bars === 3) return only(/^Perfect /i);
  if (bars !== 0) return null;
  return names.some((name) => /^(?!Greater |Perfect |Lesser )/i.test(name))
    ? only(/^(?!Greater |Perfect |Lesser )/i)
    : only(/^Lesser /i);
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
    names: ranked.filter((item) => item.score - score <= SAME_ART_GAP).map((item) => item.entry.name),
    runnerUp: next ? next.entry.name : null
  };
}

/**
 * Finds what is in a cell. `art` is the library of priced items: { name, coarse, fine, value } with premultiplied BGRA
 * pixels, coarse at COARSE_SIZE and fine at FINE_ART_SIZE, and value in Divine Orbs. Returns { name, quantity } or null
 * for an item it does not hold or cannot tell apart clearly enough.
 */
function readCell(cell, art, match = matchCell(cell, art)) {
  if (!match || match.score >= ACCEPT_SCORE || match.margin < ACCEPT_MARGIN) return null;

  const name = match.names.length > 1 ? pickFromSameArt(match.names, readTierBars(cell)) : match.names[0];
  if (!name) return null;
  const isCheap = (itemName) => {
    const value = art.find((entry) => entry.name === itemName)?.value;
    return Number.isFinite(value) && value < VALUABLE_DIVINE;
  };
  const valuable = !isCheap(name) || (match.runnerUp !== null && !isCheap(match.runnerUp));
  if (valuable && (match.margin < VALUABLE_MARGIN || match.score > VALUABLE_SCORE)) return null;
  if (/^Omen /.test(name) && (match.margin < OMEN_MARGIN || match.score > OMEN_SCORE)) return null;
  if ((ESSENCE_PATTERN.test(name) || ESSENCE_PATTERN.test(match.runnerUp || '')) && match.margin < ESSENCE_MARGIN) return null;
  if (!valuable && match.margin < CLEAR_MARGIN && match.score > CLEAR_SCORE) return null;

  const { quantity, digits } = readStackSize(cell);
  return quantity === null ? null : { name, quantity, digits };
}

// An occupied cell left unread. One that looks like an item gets the two items it looked most like, with its stack size,
// so the player can name it with one click. Gear and the like match nothing that close. A stack whose digits do not
// read, or tiers sharing one picture that the bars do not tell apart, get no candidates: one click would add a wrong
// number or a tier worth many times more or less.
function unreadCell(cell, match) {
  if (!match || match.score >= ACCEPT_SCORE) return { unknown: true };
  const { quantity } = readStackSize(cell);
  const best = match.names.length > 1 ? pickFromSameArt(match.names, readTierBars(cell)) : match.names[0];
  if (quantity === null || !best) return { unknown: true };
  const candidates = [best, match.runnerUp].filter((name, index, list) => name && list.indexOf(name) === index);
  return { unknown: true, candidates, quantity };
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
 * Reads a grid image into { open, items: { name: quantity }, cells }, see inventoryLootModel for the cells. With
 * covered: true and no items when a tooltip hides much of the grid, since such a read would look like items leaving and
 * coming back. `cache` is an optional Map from cell pixels to results; most cells stay the same between reads, so a
 * repeat read costs almost nothing.
 */
function readInventory(image, grid, art, cache = null) {
  if (scoreGridLines(image, grid) < OPEN_SCORE) {
    return { open: false, items: {} };
  }
  if (longestHiddenBorderRun(image, grid) >= COVERED_BORDER_RUN) {
    return { open: true, covered: true, items: {} };
  }

  const items = {};
  const cells = {};
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const position = `${row},${col}`;
      const cell = cropCell(image, grid, col, row);
      if (!isOccupied(cell)) {
        // Hidden, so maybe not empty; but nothing was seen there, so it is not an item left unread either.
        if (isCellCovered(image, grid, col, row)) cells[position] = { unknown: true, covered: true };
        continue;
      }

      const key = cache ? hashCell(cell) : null;
      let read;
      if (cache && cache.has(key)) {
        read = cache.get(key);
      } else {
        const match = matchCell(cell, art);
        read = readCell(cell, art, match) || unreadCell(cell, match);
        if (cache) cache.set(key, read);
      }
      if (read.name) {
        items[read.name] = (items[read.name] || 0) + read.quantity;
        cells[position] = read;
      } else {
        // Both side borders hidden is a tooltip or a held item over the cell, not an item left unread. An item's own
        // picture hides at most the one border inside it.
        cells[position] = isCellCovered(image, grid, col, row) ? { unknown: true, covered: true } : read;
      }
    }
  }
  return { open: true, items, cells };
}

module.exports = {
  COARSE_SIZE,
  FINE_ART_SIZE,
  OPEN_SCORE,
  isMeasuredWindow,
  hasInventoryLayout,
  getGridRect,
  scoreGridLines,
  longestHiddenBorderRun,
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
