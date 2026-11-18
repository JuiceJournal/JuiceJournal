/**
 * Digit pictures for a cell size that has none of its own, made from the real pictures of other sizes.
 *
 * Resizing a real picture as it is does not give what the game draws at another size: the black edge round a digit is
 * one pixel wide at every size, and with resized pictures a 50 read as no number at all. So only the digit's white
 * fill is scaled, at a few part-pixel shifts, and the edge is drawn round it again. Checked on real screenshots by
 * reading each window height with pictures made from the other two only: 310 of 311 cells at 1080, 19 of 19 at 1440
 * and 43 of 51 at 1353 read right, the rest stayed unread and none read wrong.
 */

const { makeSet } = require('./inventoryDigitPictures');

// Cell sizes whose pictures were cut and checked on a filled inventory, at window heights 1080 and 1440. Where numbers
// start is taken from these alone: the pictures of other sizes were cut from stash tabs, a pixel or two off the grid.
const CHECKED_CELL_SIZES = [53, 70];
// How white a pixel must be to belong to a digit's fill: under 110 is edge or background, 235 and over is all fill.
const FILL_FROM = 110;
const FILL_TO = 235;
const SOLID = 0.25;
const SHIFTS = [0, 1 / 3, 2 / 3];
const FILL_WHITE = 240;
const EDGE_WHITE = 5;
const BACK_WHITE = 45;

function median(values) {
  return values.slice().sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

// One clean fill for each digit of a real set: the middle value of each pixel over the pictures of the digit's most
// common size, which takes the item art behind the digits away. 0 is no fill, 1 is all fill.
function cleanFills(set) {
  const fills = [];
  for (const digit of '0123456789') {
    const groups = new Map();
    for (const picture of set.pictures) {
      if (picture.digit !== digit) continue;
      const key = `${picture.width}x${picture.height}@${picture.top}`;
      groups.set(key, [...(groups.get(key) || []), picture]);
    }
    const group = [...groups.values()].sort((left, right) => right.length - left.length)[0];
    if (!group) return null;
    const { width, height, top } = group[0];
    const fill = new Float32Array(width * height);
    for (let i = 0; i < fill.length; i += 1) {
      const white = median(group.map((picture) => picture.white[i]));
      fill[i] = Math.min(1, Math.max(0, (white - FILL_FROM) / (FILL_TO - FILL_FROM)));
    }
    fills.push({ digit, width, height, top, fill });
  }
  return fills;
}

function fillAt(image, x, y) {
  return x < 0 || y < 0 || x >= image.width || y >= image.height ? 0 : image.fill[y * image.width + x];
}

function fillBetween(image, x, y) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const alongX = x - left;
  const alongY = y - top;
  return (fillAt(image, left, top) * (1 - alongX) + fillAt(image, left + 1, top) * alongX) * (1 - alongY)
    + (fillAt(image, left, top + 1) * (1 - alongX) + fillAt(image, left + 1, top + 1) * alongX) * alongY;
}

// The fill at `scale` times its size, moved right and down by a part of a pixel; each new pixel is the mean of what
// it covers. One pixel of room is left on every side.
function scaleFill(source, scale, shiftX, shiftY) {
  const width = Math.ceil(source.width * scale) + 2;
  const height = Math.ceil(source.height * scale) + 2;
  const fill = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let partY = 0; partY < 4; partY += 1) {
        for (let partX = 0; partX < 4; partX += 1) {
          sum += fillBetween(source, (x - 1 + shiftX + (partX + 0.5) / 4) / scale - 0.5, (y - 1 + shiftY + (partY + 0.5) / 4) / scale - 0.5);
        }
      }
      fill[y * width + x] = sum / 16;
    }
  }
  return { width, height, fill };
}

// A picture row, as the picture file holds them, of one digit at another size: the scaled fill, cut to the digit with
// one pixel round it, over a dark cell with the black edge drawn in. Null when nothing of the digit is left.
function makePicture(source, scale, shiftX, shiftY) {
  const scaled = scaleFill(source, scale, shiftX, shiftY);
  const solid = (x, y) => fillAt(scaled, x, y) >= SOLID;
  let minX = scaled.width;
  let maxX = -1;
  let minY = scaled.height;
  let maxY = -1;
  for (let y = 0; y < scaled.height; y += 1) {
    for (let x = 0; x < scaled.width; x += 1) {
      if (!solid(x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;

  const width = maxX - minX + 3;
  const height = maxY - minY + 3;
  const white = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fromX = minX - 1 + x;
      const fromY = minY - 1 + y;
      let edge = false;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          edge = edge || solid(fromX + dx, fromY + dy);
        }
      }
      const fill = fillAt(scaled, fromX, fromY);
      white[y * width + x] = Math.round(FILL_WHITE * fill + (edge ? EDGE_WHITE : BACK_WHITE) * (1 - fill));
    }
  }
  // The source picture begins one pixel above the digit, and so does the scaled one before it is cut.
  const top = Math.round((source.top - 1) * scale - shiftY + minY);
  return [source.digit, top, width - 2, width, height, white.toString('base64')];
}

// Where numbers start at a cell size, from the sizes checked on a filled inventory, a pixel wider on each side.
function startFor(cellSize, sets) {
  const edges = [];
  for (const size of CHECKED_CELL_SIZES) {
    if (!sets[size]) continue;
    edges.push(Math.floor((sets[size].start[0] * cellSize) / size) - 1, Math.ceil((sets[size].start[1] * cellSize) / size) + 1);
  }
  return edges.length > 0 ? [Math.min(...edges), Math.max(...edges)] : null;
}

// The digit pictures to read a cell size with: its own real ones if it has them, else pictures made from every real
// set. Null for a size smaller or larger than every real one: nothing was checked beyond them.
function digitSetFor(cellSize, sets) {
  const sizes = Object.keys(sets).map(Number);
  if (sets[cellSize] && CHECKED_CELL_SIZES.includes(cellSize)) return sets[cellSize];
  if (sizes.length === 0 || cellSize < Math.min(...sizes) || cellSize > Math.max(...sizes)) return null;
  const start = startFor(cellSize, sets);
  if (!start) return null;
  if (sets[cellSize]) return { ...sets[cellSize], start };

  const rows = new Map();
  for (const size of sizes) {
    const fills = cleanFills(sets[size]);
    if (!fills) return null;
    for (const fill of fills) {
      for (const shiftX of SHIFTS) {
        for (const shiftY of SHIFTS) {
          const row = makePicture(fill, cellSize / size, shiftX, shiftY);
          if (row) rows.set(row.join('|'), row);
        }
      }
    }
  }
  const made = makeSet({ start, pictures: [...rows.values()] });
  return '0123456789'.split('').every((digit) => made.pictures.some((picture) => picture.digit === digit)) ? made : null;
}

module.exports = { digitSetFor, makePicture, cleanFills };
