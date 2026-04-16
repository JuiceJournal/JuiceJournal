const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(__dirname, '..', 'services', 'strategyService.js');
const routePath = path.join(__dirname, '..', 'routes', 'publicStrategies.js');

test('public strategy list service exposes a lightweight aggregate loader instead of eager-loading sessions', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /async function loadPublicStrategyMetrics/);
  assert.match(source, /loadPublicStrategyMetrics,/);
});

test('public strategy list route composes metadata and aggregate metrics separately', () => {
  const source = fs.readFileSync(routePath, 'utf8');

  assert.match(source, /loadPublicStrategyMetrics/);
  assert.match(source, /aggregateOverride:/);
});
