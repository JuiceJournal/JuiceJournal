/**
 * Learned Art Store
 * Keeps the pictures of items the player named. An inventory cell the reader left unread is offered to the player with
 * the two items it looked like; when the player picks one, that cell's pixels become art for the item, and the reader
 * knows the item by them from then on (see matchLearned in inventoryVision).
 *
 * A picture is { game, name, width, height, data }, data being three bytes a pixel. The pixels of an offer wait here,
 * by run and by the offer's names, until the player names or dismisses it. They wait in memory only: what reaches the
 * disk is a picture the player named, so an offer still open when the app closes teaches nothing. Nothing is learned
 * without the player's word: a wrong read of a valuable item is what the reader must never make.
 */

const MAX_PICTURES = 300;
const MAX_PICTURES_PER_ITEM = 3;
const MAX_WAITING = 30;
// An offer adds up the cells that looked alike. More of them than this are not kept: they cannot all be checked.
const MAX_OFFER_CELLS = 4;
const MAX_NAME_LENGTH = 200;
// A cell is 105 pixels wide in a window 2160 high.
const MAX_CELL_SIZE = 160;

const cleanName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '');
const cleanNames = (names) => (Array.isArray(names) ? names : []).map(cleanName).filter(Boolean).slice(0, 2);
const keyOf = (sessionId, names) => JSON.stringify([String(sessionId), ...cleanNames(names)]);

function isPixels(sample) {
  return Number.isInteger(sample?.width) && Number.isInteger(sample?.height)
    && sample.width > 0 && sample.height > 0 && sample.width <= MAX_CELL_SIZE && sample.height <= MAX_CELL_SIZE
    && sample.data instanceof Uint8Array && sample.data.length === sample.width * sample.height * 3;
}

function packPixels({ width, height, data }) {
  return { width, height, data: Buffer.from(data).toString('base64') };
}

function unpackPixels(saved) {
  if (typeof saved?.data !== 'string') return null;
  const sample = { width: saved.width, height: saved.height, data: new Uint8Array(Buffer.from(saved.data, 'base64')) };
  return isPixels(sample) ? sample : null;
}

// What a saved file holds that can be used; anything else in it is left out.
function restore(saved) {
  const pictures = [];
  for (const entry of Array.isArray(saved?.pictures) ? saved.pictures : []) {
    const pixels = unpackPixels(entry);
    const name = cleanName(entry?.name);
    if (pixels && name && typeof entry.game === 'string' && entry.game) pictures.push({ game: entry.game, name, ...pixels });
  }
  return { pictures: pictures.slice(-MAX_PICTURES), waiting: [] };
}

/**
 * @param {object} deps
 * @param {function(): (object|null)} deps.load - The saved file's content, or null when there is none or it cannot be read
 * @param {function(object): void} deps.save
 * @param {function(object, object): boolean} deps.isSameSample - Whether two pictures show the same item
 */
function createLearnedArtStore({ load, save, isSameSample }) {
  let state = restore(load());
  let revision = 0;
  const lists = new Map();

  function persist() {
    save({
      version: 1,
      pictures: state.pictures.map((picture) => ({ game: picture.game, name: picture.name, ...packPixels(picture) }))
    });
  }

  function takeWaiting(sessionId, names) {
    const key = keyOf(sessionId, names);
    const entry = state.waiting.find((item) => item.key === key) || null;
    if (entry) state = { ...state, waiting: state.waiting.filter((item) => item !== entry) };
    return entry;
  }

  // The pixels of a run's offers wait for the player. Offers are { names, quantity, samples }; one without pixels, or
  // with more cells than can be checked, has nothing to keep.
  function hold(sessionId, game, offers) {
    for (const offer of Array.isArray(offers) ? offers : []) {
      const names = cleanNames(offer?.names);
      const samples = Array.isArray(offer?.samples) ? offer.samples : [];
      if (!game || names.length === 0 || samples.length === 0 || samples.length > MAX_OFFER_CELLS || !samples.every(isPixels)) continue;
      takeWaiting(sessionId, names);
      state = { ...state, waiting: [...state.waiting, { key: keyOf(sessionId, names), game, samples }].slice(-MAX_WAITING) };
    }
  }

  // The player dismissed an offer: its pixels are not an item's.
  function drop(sessionId, names) {
    takeWaiting(sessionId, names);
  }

  // The player named an offer. Its pixels become the item's art when the name is one the offer made and all its cells
  // show one picture: cells that only looked alike may be two items, and the name would be right for one of them.
  // Returns whether the item is known by these pixels now.
  function confirm(sessionId, names, name) {
    const entry = takeWaiting(sessionId, names);
    if (!entry) return false;
    const item = cleanName(name);
    const [first, ...rest] = entry.samples;
    if (!cleanNames(names).includes(item) || !rest.every((sample) => isSameSample(first, sample))) {
      return false;
    }

    // The same pixels under another name: the player's newer word stands.
    const kept = state.pictures.filter((picture) => !(picture.game === entry.game && picture.name !== item && isSameSample(picture, first)));
    const known = kept.some((picture) => picture.game === entry.game && picture.name === item && isSameSample(picture, first));
    let pictures = known ? kept : [...kept, { game: entry.game, name: item, ...first }];
    const ofItem = pictures.filter((picture) => picture.game === entry.game && picture.name === item);
    if (ofItem.length > MAX_PICTURES_PER_ITEM) {
      const oldest = new Set(ofItem.slice(0, ofItem.length - MAX_PICTURES_PER_ITEM));
      pictures = pictures.filter((picture) => !oldest.has(picture));
    }
    state = { ...state, pictures: pictures.slice(-MAX_PICTURES) };
    revision += 1;
    lists.clear();
    persist();
    return true;
  }

  // A game's art for the reader. The same object comes back until the art changes, and `revision` says when it did.
  function list(game) {
    if (!lists.has(game)) {
      lists.set(game, { revision, samples: state.pictures.filter((picture) => picture.game === game) });
    }
    return lists.get(game);
  }

  // How many items are known by their pictures.
  function count() {
    return new Set(state.pictures.map((picture) => JSON.stringify([picture.game, picture.name]))).size;
  }

  function clear() {
    state = { pictures: [], waiting: [] };
    revision += 1;
    lists.clear();
    persist();
  }

  return { hold, drop, confirm, list, count, clear };
}

module.exports = { createLearnedArtStore };
