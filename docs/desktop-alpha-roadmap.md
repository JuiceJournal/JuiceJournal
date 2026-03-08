# Desktop Alpha Roadmap

## Current Milestone

The desktop app now reads core tracker data from the backend instead of relying on placeholder dashboard/session/recent-loot content.

## Next Highest-Value Features

### 1. Session Detail Drawer
- Open a completed or active run from the sessions list.
- Show run loot, duration, total cost, total profit, and quick notes.
- This is the natural place to add strategy tags later without redesigning the sessions page again.

### 2. Strategy Tags
- Add optional per-session labels such as `essence`, `blight`, `expedition`, `boss-rush`, `sanctum-feed`.
- Keep tags on `Session`, not `LootEntry`.
- Use tags for filtering, comparing runs, and future profitability breakdowns.

### 3. Loot Category Analytics
- Aggregate loot by `itemType` and show category contribution for the selected game/league.
- Start with a simple breakdown: `currency`, `fragment`, `scarab`, `map`, `divination_card`, `gem`, `unique`, `other`.
- Add a small summary card before building a dedicated analytics page.

### 4. Run Comparison
- Compare the latest run against:
  - session average in the same map
  - session average in the same strategy tag
  - daily average in the same league/game context
- Keep the first iteration lightweight and desktop-focused.

### 5. Offline Safety
- Queue loot adds locally when the backend is unreachable.
- Retry on reconnect.
- Cache the last successful dashboard/sessions/recent-loot payloads so the desktop shell stays useful during brief outages.

### 6. Path of Exile Account Linking
- Move from mock mode to the real GGG OAuth flow as soon as client registration is approved.
- First production target remains account linking, not full login replacement.

## Suggested Delivery Order

1. Session detail drawer
2. Strategy tags on sessions
3. Loot category analytics summary
4. Offline-safe queue/cache
5. Run comparison
6. Real Path of Exile linking
