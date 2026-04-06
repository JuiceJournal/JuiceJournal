# Public Strategies Design

## Objective

Add a public strategy browser that lets users publish grouped farming runs and lets other users filter them by league, Path of Exile version, map, author, tags, and year.

The system must preserve raw session history as the source of truth and expose a cleaner aggregate surface for discovery. Public listings should resemble a strategy marketplace, not a raw session log.

## Product Direction

The first release will not publish individual runs directly. It will publish user-curated strategy aggregates built from completed sessions.

This keeps the raw tracker model intact while producing a public surface with cleaner naming, cleaner tags, and more trustworthy metrics.

## Goals

- Keep farming history stored at the session level.
- Allow users to publish grouped completed runs as named public strategies.
- Support PoE 1 and PoE 2 as separate strategy contexts.
- Support league-based browsing and filtering.
- Support mechanic-style tags such as `Breach`, `Harvest`, `Essence`, and `Boss Rush`.
- Show aggregate profitability metrics instead of raw per-run noise.

## Non-Goals

- No automatic public publishing.
- No favorites, likes, comments, or ranking signals in v1.
- No free-form build guide system.
- No mixed-version or mixed-league strategies.
- No separate yearly warehouse table in v1.

## User Experience

### Creator Flow

1. The user completes farming sessions as usual.
2. The user opens a strategy management screen.
3. The user selects completed sessions that belong to one strategy.
4. The user enters a public strategy name, optional description, and tags.
5. The user previews the aggregate metrics.
6. The user publishes the strategy.

Strategies are private by default and only become public through an explicit publish action.

### Viewer Flow

1. A visitor opens the public strategies browser.
2. The visitor filters by PoE version, league, map, tags, author, and year.
3. The visitor sees aggregate rows/cards with author and profitability context.
4. The visitor opens a strategy detail page to inspect supporting metrics and linked run history.

## Data Model

### Existing Source of Truth

`Session` remains the raw farming record. It already stores the required historical anchors:

- `userId`
- `mapName`
- `poeVersion`
- `league`
- `costChaos`
- `profitChaos`
- `startedAt`
- `endedAt`
- `status`

### New Models

#### Strategy

Represents the publishable aggregate.

Suggested fields:

- `id`
- `userId`
- `name`
- `slug`
- `description`
- `mapName`
- `poeVersion`
- `league`
- `visibility` with `private` and `public`
- `publishedAt`
- `lastCalculatedAt`
- `createdAt`
- `updatedAt`

`slug` should be stable and unique enough for a readable public detail route.

#### StrategySession

Join table between `Strategy` and `Session`.

Suggested fields:

- `id`
- `strategyId`
- `sessionId`
- `createdAt`

Each session can belong to at most one published strategy in v1. This avoids metric inflation and duplicated public records.

#### StrategyTag

Separate relation for multi-tag support.

Suggested fields:

- `id`
- `strategyId`
- `tag`
- `createdAt`

Using a separate table is preferred over a single string field because filtering, indexing, and future moderation are all cleaner.

## Aggregate Rules

Public strategy metrics are computed from linked completed sessions only.

Required invariants:

- Every linked session must belong to the same user as the strategy.
- Every linked session must be `completed`.
- Every linked session must match the strategy `poeVersion`.
- Every linked session must match the strategy `league`.
- `mapName` should also match in v1 to keep strategy identity simple and understandable.

If a user wants separate maps or leagues, they create separate strategies.

## Public Metrics

The public list should expose:

- `name`
- `author`
- `mapName`
- `poeVersion`
- `league`
- `tags`
- `runCount`
- `totalProfitChaos`
- `avgProfitChaos`
- `avgProfitPerHour`
- `avgCostChaos`
- `lastRunAt`

The detail page should additionally expose:

- `description`
- `totalDurationSec`
- `top loot categories`
- `last 7 days profit trend`
- linked run history summary

## Year Handling

Historical data does not need a dedicated yearly table.

Year-based filtering should be derived from session timestamps:

- Public list query supports `year`.
- Aggregate computations restrict linked sessions to the requested year when needed for the listing view.
- The base strategy record still represents the strategy identity; filtered metrics can be returned as query-scoped aggregates.

This keeps the write path simple and avoids premature denormalization.

## Filtering and Sorting

### Public Filters

- `poeVersion`
- `league`
- `year`
- `mapName`
- `tag`
- `author`
- `search`

### Public Sort Options

- `newest`
- `most_profitable`
- `best_profit_per_hour`
- `most_runs`

The existing tracker context pattern in the web app should remain the default source for `poeVersion` and `league`, with public-page-specific overrides layered on top.

## API Design

### Authenticated Strategy Management

- `GET /api/strategies/mine`
- `POST /api/strategies`
- `GET /api/strategies/:id`
- `PUT /api/strategies/:id`
- `POST /api/strategies/:id/sessions`
- `DELETE /api/strategies/:id/sessions/:sessionId`
- `POST /api/strategies/:id/publish`
- `POST /api/strategies/:id/unpublish`

### Public Discovery

- `GET /api/public/strategies`
- `GET /api/public/strategies/:slug`

`GET /api/public/strategies` should return aggregate rows ready for listing. It should accept the public filter and sorting parameters.

## UI Surfaces

### Web

Add two web surfaces:

- `/dashboard/strategies`
  - user-owned strategy management
  - draft and publish workflow
- `/strategies/public`
  - public discovery view
  - table-oriented filterable browser

The public browser should follow the existing site visual language rather than copying the external reference literally.

### Desktop

Desktop is not part of the first implementation batch. The initial public strategy feature will be web-first while continuing to consume session data created by both desktop and web clients.

## Validation Rules

- Reject linking `active` or `abandoned` sessions.
- Reject linking sessions from another user.
- Reject mixing PoE 1 and PoE 2.
- Reject mixing leagues.
- Reject mixing maps in v1.
- Require at least one linked session before publish.
- Require at least one tag before publish.
- Require a non-empty strategy name.

## Performance Notes

The first release can calculate aggregate metrics with SQL queries at read time. If the listing becomes expensive, aggregate fields can later be cached on `Strategy` and refreshed when linked sessions change.

That optimization is intentionally deferred.

## Delivery Order

1. Add database tables and associations for strategies, strategy sessions, and strategy tags.
2. Add authenticated strategy CRUD and publish flows.
3. Add public listing and detail endpoints with filters.
4. Add web strategy management UI.
5. Add web public strategies browser.

## Risks

### Duplicate or low-quality public records

Mitigation:

- keep strategies private by default
- require explicit publish
- require manual naming and tagging

### Dirty metrics from inconsistent session grouping

Mitigation:

- enforce same user, map, league, and PoE version for linked sessions

### Large listing queries

Mitigation:

- start with indexed joins and scoped filters
- add cached aggregate fields later if needed

## Open Decisions Resolved

- Publishing model: hybrid, user-curated aggregate from completed sessions
- Public unit: strategy aggregate, not single session
- Scope limit: no favorites or social mechanics in v1
- Historical support: filter by year using timestamps, not a dedicated yearly table
