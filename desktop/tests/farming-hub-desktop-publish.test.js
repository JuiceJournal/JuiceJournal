const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('desktop main builds farming hub publish payloads in the main process', () => {
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

  assert.match(source, /buildFarmPublishPayload/);
  assert.match(source, /async function publishMapResultsToFarmingHub/);
  assert.match(source, /apiClient\.publishFarmRun\(payload\)/);
  assert.match(source, /FARM_PUBLISH_RESPONSE_INVALID/);
});

test('desktop publish bridge marks only selected local results as published', () => {
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

  assert.match(source, /function resolveMapResultsForPublish/);
  assert.match(source, /requestedIds\.has\(result\?\.id\) \|\| requestedIds\.has\(result\?\.localRunId\)/);
  assert.match(source, /function markPublishedMapResults/);
  assert.match(source, /publishState: publishedRun\.visibility === 'private' \? 'draft' : 'published'/);
  assert.match(source, /publishedRunId: publishedRun\.id/);
});

test('desktop preload exposes a narrow publish IPC method', () => {
  const source = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

  assert.match(source, /publishMapResults:\s*\(input\)\s*=>\s*ipcRenderer\.invoke\('publish-map-results',\s*input\)/);
});

test('desktop publish IPC requires local auth before calling the backend', () => {
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

  assert.match(source, /ipcMain\.handle\('publish-map-results'/);
  assert.match(source, /assertDesktopUserAuthenticated\(\);\s*return await publishMapResultsToFarmingHub\(input\)/s);
});
