# Security and Performance Code Review - 2026-05-09

## Executive Summary

Juice Journal already has several strong security baselines: Electron renderers use `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity: true`, and CSP; Express uses Helmet, bounded body parsers, rate limiting, cookie auth flags, and production config guards; desktop benchmarks are comfortably inside current budgets.

The main issues to address before broader testing/submission are dependency hygiene, Electron IPC/navigation hardening, client-side production transport enforcement, and renderer performance/DOM-safety cleanup. None of the reviewed issues require architecture replacement, but the top findings should be fixed before an external review build.

## Fix Status

Implemented in the follow-up hardening slice:

- Fixed `JJ-SEC-001` by upgrading `axios` to `1.16.0` across backend, desktop, and web, plus desktop transitive audit updates for `fast-uri` and `ip-address`.
- Fixed `JJ-SEC-002` by adding trusted renderer sender validation for Electron IPC handlers.
- Fixed `JJ-SEC-003` by denying unexpected `will-navigate` targets and `window.open` from desktop BrowserWindows.
- Fixed `JJ-SEC-004` by making production `NEXT_PUBLIC_API_URL` fail closed unless it is configured and uses `https://`.
- Partially fixed `JJ-SEC-005` and `JJ-PERF-001` by converting toast rendering and the currency table to DOM node construction with safe text/image handling. Other lower-risk `innerHTML` surfaces remain planned cleanup.

## Scope and Evidence

- Reviewed surfaces: `desktop`, `backend`, `web`, package manifests, security tests, benchmark script, and app/web build outputs.
- Commands run:
  - `cd desktop && npm audit --json`
  - `cd backend && npm audit --json`
  - `cd web && npm audit --json`
  - `cd desktop && npm run bench:desktop`
  - `cd desktop && node --test tests/security-hardening.test.js`
  - `cd backend && node --test tests/*.test.js`
  - `cd backend && npm run build`
  - `cd web && npm run build`
- Follow-up fix verification:
  - `cd desktop && npm test`
  - `cd desktop && npm run bench:desktop`
  - `cd backend && node --test tests/*.test.js`
  - `cd backend && npm run build`
  - `cd web && node --test tests/*.test.js`
  - `cd web && NEXT_PUBLIC_API_URL=https://... NEXT_PUBLIC_WS_URL=wss://... npm run build`
- External references:
  - Electron Security Checklist: https://www.electronjs.org/docs/latest/tutorial/security
  - Electron Performance Checklist: https://www.electronjs.org/docs/latest/tutorial/performance
  - Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html
  - Express Performance Best Practices: https://expressjs.com/en/advanced/best-practice-performance.html
  - Node.js Event Loop Guidance: https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop
  - Next.js CSP Guide: https://nextjs.org/docs/app/guides/content-security-policy

## Findings

### JJ-SEC-001 - High - Vulnerable Axios is present in all runtime surfaces

Location:
- `backend/package.json:21`
- `desktop/package.json:31`
- `web/package.json:13`

Evidence:
- All three packages pin `axios` to `1.15.0`.
- `npm audit --json` reports high-severity advisories for `axios` and says a non-major fix is available at `1.16.0`.
- Desktop audit additionally reports transitive `fast-uri` and `ip-address` advisories.

Impact:
- Axios is used for backend calls to PoE/OAuth/poe.ninja and desktop/web API clients. The audit includes prototype-pollution request/response tampering, header injection, SSRF/no-proxy bypass, and request/response size bypass classes. These are especially relevant because the app consumes external APIs and forwards authenticated requests.

Recommended fix:
- Upgrade `axios` across `backend`, `desktop`, and `web` to the fixed version from audit.
- Re-run all package lock updates and verify:
  - `cd backend && npm audit --omit=dev`
  - `cd desktop && npm audit --omit=dev`
  - `cd web && npm audit --omit=dev`
  - project test/build suites.

### JJ-SEC-002 - Medium - Electron IPC handlers do not validate sender frames

Location:
- `desktop/main.js:3954`
- `desktop/main.js:3965`
- `desktop/main.js:3970`

