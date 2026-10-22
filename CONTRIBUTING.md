# Contributing to Juice Journal

Thanks for contributing.

Juice Journal is a local-first desktop app. The repository contains:

- `desktop/` - the Electron app (the product; works on its own)
- `backend/` - optional Express + PostgreSQL API for self-hosters
- `web/` - optional Next.js site

Read this file before opening a PR.

## Ground Rules

- Keep changes focused. Do not mix unrelated fixes in one PR.
- Do not commit secrets, tokens, `.env` files, OAuth credentials, or local database data.
- Prefer small, reviewable commits with clear messages.
- If you touch runtime behavior, add or update tests in the same change.
- If a local tool or external platform is unavailable, fail closed and document it rather than faking production readiness.

## Setup

Desktop (all you need for most changes):

```bash
cd desktop
npm install
npm run dev
```

npm 12 skips dependency install scripts by default. If it warns about that, run `npm install-scripts approve electron koffi` and `npm install` again, or Electron will not be downloaded.

Optional backend (only for backend changes):

```bash
cd backend
npm install
cp .env.example .env      # set DB_PASSWORD and JWT_SECRET
docker-compose up -d postgres
npm run dev
```

`docker-compose up -d` without a service name also starts the API in a container on port 3001 and pgAdmin on port 5050, which conflicts with `npm run dev`.

## Development Commands

Desktop:

```bash
cd desktop
npm run dev
npm test
npm run test:e2e
```

Backend:

```bash
cd backend
npm run dev
npm run build
npm test
```

Web:

```bash
cd web
npm run dev
npm test
```

Use the smallest verification set that proves your change, then run the broader relevant suite before asking for review.

## Branch and PR Workflow

- Branch from `master`.
- Use descriptive branch names such as:
  - `feature/...`
  - `fix/...`
  - `docs/...`
- Open one PR per coherent change.
- Include:
  - short summary
  - risk / migration notes
  - exact verification commands you ran

Recommended PR checklist:

- [ ] Scope is focused
- [ ] Relevant tests were added or updated
- [ ] Relevant suites pass locally
- [ ] No secrets or machine-specific artifacts are included
- [ ] Docs were updated if behavior changed

## Code and Review Expectations

- Follow existing patterns before introducing new ones.
- Keep APIs and IPC contracts narrow.
- Prefer fail-closed behavior for auth, desktop bridges, and external integrations.
- Avoid speculative refactors while fixing a concrete bug.
- If a dependency upgrade is part of the fix, keep it intentional and scoped.

Reviewers will primarily look for:

- behavioral regressions
- auth / security boundary mistakes
- performance regressions
- missing tests
- unnecessary surface area

## Testing Notes

All three packages use `node:test`. GitHub Actions runs the desktop, backend and web unit tests on every pull request (`.github/workflows/ci.yml`); the Electron end-to-end tests run locally only for now.

When changing:

- auth or API payloads:
  run backend tests and any affected desktop/web tests
- desktop main/preload/API client:
  run `cd desktop && npm test`
- web routing or hooks:
  run `cd web && npm run build`

If you cannot run a relevant test, say so clearly in the PR.

## Secrets and Local Artifacts

Never commit:

- `.env`
- OAuth client secrets
- JWT secrets
- local database dumps
- generated binaries from experiments
- temporary probe folders such as `.tmp/`

Before committing, check:

```bash
git status --short
```

## External Platform Notes

- Path of Exile sign-in uses GGG's public OAuth client flow. To use your own client, set `POE_CLIENT_ID` and `POE_REDIRECT_URI` when starting the app, or change the defaults for a fork you distribute (see `docs/path-of-exile-sign-in.md`).
- Only use documented Path of Exile API endpoints and keep the app read-only towards the game: no injection, no memory reading, no input sent to the game, no writes to game files.

## Questions

If scope is unclear, open an issue or draft PR early rather than guessing.
