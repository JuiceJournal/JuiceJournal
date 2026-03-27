# Security And Performance Roadmap

This file is the working backlog for the next hardening phase of Juice Journal.
It is meant to be updated over time as items move from review to implementation.

## Priority Order

1. Desktop security hardening
2. Backend session integrity
3. Web auth hardening
4. Performance cleanup

---

## 1. Desktop Security Hardening

### Goals
- Reduce damage if the renderer process is compromised
- Minimize sensitive data exposure on disk
- Separate safe diagnostics from sensitive diagnostics

### Planned Work
- Tighten PoE token persistence further
- Reduce preload IPC surface to the minimum required set
- Add stronger auth/capability guards around stash and pricing tools
- Classify diagnostics export payloads:
  - safe
  - sensitive
- Add audit coverage for privileged IPC usage

### Desired Outcome
- A renderer compromise should not automatically expose all privileged desktop capabilities
- Sensitive exports should be explicit and intentional

---

## 2. Backend Session Integrity

### Goals
- Keep analytics and leaderboard data trustworthy
- Limit client influence over historical timing and profit calculations

### Planned Work
- Refine timestamp validation policy for offline queue sync
- Define accepted drift/backdate windows explicitly
- Prevent suspicious session timing updates from polluting stats
- Review session lifecycle endpoints for manipulation paths

### Desired Outcome
- Session history remains reliable even with offline sync flows
- Rankings and statistics are harder to game

---

## 3. Web Auth Hardening

### Goals
- Move away from browser-managed token exposure
- Reduce the blast radius of web-side XSS

### Planned Work
- Design server-managed auth transition
- Target httpOnly cookie-based auth flow
- Rework logout / expiry / websocket auth accordingly
- Remove remaining browser storage dependency for auth state

### Desired Outcome
- Web auth should no longer depend on readable JS-accessible bearer tokens

---

## 4. Performance Cleanup

### Goals
- Reduce redundant requests and heavy client-side work
- Keep desktop and web responsive during active farming

### Planned Work
- Push remaining stats aggregation into the database
- Reduce dashboard full-refetch behavior after socket events
- Move currency page sorting/filtering/pagination closer to server-side
- Narrow OCR scan scope further where practical
- Review desktop DOM rebuild hotspots

### Desired Outcome
- Better responsiveness under real usage load
- Lower CPU/network cost during active sessions

---

## Suggested Next Implementation Batch

- Desktop diagnostics sensitivity levels
- IPC allowlist narrowing
- Session timestamp policy refinement
- Dashboard refetch reduction

---

## Status Legend

- `planned`
- `in_progress`
- `done`
- `deferred`
