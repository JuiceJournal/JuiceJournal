# How tracking works

Juice Journal tracks your farming from files and APIs that Grinding Gear Games makes available to third-party tools. It never touches the game process.

## Maps and sessions: `Client.txt`

The game writes a log file, `logs/Client.txt`, inside its install folder. Juice Journal opens it read-only and follows new lines as they are written. It finds the file from the running game's exe path, from the path you set in Settings, or from common install locations.

From the log it reads:

| Line | Used for |
|---|---|
| Area and map changes | Starting and ending map runs and measuring time spent in each map |
| `Async connecting to … login …` / `Got Instance Details from login server` | Telling the character select screen apart from pressing Play |
| `Name (Class) is now level N`, `Name has been slain.`, `Name has received …` | Working out which of your characters is being played |

Chat lines are skipped. Party members also appear in the name lines, so a name only counts when it matches one of your own characters.

When a map starts and there is no active session, the app can ask whether to start one. The prompt appears in the in-game overlay if the overlay is on, otherwise in the main window.

## Your characters: Path of Exile API

After you sign in (see [Path of Exile sign-in](path-of-exile-sign-in.md)), the app reads your character list from the official API with the `account:characters` scope. It does this at sign-in and start-up, and again when the log shows a character it does not know yet. Requests stay inside GGG's rate limits and leave room for other tools on the same account.

## Your journal: stored on this PC

Sessions, loot entries, map costs and map results are written to a journal file per signed-in profile:

```
%APPDATA%\Juice Journal\profiles\<profile-id>\journal.json
```

Settings and the cached character list are kept in `%APPDATA%\Juice Journal\config.json`. Nothing in the journal is uploaded anywhere.

## Prices: poe.ninja

Item values come from [poe.ninja](https://poe.ninja). The app asks for prices by league and item category only. Prices are cached in memory for 10 minutes. Item icons are downloaded from `web.poecdn.com` the first time they are shown and cached on disk (up to 64 MB).

## Profit

- **Path of Exile 1:** profit is the value of what you gained during a session. It can come from loot you add to the session, or from comparing stash snapshots taken before and after. Stash snapshots need the `account:stashes` API scope. The built-in sign-in only asks for `account:characters`, so stash comparison is not available yet.
- **Path of Exile 2:** GGG offers no stash API for PoE2. Juice Journal tracks time, maps and characters for PoE2 and shows profit as 0 rather than guessing. An experimental screen-reading (OCR) fallback exists, but its results are not treated as reliable profit.

## What Juice Journal does not do

- It does not inject anything into the game, hook it, or read its memory.
- It does not send keys or mouse input to the game.
- It does not write to game files or the game's settings.

The in-game overlay is a separate, always-on-top window. It does not take keyboard focus, so the game stays in the foreground when you click it.
