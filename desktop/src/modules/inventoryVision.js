/**
 * Inventory Vision Module
 * Reads the inventory grid from screen pixels: is it open, which items are in it and how many.
 *
 * Works on raw BGRA pixels with no Electron or network access. Items are told apart by their art, which is the
 * same in every game language, so nothing here reads text except the stack digits.
 */

const { DIGIT_PICTURES } = require('./inventoryDigitPictures');
const { digitSetFor } = require('./inventoryDigitMaker');

// Measured on PoE2 at 2560x1440. The game scales its interface with the window height and keeps the inventory on the
// right edge. PoE1's layout has not been measured, so it has no grid.
const GRIDS = {
  poe2: { rightOffset: 864 / 1440, top: 787 / 1440, pitchX: 70.25 / 1440, pitchY: 70.1 / 1440, cols: 12, rows: 5 }
};

const MIN_WINDOW_HEIGHT = 1080;
const MAX_WINDOW_HEIGHT = 1440;

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
// Whether a price in Divine Orbs is known and under that bar. This is all a read takes from a price.
function isCheapValue(value) {
  return Number.isFinite(value) && value < VALUABLE_DIVINE;
}
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
const TIER_BRIGHTNESS = 170;
// Stack digits are matched against pictures of the game's own digits, one set for each cell size. Measured on 381
// cells from real screenshots at window heights 1440, 1353 and 1080, each digit judged by pictures from other cells:
// the 529 real digits fit at 0.87 or more, and where a number ends, or an item has none, nothing fit above 0.52.
// Between the two limits the number stays unread. Pictures stretched from another size do not do: with them a 50
// read as no number at all; a size without pictures of its own gets made ones (inventoryDigitMaker.js).
const DIGIT_SURE = 0.8;
const DIGIT_NONE = 0.65;
const DIGIT_LEAD = 0.05;
// A patch this even holds no digit: a digit is white with a black edge.
const DIGIT_FLAT = 30;
const MAX_STACK_DIGITS = 5;
// The grid is found to a pixel or two, so a number may sit that far from where the pictures were cut.
const DIGIT_SLACK = 2;
// How far around that, in pixels of a 1440 window, nothing like a digit may be found for a cell to count as having no
// number, and how far past the end of a number for the number to count as whole.
const DIGIT_REACH = 6;

// The window heights read. The digits, tier bars and art limits were checked on real screenshots of a filled inventory
// at both ends, 1080 and 1440; a height between them is read with digit pictures made from the real ones. Nothing was
// checked under or over them.
function isMeasuredWindow(windowRect) {
  const height = windowRect?.height;
  return Number.isFinite(height) && height >= MIN_WINDOW_HEIGHT && height <= MAX_WINDOW_HEIGHT;
}

const madeDigitSets = new Map();

// The digit pictures of a cell size: its own, or ones made once from the real sets and kept.
function digitPicturesFor(cellSize) {
  if (!madeDigitSets.has(cellSize)) madeDigitSets.set(cellSize, digitSetFor(cellSize, DIGIT_PICTURES));
  return madeDigitSets.get(cellSize);
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
  return downscaleStep(cell, size, 4);
}

// `step` is the bytes a pixel takes in `cell.data`.
function downscaleStep(cell, size, step) {
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
          const from = (y * cell.width + x) * step;
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

// How white each pixel of the top of a cell is: digits are white, so the weakest colour channel shows them best.
function whitenessOf(cell, rows) {
  const height = Math.min(cell.height, rows);
  const data = new Uint8Array(cell.width * height);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.min(cell.data[i * 4], cell.data[i * 4 + 1], cell.data[i * 4 + 2]);
  }
  return { data, width: cell.width, height };
}

// How well a digit picture fits the cell with its top-left corner at x, y: 1 is the same shape, whatever the
// brightness or contrast; 0 is no likeness.
function fitDigitPicture(white, picture, x, y) {
  const { width, height } = picture;
  if (x < 0 || y < 0 || x + width > white.width || y + height > white.height) return -1;
  const count = width * height;
  let sum = 0;
  for (let row = 0; row < height; row += 1) {
    const at = (y + row) * white.width + x;
    for (let col = 0; col < width; col += 1) sum += white.data[at + col];
  }
  const mean = sum / count;
  let both = 0;
  let spread = 0;
  for (let row = 0; row < height; row += 1) {
    const at = (y + row) * white.width + x;
    for (let col = 0; col < width; col += 1) {
      const value = white.data[at + col] - mean;
      both += value * picture.shape[row * width + col];
      spread += value * value;
    }
  }
  if (spread < count * DIGIT_FLAT * DIGIT_FLAT) return 0;
  return both / Math.sqrt(spread * picture.spread);
}

// The best fit of each digit with its left edge at x.
function fitDigitsAt(white, pictures, x) {
  const fits = new Map();
  for (const picture of pictures) {
    for (let y = picture.top - 1 - DIGIT_SLACK; y <= picture.top - 1 + DIGIT_SLACK; y += 1) {
      const score = fitDigitPicture(white, picture, x - 1, y);
      const held = fits.get(picture.digit);
      if (!held || score > held.score) fits.set(picture.digit, { digit: picture.digit, score, x, advance: picture.advance });
    }
  }
  return fits;
}

