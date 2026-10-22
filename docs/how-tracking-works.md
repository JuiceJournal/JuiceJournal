# How tracking works

Juice Journal tracks your farming from the game's log file, the official Path of Exile API and poe.ninja prices. It does not inject into the game, hook it or read its memory. Apart from the log file, it only looks up the game's process and window (to find the log file and place the overlay) and, when you press an OCR hotkey, takes a screenshot of your screen.

## Maps and sessions: `Client.txt`

The game writes a log file, `logs/Client.txt`, inside its install folder. Juice Journal opens it read-only and follows new lines as they are written. It finds the file from the running game's exe path, from the path you set in Settings, or from common install locations.

From the log it reads:

| Line | Used for |
|---|---|
| Area and map changes | Starting and ending map runs and measuring time spent in each map |
| `Async connecting to … login …` / `Got Instance Details from login server` | Telling the character select screen apart from pressing Play |
| `Name (Class) is now level N`, `Name has been slain.`, `Name has received …` | Working out which of your characters is being played |

Chat lines are skipped. Party members also appear in the name lines, so a name only counts when it matches one of your own characters.

When a map starts and there is no active session, the app asks whether to start one (Settings → Path of Exile → **Open start modal on new map entry**, on by default). The prompt appears in the in-game overlay if the overlay is on; if you do not answer there within 7 seconds, or the overlay is off, it opens in the main window.

## Your characters: Path of Exile API

After you sign in (see [Path of Exile sign-in](path-of-exile-sign-in.md)), the app reads your character list from the official API with the `account:characters` scope. It does this at sign-in and start-up, when the game starts or switches between PoE1 and PoE2, when a new character first levels up, and once after you press Play if the log has not shown which character you are on. Character-list requests are capped at 4 per 5 minutes (GGG allowed 5 when this was written), and the app waits when GGG reports a rate limit.

## Your journal: stored on this PC

Sessions and their loot entries are written to a journal file per signed-in profile:

```
%APPDATA%\Juice Journal\profiles\<profile-id>\journal.json
```

Settings, map results (per profile) and the cached character list are kept in `%APPDATA%\Juice Journal\config.json`. Nothing in the journal is uploaded anywhere.

## Prices: poe.ninja

Item values come from [poe.ninja](https://poe.ninja). The app asks for prices by league and item category only. Prices are cached in memory for 10 minutes. Item icons are downloaded from `web.poecdn.com` the first time they are shown and cached on disk (up to 64 MB).

## Profit

- **Path of Exile 1:** the intended source is a stash comparison: snapshots of your stash before and after a session. Snapshots need the `account:stashes` API scope, and the built-in sign-in only asks for `account:characters`, so this is not available yet. Today profit is the value of loot added by the experimental OCR scan, and it is kept only when the session ends automatically as you leave the map. Ending a session with the End button records 0 while there is no stash snapshot. The app still asks GGG for a stash snapshot when a PoE1 session starts; without `account:stashes` GGG refuses it and the app shows a "before-stash baseline" warning.
- **Path of Exile 2:** GGG offers no stash API for PoE2. Juice Journal tracks time, maps and characters for PoE2. The OCR scan can add loot to a PoE2 session, but the app does not load PoE2 prices yet, so that loot is valued at 0.

Quitting the app while a session is open records 0 profit in either game.

## What Juice Journal does not do

- It does not inject anything into the game, hook it, or read its memory.
- It does not send keys or mouse input to the game.
- It does not write to game files or the game's settings.

The in-game overlay is a separate, always-on-top window. It does not take keyboard focus, so the game stays in the foreground when you click it.
