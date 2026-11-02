/**
 * The last complete poe.ninja list per game and league, on disk, so the Currency page has rows to show right after a
 * launch while its sync runs. Display only: the page says how old the list is, and nothing prices loot or works out
 * profit from it, because those read the price service's own list. A newer sync that read every type it asked for
 * replaces the league's file, unless it is a quick sync and the file holds a full list from the last day: a quick sync
 * skips some tabs. The oldest files go past MAX_SNAPSHOTS.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOTS = 6;
const FULL_LIST_STANDS_MS = 24 * 60 * 60 * 1000;

function isUsableSnapshot(snapshot, poeVersion, league) {
  return snapshot?.version === SNAPSHOT_VERSION
    && snapshot.poeVersion === poeVersion
    && snapshot.league === league
    && Number.isFinite(snapshot.syncedAt)
    && Array.isArray(snapshot.syncedTypes)
    && Array.isArray(snapshot.entries)
    && snapshot.entries.every((entry) => typeof entry?.name === 'string' && Number.isFinite(entry.chaosValue));
}

class PriceSnapshotStore {
  constructor({ dir }) {
    this.dir = dir;
    this.writes = Promise.resolve();
    this.stopped = false;
  }

  // Hashed: a league name is free text and may not name a path.
  _filePath(poeVersion, league) {
    const id = crypto.createHash('sha256').update(`${poeVersion}:${league}`).digest('hex');
    return path.join(this.dir, `${id}.json`);
  }

  // Writes run one at a time and never reject. A list that cannot be kept only means a slower next launch.
  save(snapshot) {
    this.writes = this.writes
      .then(() => (this.stopped ? null : this._write(snapshot)))
      .catch(() => console.warn('Unable to keep the last price list for the next launch'));
    return this.writes;
  }

  async _write(snapshot) {
    if (await this._isCoveredByFullList(snapshot)) {
      return;
    }
    await fs.promises.mkdir(this.dir, { recursive: true });
    const target = this._filePath(snapshot.poeVersion, snapshot.league);
    const temp = `${target}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify({ version: SNAPSHOT_VERSION, ...snapshot }));
    await fs.promises.rename(temp, target);
    await this._removeOldest();
  }

  async _isCoveredByFullList(snapshot) {
    if (snapshot.full) {
      return false;
    }
    const kept = await this.load(snapshot.poeVersion, snapshot.league);
    return Boolean(kept?.full) && snapshot.syncedAt - kept.syncedAt < FULL_LIST_STANDS_MS;
  }

  // The kept files, oldest first by their time on disk.
  async _filesByAge() {
    const names = (await fs.promises.readdir(this.dir)).filter((name) => name.endsWith('.json'));
    const files = await Promise.all(names.map(async (name) => {
      const file = path.join(this.dir, name);
      return { file, modifiedAt: (await fs.promises.stat(file)).mtimeMs };
    }));
    return files.sort((left, right) => left.modifiedAt - right.modifiedAt);
  }

  async _removeOldest() {
    const files = await this._filesByAge();
    if (files.length <= MAX_SNAPSHOTS) {
      return;
    }
    await Promise.all(files.slice(0, files.length - MAX_SNAPSHOTS).map(({ file }) => fs.promises.rm(file, { force: true })));
  }

  async _readFile(file) {
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch {
      return null;
    }
  }

  // The kept list of a game and league, or null when there is none or the file is not one this version wrote.
  async load(poeVersion, league) {
    const snapshot = await this._readFile(this._filePath(poeVersion, league));
    return isUsableSnapshot(snapshot, poeVersion, league) ? snapshot : null;
  }

  // The league of a game's newest kept list, or null when it has none.
  async newestLeague(poeVersion) {
    let files = [];
    try {
      files = await this._filesByAge();
    } catch {
      return null;
    }
    for (const { file } of files.reverse()) {
      const snapshot = await this._readFile(file);
      if (typeof snapshot?.league === 'string' && isUsableSnapshot(snapshot, poeVersion, snapshot.league)) {
        return snapshot.league;
      }
    }
    return null;
  }

  // Delete everything removes the folder, so nothing may write it back: later writes never start, and the answer comes
  // once a write already under way has ended.
  stop() {
    this.stopped = true;
    return this.writes;
  }

  // A Delete everything that failed a step leaves the app running, and its lists are kept again.
  resume() {
    this.stopped = false;
  }
}

module.exports = PriceSnapshotStore;
