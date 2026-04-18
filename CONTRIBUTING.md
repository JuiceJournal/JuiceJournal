# Contributing to Juice Journal

Thanks for contributing.

This repository contains three active application surfaces:

- `backend/` - Express + PostgreSQL API
- `web/` - Next.js dashboard
- `desktop/` - Electron desktop client

Read this file before opening a PR.

## Ground Rules

- Keep changes focused. Do not mix unrelated fixes in one PR.
- Do not commit secrets, tokens, `.env` files, OAuth credentials, or local database data.
- Prefer small, reviewable commits with clear messages.
- If you touch runtime behavior, add or update tests in the same change.
- If a local tool or external platform is unavailable, fail closed and document it rather than faking production readiness.

## Setup

Repository root:

```bash
cd backend && npm install
cd ../web && npm install
cd ../desktop && npm install
```

Backend environment:

```bash
cd backend
cp .env.example .env
```

Docker services:

```bash
cd backend
docker-compose up -d
```

## Development Commands

Backend:

```bash
cd backend
npm run dev
node scripts/build-check.js
node --test tests/*.test.js
```

Web:

```bash
cd web
npm run dev
npm run build
node --test tests/*.test.js
```

Desktop:

```bash
cd desktop
npm run dev
node --test tests/*.test.js
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

Backend and desktop already have `node:test` coverage.

When changing:

- auth or API payloads:
  run backend tests and any affected desktop/web tests
- desktop main/preload/API client:
  run `cd desktop && node --test tests/*.test.js`
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

Some repo areas depend on third-party approval or runtime availability:

- Path of Exile OAuth approval
- Overwolf runtime / GEP access

Do not claim production readiness for those paths unless the external dependency is actually available and verified.

## Questions

If scope is unclear, open an issue or draft PR early rather than guessing.