Evidence:
- Privileged IPC handlers such as `start-session`, `end-session`, and `get-current-session` directly execute without checking `event.senderFrame`.
- Electron official guidance recommends validating sender frames for all IPC messages by default.

Impact:
- Current windows are local and sandboxed, which lowers exploitability. However, if a renderer navigation bug, injected iframe, or future remote surface appears, unvalidated IPC is a privilege boundary gap because renderer-originated messages can trigger filesystem, auth, session, overlay, and network operations in the main process.

Recommended fix:
- Add a shared `assertTrustedIpcSender(event)` or `validateIpcSenderFrame(event.senderFrame)` in `desktop/main.js`.
- Allow only packaged local app URLs, e.g. the expected `file://.../src/index.html` and `file://.../src/overlay.html` during the current architecture.
- Wrap all privileged `ipcMain.handle` registrations with the guard.
- Add tests in `desktop/tests/security-hardening.test.js` proving privileged handlers call the guard.

### JJ-SEC-003 - Medium - Electron windows do not explicitly block unexpected navigation/new windows

Location:
- `desktop/main.js:2533`
- `desktop/main.js:2610`

Evidence:
- The app loads local files and has good webPreferences, but there is no visible `will-navigate` or `setWindowOpenHandler` policy near window creation.
- Electron official guidance recommends disabling or limiting navigation and creation of new windows.

Impact:
- The current UI mostly uses local content and controlled external auth opening, so this is defense-in-depth. If an injected link, future rich content, or accidental navigation lands in the renderer, the app should fail closed rather than navigating an Electron window to arbitrary web content.

Recommended fix:
- Add global `app.on('web-contents-created', ...)` or per-window handlers:
  - prevent `will-navigate` unless target is the current local app page.
  - deny `setWindowOpenHandler` by default.
  - route known external auth URLs through the existing allowlisted `openAuthUrlInBrowser`.
- Extend `desktop/tests/security-hardening.test.js`.

### JJ-SEC-004 - Medium - Web production build only warns on insecure API URL

Location:
- `web/src/lib/api.js:8`
- `web/src/lib/api.js:10`
- `web/src/lib/api.js:121`
- `web/src/hooks/useSocket.js:8`

Evidence:
- `web/src/lib/api.js` defaults to `http://localhost:3001` and only logs a warning when production API URL is not HTTPS.
- `web/src/hooks/useSocket.js` correctly throws when production WebSocket URL is missing or not `wss://`.
- `npm run build` currently succeeds while logging: `NEXT_PUBLIC_API_URL must use https:// in production, got: http://localhost:3001`.

Impact:
- A production web build can be shipped with insecure API transport despite cookie-based auth and credentialed requests. The WebSocket path already fails closed; API should match that posture.

Recommended fix:
- Make production `NEXT_PUBLIC_API_URL` required and fail closed unless it starts with `https://`.
- Update `web/README.md`, which still documents `NEXT_PUBLIC_WS_URL=ws://localhost:3001`.
- Add a test mirroring `use-socket-config.test.js` for API URL production enforcement.

### JJ-SEC-005 - Low/Medium - Renderer still relies heavily on raw `innerHTML` string rendering

Location examples:
- `desktop/src/app.js:1474`
- `desktop/src/app.js:3347`
- `desktop/src/app.js:3809`
- `desktop/src/app.js:4206`
- `desktop/src/app.js:5725`

Evidence:
- Most inserted values are escaped through `escapeHTML`, and this reduces immediate XSS risk.
- Some interpolations still come from non-escaped or semi-trusted values, e.g. `currencyHTML`, `formatMapResultProfitHTML`, `renderSparklineSVG`, `state.currentSession.mapTier`, and `item.itemType`.
- The current CSP disallows inline scripts but allows inline styles for the design system.

Impact:
- Current exploitability appears limited because user-controlled values are mostly escaped and scripts are blocked by CSP. The risk is regression risk: any future helper returning unescaped HTML can become a DOM XSS sink quickly.