// The next digit of a number, looked for from the left: the first place where a digit fits closely is the digit, so
// the 0 of a 10 is never taken for the number's first digit. False where nothing looks like a digit (the number has
// ended), null where something does and it is not clear which.
function nextDigit(white, pictures, fromX, toX, startsFrom = null, digitApart = 0) {
  let strongest = 0;
  const seen = [];
  for (let x = fromX; x <= toX; x += 1) {
    const fits = fitDigitsAt(white, pictures, x);
    let here = 0;
    for (const fit of fits.values()) here = Math.max(here, fit.score);
    seen.push(here);
    strongest = Math.max(strongest, here);
    if (here < DIGIT_SURE) continue;
    // Where a number starts, something that may be a digit, standing where numbers start and a digit's width or more
    // before this one, would be dropped from the number by taking this one.
    if (startsFrom !== null && seen.slice(Math.max(0, startsFrom - fromX), Math.max(0, seen.length - digitApart)).some((score) => score >= DIGIT_NONE)) return null;
    // The digit may sit one pixel further on, where it fits better still.
    for (const [digit, fit] of fitDigitsAt(white, pictures, x + 1)) {
      if (fit.score > fits.get(digit).score) fits.set(digit, fit);
    }
    const [best, next] = [...fits.values()].sort((left, right) => right.score - left.score);
    return next && best.score - next.score < DIGIT_LEAD ? null : best;
  }
  return strongest < DIGIT_NONE ? false : null;
}

// Whether anything like a digit stands with its left edge between fromX and toX, up to reachY pixels above or below
// where digits stand. Asked where the reader found none: beside the place numbers start, for a cell not cut where the
// grid is, and past the end of a number, for a digit standing further off than the next one should. Either way the
// number read so far, or the lack of one, cannot be trusted.
function hasDigitWithin(white, pictures, fromX, toX, reachY) {
  for (const picture of pictures) {
    for (let y = picture.top - 1 - reachY; y <= picture.top - 1 + reachY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) {
        if (fitDigitPicture(white, picture, x - 1, y) >= DIGIT_NONE) return true;
      }
    }
  }
  return false;
}

