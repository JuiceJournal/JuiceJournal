# Next Phase Roadmap

## Production Hardening
- Enforce validated environment configuration at startup
- Replace ad-hoc console output with structured logging
- Move production schema changes to explicit SQL migrations
- Keep `DB_AUTO_SYNC` for development only
- Add role foundation and admin-gated internal actions

## Desktop Reliability
- Queue retryable loot capture actions locally when the backend is unavailable
- Periodically retry queued loot while authenticated
- Preserve queue metadata in desktop storage for crash-safe recovery
- Extend this queue later to cover session lifecycle actions after a stronger local session model exists

## Tracker Intelligence
- Seed reusable strategy presets for session review and future templates
- Expand presets into full session templates with map cost/scarab defaults later
- Add comparative analytics between runs after template data stabilizes

## Path Of Exile Integration
- Keep OAuth linking scaffold ready for real client credentials
- Harden token storage and production env requirements
- Add account/profile derived context once GGG credentials are available

## Web Productization
- Remove deprecated Next.js config warnings
- Keep web socket usage user-scoped and auth-bound
- Continue tightening loading/error/empty states as new backend hardening lands