Recommended fix:
- Keep `innerHTML` only for constant templates or audited safe HTML helpers.
- Replace high-churn list rendering with DOM node creation or centralized safe render helpers.
- Add tests for dangerous characters in currency rows, session fields, farm result labels, and toast messages.

### JJ-PERF-001 - Medium - Desktop renderer performs large list/table rerenders with full `innerHTML` replacement

Location examples:
- `desktop/src/app.js:3347`
- `desktop/src/app.js:4003`
- `desktop/src/app.js:4044`
- `desktop/src/app.js:5345`
- `desktop/src/app.js:5725`

Evidence:
- Existing benchmark results are good for model-layer code:
  - `log-parser`: 49.15ms, 0.09 MB retained heap
  - `runtime-session-model`: 61.12ms, 0.06 MB
  - `overlay-state-model`: 43.04ms, 0.04 MB
- The benchmark does not cover actual renderer DOM churn, currency page table rerendering, or large session/loot histories.

Impact:
- Performance complaints are more likely to appear in UI surfaces with large lists: currency rows, session history, recent loot, and session drawer loot. Full DOM replacement can cause jank and layout work even if model code is fast.

Recommended fix:
- Add a renderer benchmark or Playwright trace for currency table, session list, and drawer loot render.
- Add simple virtualization or chunked rendering for large lists.
- Cache static SVG/icon HTML where safe.

### JJ-PERF-002 - Medium - Stash snapshot flow is still API-bound and can block user perception

Location:
- `backend/services/stashSnapshotService.js:162`
- `backend/services/stashSnapshotService.js:183`
- `backend/services/stashSnapshotService.js:199`

Evidence:
- Snapshot flow lists tabs, auto-picks tabs, fetches batches, flattens all items, and does one bulk price lookup.
- The bulk price lookup is good, but the full snapshot still depends on GGG stash latency and selected tab count.

Impact:
- This matches recent manual testing: map start/end can feel delayed or inconsistent depending on stash API freshness and item count.

Recommended fix:
- Keep start modal independent from before snapshot.
- Move snapshot completion into a visible async state machine: `baseline pending`, `after snapshot pending`, `calculated`, `not calculated`.
- Persist per-run snapshot state and retry jobs so UI can close the run while calculation continues or later marks it `Not calculated`.
- Consider user-selectable tracked tab set to avoid scanning large irrelevant tabs.

### JJ-PERF-003 - Low - Web dashboard route has a large initial JS payload

Location:
- `web` build output for `/dashboard`

Evidence:
- `npm run build` reports `/dashboard` at `109 kB` route size and `270 kB First Load JS`.

Impact:
- Not a desktop blocker, but public/web dashboard performance can degrade on slow machines/networks.

Recommended fix:
- Dynamic-import heavy dashboard widgets and charts.
- Split session/currency/strategy widgets by route or lazy tab.
- Keep Recharts out of routes that do not render charts.

## Positive Findings

- Electron BrowserWindows are already hardened with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`.
- Desktop CSP exists for both main and overlay entrypoints.
- External auth URL opening is allowlisted before `shell.openExternal`.
- Express disables `x-powered-by`, uses Helmet, has body parser limits, custom 404/error handlers, CORS allowlist filtering, request/header timeouts, and login rate limiting.
- PoE OAuth uses state verification and PKCE verifier checks.
- Backend stores auth in HTTP-only same-site cookies and only adds `Secure` in production.
- WebSocket auth has max payload, auth timeout, token verification, and fail-closed post-auth behavior.
- Current model-layer desktop benchmark is comfortably below budgets.

## Suggested Fix Order

1. Update vulnerable dependencies and lockfiles, then run audit/tests.
2. Add Electron IPC sender validation and navigation/window-open deny policy.
3. Make production web API URL fail closed unless HTTPS.
4. Add renderer DOM/performance regression coverage for large lists.
5. Convert PoE1 stash snapshot completion into an explicit async run-calculation state.
6. Reduce raw `innerHTML` usage over time, starting with currency rows and session drawer lists.
