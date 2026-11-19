/**
 * The worker side of inventoryReadWorker.js: reads inventory images with the same reader the main process used to run
 * itself. It keeps the art library and the named pictures between reads, since those are sent only when they change.
 * The cell cache stays with the caller: it comes with each read, and what this read added goes back.
 */

const { parentPort } = require('worker_threads');
const { readInventory } = require('./inventoryVision');

let art = [];
let learned = null;

parentPort.on('message', (message) => {
  if (message.art) art = message.art;
  if (message.learnedChanged) learned = message.learned;
  // Prices move without the art changing, and each read holds items to the bar their current price calls for.
  message.values.forEach((value, index) => {
    if (art[index]) art[index].value = value;
  });

  const cache = message.cache ? new Map(message.cache) : null;
  const known = cache ? new Set(cache.keys()) : null;
  try {
    const read = readInventory(message.image, message.grid, art, cache, learned);
    const added = cache ? [...cache].filter(([key]) => !known.has(key)) : [];
    parentPort.postMessage({ id: message.id, read, added });
  } catch (error) {
    parentPort.postMessage({ id: message.id, error: error?.message || String(error) });
  }
});
