/**
 * Runs the inventory reader in a worker thread. A read of a full inventory whose cells all changed takes from a third
 * of a second to over a second, measured on 2026-11-19, and on the main thread it held up the overlay, the hotkeys and
 * every message to the window for that long.
 *
 * The caller keeps the cell cache: it goes with each read and the read answers with what it added, so the caller still
 * decides when the cache is emptied. The art library and the named pictures go to the worker only when they change.
 * If the worker cannot start, fails or stops answering, reads run on the main thread as they did before.
 */

const path = require('path');
const { readInventory } = require('./inventoryVision');

const READ_TIMEOUT_MS = 10_000;

function defaultCreateWorker() {
  const { Worker } = require('worker_threads');
  return new Worker(path.join(__dirname, 'inventoryReadThread.js'));
}

function createInventoryReadWorker({ createWorker = defaultCreateWorker, timeoutMs = READ_TIMEOUT_MS, onFallback = () => {} } = {}) {
  let worker = null;
  let broken = false;
  let nextId = 1;
  const waiting = new Map();
  let sentArt = null;
  let sentLearned;

  function fail(error) {
    if (broken) return;
    broken = true;
    const failed = worker;
    worker = null;
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(error);
    }
    waiting.clear();
    failed?.terminate?.();
    onFallback(error);
  }

  function start() {
    worker = createWorker();
    worker.on('message', (message) => {
      const entry = waiting.get(message?.id);
      if (!entry) return;
      waiting.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) {
        entry.reject(new Error(message.error));
      } else {
        entry.resolve({ read: message.read, added: message.added || [] });
      }
    });
    worker.on('error', (error) => fail(error));
    worker.on('exit', (code) => fail(new Error(`The inventory reader stopped (${code})`)));
  }

  // Resolves to { read, added }: the reader's result and the cell cache entries the read added.
  function read(image, grid, art, cache = null, learned = null) {
    if (!broken && !worker) {
      try {
        start();
      } catch (error) {
        fail(error);
      }
    }
    if (broken) {
      // The main thread reads as before, into the caller's cache itself.
      return Promise.resolve({ read: readInventory(image, grid, art, cache, learned), added: [] });
    }

    const id = nextId;
    nextId += 1;
    const message = {
      id,
      image: { data: image.data, width: image.width, height: image.height },
      grid,
      values: art.map((entry) => entry.value),
      cache: cache ? [...cache] : null
    };
    const artChanged = art !== sentArt;
    if (artChanged) {
      message.art = art.map(({ name, value, coarse, fine }) => ({ name, value, coarse, fine }));
    }
    const learnedChanged = learned !== sentLearned;
    if (learnedChanged) {
      message.learnedChanged = true;
      message.learned = learned;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('The inventory reader did not answer')), timeoutMs);
      waiting.set(id, { resolve, reject, timer });
      try {
        worker.postMessage(message);
        if (artChanged) sentArt = art;
        if (learnedChanged) sentLearned = learned;
      } catch (error) {
        fail(error);
      }
    });
  }

  function close() {
    const closing = worker;
    worker = null;
    broken = true;
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(new Error('The inventory reader was closed'));
    }
    waiting.clear();
    closing?.terminate?.();
  }

  return { read, close, isOnMainThread: () => broken };
}

module.exports = { createInventoryReadWorker };
