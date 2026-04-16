# Security and Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the repo-wide high-signal security and performance issues identified in the review without regressing existing desktop, web, and backend behavior.

**Architecture:** Keep the existing product flows, but harden auth so browser clients are cookie-only, scope realtime websocket tokens correctly, reduce `/auth/me` dependence on live GGG fan-out via bounded caching, and stop loading entire strategy session graphs for public listing endpoints. Update vulnerable direct dependencies to patched versions.

**Tech Stack:** Express, Sequelize, Next.js, React, Electron, Axios, Node test runner.

---

### Task 1: Patch vulnerable direct dependencies
- Update `axios` in `backend/package.json`, `web/package.json`, and `desktop/package.json`
- Update `next` in `web/package.json`
- Refresh lockfiles
- Verify baseline test suites still pass

### Task 2: Remove long-lived JWT exposure from browser auth flows
- Stop returning session JWTs in backend auth/login/register/oauth-complete JSON bodies
- Change web auth flow to rely on cookie-only auth
- Change desktop main/API client to persist and send the backend auth cookie instead of a bearer token
- Keep `realtime-token` as the only explicit token-returning endpoint

### Task 3: Scope websocket auth to realtime tokens only
- Require `kind === "realtime"` in websocket auth
- Keep existing expiry semantics
- Add regression tests for rejecting standard session JWTs on the websocket path

### Task 4: Cache character payloads behind `/api/auth/me`
- Add short-lived per-user cache + in-flight dedupe for `getAccountCharacters`
- Invalidate on PoE link/disconnect/login-complete paths
- Keep fail-closed behavior when the GGG API is unavailable

### Task 5: Stop public strategy listings from loading full session graphs
- Add a lighter-weight public list path that loads strategy metadata + aggregate metrics without eager-loading all sessions
- Keep detail page behavior unchanged
- Add regression tests covering metrics equivalence for listing output

### Task 6: Verify end to end
- Run backend tests
- Run web tests/lint if available
- Run desktop test suite
- Leave worktree clean and ready for review/push
