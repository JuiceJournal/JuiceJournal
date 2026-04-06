# Public Strategies Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-first public strategies system that lets users group completed farming sessions into publishable strategies and lets other users browse them by PoE version, league, year, map, tags, and author.

**Architecture:** Keep `Session` as the source of truth and add `Strategy`, `StrategySession`, and `StrategyTag` as a thin publish layer on top. Backend aggregate queries power both owner-facing management flows and public discovery, while the web app gets a new authenticated strategy editor and a public list/detail browser without changing the desktop flow.

**Tech Stack:** Node.js, Express, Sequelize, PostgreSQL SQL migrations, Next.js App Router, React, Axios, existing i18n locale files, Node built-in test runner plus Supertest for backend route coverage.

---

## File Map

### Backend

- Create: `backend/models/Strategy.js`
- Create: `backend/models/StrategySession.js`
- Create: `backend/models/StrategyTag.js`
- Create: `backend/routes/strategies.js`
- Create: `backend/routes/publicStrategies.js`
- Create: `backend/migrations/002_create_strategies.sql`
- Create: `backend/app.js`
- Create: `backend/tests/strategies.routes.test.js`
- Create: `backend/tests/publicStrategies.routes.test.js`
- Create: `backend/tests/helpers/createTestApp.js`
- Modify: `backend/models/index.js`
- Modify: `backend/server.js`
- Modify: `backend/package.json`

### Web

- Create: `web/src/app/dashboard/strategies/page.js`
- Create: `web/src/app/strategies/public/page.js`
- Create: `web/src/app/strategies/public/[slug]/page.js`
- Create: `web/src/components/StrategyTable.js`
- Create: `web/src/components/StrategyFilters.js`
- Create: `web/src/components/StrategyComposer.js`
- Create: `web/src/components/StrategyPreviewCard.js`
- Modify: `web/src/components/Navbar.js`
- Modify: `web/src/lib/api.js`
- Modify: `web/src/lib/utils.js`
- Modify: `web/src/lib/locales/en.js`
- Modify: `web/src/lib/locales/tr.js`
- Modify: `web/src/lib/locales/asia.js`
- Modify: `web/src/lib/locales/europe-east.js`
- Modify: `web/src/lib/locales/europe-west.js`

### Docs

- Modify: `docs/superpowers/specs/2026-04-06-public-strategies-design.md`
  - only if implementation constraints force a design clarification

## Chunk 1: Backend Data Foundation

### Task 1: Add backend test harness for route work