// Stack size from the corner digits; items without digits are single items. Null means digits that cannot be read:
// a guess in one read would turn into a false gain or loss against the next. The number is walked from where numbers
// start: each digit must fit a picture closely and clearly better than any other digit, and the number ends where
// nothing fits at all. Anything in between, and a cell size with no pictures, is unread.
function readStackSize(cell, set = digitPicturesFor(cell.height)) {
  const unread = { quantity: null, digits: true };
  if (!set) return unread;
  const step = cell.height / 70;
  const reach = Math.round(DIGIT_REACH * step);
  const white = whitenessOf(cell, set.rows + reach);
  let fromX = set.start[0] - DIGIT_SLACK;
  let toX = set.start[1] + DIGIT_SLACK;
  let text = '';
  for (let place = 0; place <= MAX_STACK_DIGITS; place += 1) {
    const digit = place === 0
      ? nextDigit(white, set.pictures, fromX, toX, set.start[0], Math.max(3, Math.round(4 * step)))
      : nextDigit(white, set.pictures, fromX, toX);
    if (digit === false) break;
    if (digit === null || place === MAX_STACK_DIGITS) return unread;
    text += digit.digit;
    fromX = Math.floor(digit.x + digit.advance - step - 1);
    toX = Math.ceil(digit.x + digit.advance + 3 * step + 1);
  }
  if (text === '') {
    return hasDigitWithin(white, set.pictures, set.start[0] - reach, set.start[1] + reach, reach) ? unread : { quantity: 1, digits: false };
  }
  if (text[0] === '0' || hasDigitWithin(white, set.pictures, toX + 1, toX + reach, DIGIT_SLACK)) return unread;
  return { quantity: Number(text), digits: true };
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
  const isCheap = (itemName) => isCheapValue(art.find((entry) => entry.name === itemName)?.value);
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

// Art the player named: the pixels of a cell from the game itself, kept as { name, width, height, data } with three
// bytes a pixel. Art from the price list is smaller than the game draws it, so a cell is 8 to 13 away from its own
// picture and look-alikes sit inside that. A cell against an earlier cell of the same item is the same picture: on real
// screenshots they were at most 0.1 apart with no pixel far off, tiers that differ only by their bars 5.5 apart with
// 179 pixels far off, and the closest pair of different pictures drawn from the price list's art 1.8 apart with 80.
const LEARNED_MEAN = 1;
const LEARNED_FAR = 60;
const LEARNED_FAR_PIXELS = 8;
// The cheap first look, on COARSE_SIZE pixels: a cell of the same item drawn a pixel aside stays well under this.
const LEARNED_COARSE = 8;
const LEARNED_EDGE = 2;

// The stack digits; a stack that grew is still the same item. The tier bars stay in: they tell tiers apart.
function isDigitArea(x, y, size) {
  return x < size * 0.36 && y < size * 0.38;
}

function toSample(cell) {
  const data = new Uint8Array(cell.width * cell.height * 3);
  for (let i = 0, to = 0; i < cell.width * cell.height; i += 1, to += 3) {
    data[to] = cell.data[i * 4];
    data[to + 1] = cell.data[i * 4 + 1];
    data[to + 2] = cell.data[i * 4 + 2];
  }
  return { width: cell.width, height: cell.height, data };
}

// A cell's result comes from the cache while its pixels stay the same, so its pixels are copied once.
const keptSamples = new WeakMap();
function sampleOf(read, cell) {
  if (!keptSamples.has(read)) keptSamples.set(read, toSample(cell));
  return keptSamples.get(read);
}

function coarseOf(pixels, step) {
  if (!pixels.coarse) {
    Object.defineProperty(pixels, 'coarse', { value: downscaleStep(pixels, COARSE_SIZE, step) });
  }
  return pixels.coarse;
}

// Whether two pictures of one size are the same item's, at the best of nine one-pixel shifts. `leftStep` and
// `rightStep` are the bytes a pixel takes: 4 for a cell, 3 for kept art.
function isSamePicture(left, leftStep, right, rightStep) {
  if (left.width !== right.width || left.height !== right.height) return false;
  const leftCoarse = coarseOf(left, leftStep);
  const rightCoarse = coarseOf(right, rightStep);
  let coarse = 0;
  for (let i = 0; i < leftCoarse.length; i += 1) coarse += Math.abs(leftCoarse[i] - rightCoarse[i]);
  if (coarse / leftCoarse.length > LEARNED_COARSE) return false;

  const { width, height } = left;
  for (let shiftY = -1; shiftY <= 1; shiftY += 1) {
    for (let shiftX = -1; shiftX <= 1; shiftX += 1) {
      let total = 0;
      let count = 0;
      let far = 0;
      for (let y = LEARNED_EDGE; y < height - LEARNED_EDGE && far <= LEARNED_FAR_PIXELS; y += 1) {
        for (let x = LEARNED_EDGE; x < width - LEARNED_EDGE; x += 1) {
          if (isDigitArea(x, y, width)) continue;
          const a = (y * width + x) * leftStep;
          const b = ((y + shiftY) * width + x + shiftX) * rightStep;
          const difference = Math.abs(left.data[a] - right.data[b]) + Math.abs(left.data[a + 1] - right.data[b + 1])
            + Math.abs(left.data[a + 2] - right.data[b + 2]);
          total += difference;
          count += 3;
          if (difference > LEARNED_FAR) far += 1;
        }
      }
      if (far <= LEARNED_FAR_PIXELS && total / count <= LEARNED_MEAN) return true;
    }
  }
  return false;
}

function isSameSample(left, right) {
  return isSamePicture(left, 3, right, 3);
}

// The item a cell is, by art the player named. Null when no kept art is this picture, or art of two names is: one of
// the two was named wrongly, and which is not known.
function matchLearned(cell, learned) {
  let found = null;
  for (const sample of learned || []) {
    if (sample.name === found || !isSamePicture(cell, 4, sample, 3)) continue;
    if (found !== null) return null;
    found = sample.name;
  }
  return found;
}

function readLearned(cell, learned) {
  const name = matchLearned(cell, learned);
  if (!name) return null;
  const { quantity, digits } = readStackSize(cell);
  return quantity === null ? null : { name, quantity, digits };
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
 * repeat read costs almost nothing. `learned` is art the player named, see matchLearned: it reads a cell the price
 * list's art leaves unread, and a cache has to be emptied when it changes. `samples` holds the pixels of each unread
 * cell that looked like an item, by position, for the player to name.
 */
function readInventory(image, grid, art, cache = null, learned = null) {
  if (scoreGridLines(image, grid) < OPEN_SCORE) {
    return { open: false, items: {} };
  }
  if (longestHiddenBorderRun(image, grid) >= COVERED_BORDER_RUN) {
    return { open: true, covered: true, items: {} };
  }

  const items = {};
  const cells = {};
  const samples = {};
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
        read = readCell(cell, art, match) || readLearned(cell, learned) || unreadCell(cell, match);
        if (cache) cache.set(key, read);
      }
      if (read.name) {
        items[read.name] = (items[read.name] || 0) + read.quantity;
        cells[position] = read;
      } else {
        // Both side borders hidden is a tooltip or a held item over the cell, not an item left unread. An item's own
        // picture hides at most the one border inside it.
        cells[position] = isCellCovered(image, grid, col, row) ? { unknown: true, covered: true } : read;
        if (cells[position].candidates) samples[position] = sampleOf(read, cell);
      }
    }
  }
  return Object.keys(samples).length > 0 ? { open: true, items, cells, samples } : { open: true, items, cells };
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
  isCheapValue,
  readStackSize,
  readTierBars,
  fitDigitPicture,
  isSameSample,
  matchLearned,
  readInventory
};