**Files:**
- Create: `backend/app.js`
- Create: `backend/tests/helpers/createTestApp.js`
- Create: `backend/tests/strategies.routes.test.js`
- Modify: `backend/server.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Write the failing test for mounting custom routes without starting the real server**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/createTestApp');

test('test app mounts strategies routes', async () => {
  const app = createTestApp();
  const response = await request(app).get('/api/strategies/mine');
  assert.notEqual(response.statusCode, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: FAIL because `createTestApp` and `app.js` do not exist yet.

- [ ] **Step 3: Add the minimal app factory and test script support**

```js
// backend/app.js
function createApp({ authRoutes, sessionRoutes, lootRoutes, priceRoutes, statsRoutes, strategyRoutes, publicStrategyRoutes }) {
  const app = express();
  app.use('/api/auth', authRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/loot', lootRoutes);
  app.use('/api/prices', priceRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/strategies', strategyRoutes);
  app.use('/api/public/strategies', publicStrategyRoutes);
  return app;
}
```

- [ ] **Step 4: Run test to verify the app factory passes**

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: PASS for the mount assertion.

- [ ] **Step 5: Commit**

```bash
git add backend/app.js backend/server.js backend/package.json backend/tests/helpers/createTestApp.js backend/tests/strategies.routes.test.js
git commit -m "test: add backend route app factory harness"
```

### Task 2: Add strategy tables and Sequelize associations

**Files:**
- Create: `backend/models/Strategy.js`
- Create: `backend/models/StrategySession.js`
- Create: `backend/models/StrategyTag.js`
- Create: `backend/migrations/002_create_strategies.sql`
- Modify: `backend/models/index.js`
- Test: `backend/tests/strategies.routes.test.js`

- [ ] **Step 1: Write the failing test for creating a strategy with tags and linked sessions**

```js
test('owner can create a draft strategy with tags and completed sessions', async () => {
  const response = await request(app)
    .post('/api/strategies')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'T16 Harvest Dunes',
      description: 'Blue altar Harvest loop',
      mapName: 'Dunes Map',
      poeVersion: 'poe1',
      league: 'Mirage',
      tags: ['Harvest', 'Blue Altars'],
      sessionIds: [completedSessionId]
    });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.strategy.visibility, 'private');
  assert.equal(response.body.data.strategy.tags.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: FAIL because the strategy tables and associations do not exist.

- [ ] **Step 3: Add SQL migration and Sequelize models**

```sql
CREATE TABLE strategies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT,
  map_name VARCHAR(100) NOT NULL,
  poe_version VARCHAR(10) NOT NULL,
  league VARCHAR(50) NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  published_at TIMESTAMP NULL,
  last_calculated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 4: Run migration and tests**

Run: `cd backend && npm run db:migrate`
Expected: migration applies successfully.

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: still FAIL on route behavior, but model creation/setup errors are gone.

- [ ] **Step 5: Commit**

```bash
git add backend/models/Strategy.js backend/models/StrategySession.js backend/models/StrategyTag.js backend/models/index.js backend/migrations/002_create_strategies.sql
git commit -m "feat: add public strategy data model"
```

## Chunk 2: Backend Strategy APIs

### Task 3: Implement authenticated strategy CRUD and publish flow

**Files:**
- Create: `backend/routes/strategies.js`
- Modify: `backend/app.js`
- Modify: `backend/server.js`
- Test: `backend/tests/strategies.routes.test.js`

- [ ] **Step 1: Write failing tests for create, update, session linking, and publish invariants**

```js
test('publish rejects mixed league sessions', async () => {
  const response = await request(app)
    .post(`/api/strategies/${strategyId}/publish`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.errorCode, 'STRATEGY_CONTEXT_MISMATCH');
});

test('publish requires at least one tag and one linked session', async () => {
  const response = await request(app)
    .post(`/api/strategies/${emptyStrategyId}/publish`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.statusCode, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: FAIL because no strategies route implementation exists.

- [ ] **Step 3: Implement `strategies.js` with explicit validation**

```js
router.post('/', authenticate, async (req, res) => {
  // create draft strategy
});

router.post('/:id/publish', authenticate, async (req, res) => {
  // validate linked completed sessions
  // validate same user/map/league/version
  // require tags
  // set visibility='public' and publishedAt
});
```

- [ ] **Step 4: Run tests to verify route behavior passes**

Run: `cd backend && node --test tests/strategies.routes.test.js`
Expected: PASS for draft creation and publish validation tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/strategies.js backend/app.js backend/server.js backend/tests/strategies.routes.test.js
git commit -m "feat: add strategy management routes"
```

### Task 4: Implement public aggregate listing and detail APIs

**Files:**
- Create: `backend/routes/publicStrategies.js`
- Test: `backend/tests/publicStrategies.routes.test.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing tests for public filters and aggregate metrics**

```js
test('public strategies list filters by poeVersion league tag and year', async () => {
  const response = await request(app)
    .get('/api/public/strategies')
    .query({ poeVersion: 'poe1', league: 'Mirage', tag: 'Harvest', year: 2026 });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.items.length, 1);
  assert.equal(response.body.data.items[0].avgProfitChaos, 120);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/publicStrategies.routes.test.js`
Expected: FAIL because the public strategy route does not exist.

- [ ] **Step 3: Implement aggregate list/detail queries**

```js
router.get('/', async (req, res) => {
  // filter by visibility='public'
  // apply poeVersion, league, tag, mapName, author, search, year
  // return aggregate metrics and pagination metadata
});

router.get('/:slug', async (req, res) => {
  // return public strategy metadata, tags, aggregate stats, and linked run summary
});
```

- [ ] **Step 4: Run tests plus a quick build smoke**

Run: `cd backend && node --test tests/publicStrategies.routes.test.js`
Expected: PASS for list/detail aggregate assertions.

Run: `cd backend && npm run build`
Expected: build check passes.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/publicStrategies.js backend/app.js backend/tests/publicStrategies.routes.test.js
git commit -m "feat: add public strategy aggregate APIs"
```

## Chunk 3: Web Strategy Management

### Task 5: Add client API bindings and navigation entry points

**Files:**
- Modify: `web/src/lib/api.js`
- Modify: `web/src/components/Navbar.js`
- Modify: `web/src/lib/locales/en.js`
- Modify: `web/src/lib/locales/tr.js`
- Modify: `web/src/lib/locales/asia.js`
- Modify: `web/src/lib/locales/europe-east.js`
- Modify: `web/src/lib/locales/europe-west.js`

- [ ] **Step 1: Write the failing UI contract check by building the web app**

Run: `cd web && npm run build`
Expected: PASS now, but this is the baseline before adding the new routes and translation keys.

- [ ] **Step 2: Add strategy API clients and navbar entries**

```js
export const strategyAPI = {
  mine: (params) => apiClient.get('/strategies/mine', { params }),
  create: (data) => apiClient.post('/strategies', data),
  update: (id, data) => apiClient.put(`/strategies/${id}`, data),
  publish: (id) => apiClient.post(`/strategies/${id}/publish`),
};

export const publicStrategyAPI = {
  list: (params) => apiClient.get('/public/strategies', { params }),
  getBySlug: (slug, params) => apiClient.get(`/public/strategies/${slug}`, { params }),
};
```

- [ ] **Step 3: Add locale strings and nav links for owner and public strategy pages**

```js
'nav.strategies': 'Strategies',
'nav.publicStrategies': 'Public Strategies',
'strategies.emptyTitle': 'No strategies yet',
```

- [ ] **Step 4: Run build to verify the shell still compiles**

Run: `cd web && npm run build`
Expected: PASS with no missing translation key crashes or import errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api.js web/src/components/Navbar.js web/src/lib/locales/en.js web/src/lib/locales/tr.js web/src/lib/locales/asia.js web/src/lib/locales/europe-east.js web/src/lib/locales/europe-west.js
git commit -m "feat: wire strategy navigation and API clients"
```

### Task 6: Build the authenticated strategy composer page

**Files:**
- Create: `web/src/app/dashboard/strategies/page.js`
- Create: `web/src/components/StrategyComposer.js`
- Create: `web/src/components/StrategyPreviewCard.js`
- Modify: `web/src/lib/utils.js`

- [ ] **Step 1: Define the failing behavior with a manual smoke checklist**

Run after implementation:
- open `/dashboard/strategies`
- verify completed sessions can be selected
- verify a draft strategy preview appears
- verify publish errors are shown cleanly

Expected before implementation: route does not exist.

- [ ] **Step 2: Create the owner page and composer components**

```js
export default function StrategiesPage() {
  // load completed sessions, existing drafts, and tracker context
  // support create/update/publish
}
```

- [ ] **Step 3: Implement preview state from selected sessions**

```js
const preview = {
  runCount: selectedSessions.length,
  avgProfitChaos: average(selectedSessions.map((s) => s.profitChaos)),
  avgProfitPerHour: ...
};
```

- [ ] **Step 4: Run build and manual smoke**

Run: `cd web && npm run build`
Expected: PASS.

Manual: `cd web && npm run dev`
Expected: owner can draft and publish from completed sessions.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/strategies/page.js web/src/components/StrategyComposer.js web/src/components/StrategyPreviewCard.js web/src/lib/utils.js
git commit -m "feat: add strategy composer dashboard page"
```

## Chunk 4: Public Web Discovery

### Task 7: Build the public list browser

**Files:**
- Create: `web/src/app/strategies/public/page.js`
- Create: `web/src/components/StrategyTable.js`
- Create: `web/src/components/StrategyFilters.js`
- Modify: `web/src/lib/utils.js`

- [ ] **Step 1: Define the failing behavior with a manual smoke checklist**

Run after implementation:
- open `/strategies/public`
- filter by `poeVersion`, `league`, `tag`, `year`
- sort by profitability and runs
- verify rows show author, map, tags, run count, average profit, and last run date

Expected before implementation: route does not exist.

- [ ] **Step 2: Create the list page and filter state**

```js
const [filters, setFilters] = useState({
  poeVersion,
  league,
  year: new Date().getFullYear(),
  tag: '',
  search: '',
  sort: 'most_profitable',
});
```

- [ ] **Step 3: Render the table using aggregate API data**

```js
<StrategyTable
  items={items}
  onSortChange={setSort}
/>
```

- [ ] **Step 4: Run build and manual smoke**

Run: `cd web && npm run build`
Expected: PASS.

Manual: `cd web && npm run dev`
Expected: public filtering updates the list correctly and respects PoE context defaults.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/strategies/public/page.js web/src/components/StrategyTable.js web/src/components/StrategyFilters.js web/src/lib/utils.js
git commit -m "feat: add public strategies browser"
```

### Task 8: Build the public strategy detail page and final verification

**Files:**
- Create: `web/src/app/strategies/public/[slug]/page.js`
- Modify: `web/src/components/StrategyTable.js`
- Modify: `web/src/lib/utils.js`
- Test: `backend/tests/publicStrategies.routes.test.js`

- [ ] **Step 1: Extend the failing backend test for public detail payload**

```js
test('public strategy detail includes tags and linked run summary', async () => {
  const response = await request(app).get(`/api/public/strategies/${slug}`);
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.data.strategy.tags.includes('Harvest'));
  assert.ok(response.body.data.runHistory.length > 0);
});
```

- [ ] **Step 2: Run backend tests to verify the missing detail payload fails**

Run: `cd backend && node --test tests/publicStrategies.routes.test.js`
Expected: FAIL until the route payload is complete.

- [ ] **Step 3: Implement the detail page and finish the payload shape**

```js
export default function PublicStrategyDetailPage({ params }) {
  // load strategy by slug
  // show description, tags, aggregate stats, and linked run history
}
```

- [ ] **Step 4: Run full verification**

Run: `cd backend && node --test`
Expected: PASS.

Run: `cd backend && npm run build`
Expected: PASS.

Run: `cd web && npm run build`
Expected: PASS.

Manual:
- create a draft strategy
- publish it
- open `/strategies/public`
- apply filters
- open detail page

Expected: full create-to-public flow works.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/publicStrategies.routes.test.js web/src/app/strategies/public/[slug]/page.js web/src/components/StrategyTable.js web/src/lib/utils.js
git commit -m "feat: add public strategy detail flow"
```

## Notes For Execution

- Do not change desktop flows in this batch.
- Keep raw session semantics intact; do not repurpose `Session` into a public entity.
- Prefer small focused helper functions over inflating route files with aggregate logic.
- If aggregate SQL starts crowding the route handlers, extract a backend service module such as `backend/services/strategyMetricsService.js` and update the file map before continuing.
- If route tests require DB-heavy setup, keep fixtures isolated and explicit rather than depending on ad hoc seed state.

## Verification Summary

- Backend automated verification:
  - `cd backend && node --test`
  - `cd backend && npm run build`
  - `cd backend && npm run db:migrate`
- Web verification:
  - `cd web && npm run build`
  - manual browser smoke through owner and public flows

Plan complete and saved to `docs/superpowers/plans/2026-04-06-public-strategies.md`. Ready to execute?
