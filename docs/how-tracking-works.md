# How tracking works

Juice Journal tracks your farming from the game's log file, the official Path of Exile API and poe.ninja prices. It does not inject into the game, hook it or read its memory. Apart from the log file, it only looks up the game's process and window (to find the log file and place the overlay), checks which window is in front (to hold the inventory read hotkeys only while the game is) and reads a small part of your screen to count your inventory (see [Loot: your inventory](#loot-your-inventory)).

## Maps and sessions: `Client.txt`

The game writes a log file, `logs/Client.txt`, inside its install folder. Juice Journal opens it read-only and follows new lines as they are written. It finds the file from the running game's exe path, from the path you set in Settings, or from common install locations.

From the log it reads:

| Line | Used for |
|---|---|
| Area and map changes | Starting and ending map runs and measuring time spent in each map |
| `Async connecting to … login …` / `Got Instance Details from login server` | Telling the character select screen apart from pressing Play |
| `Name (Class) is now level N`, `Name has been slain.`, `Name has received …` | Working out which of your characters is being played |

Chat lines are skipped. Party members also appear in the name lines, so a name only counts when it matches one of your own characters.

When you enter a map and no map is running, the app starts one (Settings → Path of Exile → **Start maps on entry**, on by default). If the overlay is on, it first shows a card for 7 seconds. There you can pick another farm type, type its entry cost in the cost box (the overlay takes the keyboard only while you type there; Enter starts the map, Esc goes back to the game), or press Cancel to skip the map. A cost typed there is saved for that farm type, as on the Dashboard. Once you click on the card it waits for Start or Cancel. If you do nothing, the map starts with the farm type selected on the Dashboard. If you leave the map before then, nothing starts. The main window never opens over the game for this.

## Your characters: Path of Exile API

After you sign in (see [Path of Exile sign-in](path-of-exile-sign-in.md)), the app reads your character list from the official API with the `account:characters` scope. It does this at sign-in and start-up, when the game starts or switches between PoE1 and PoE2, when a new character first levels up, and once after you press Play if the log has not shown which character you are on. Character-list requests are capped at 4 per 5 minutes (GGG allowed 5 when this was written), and the app waits when GGG reports a rate limit.

## Your journal: stored on this PC

Sessions and their loot entries are written to a journal file per signed-in profile:

```
%APPDATA%\Juice Journal\profiles\<profile-id>\journal.json
```

Settings, map results (per profile) and the cached character list are kept in `%APPDATA%\Juice Journal\config.json`. Nothing in the journal is uploaded anywhere. Settings → Data shows the `%APPDATA%\Juice Journal\` folder and opens it in File Explorer. **Delete everything** there removes every profile's journal, the map results, the settings except the language, the saved sign-ins, the logs and the caches from this PC and restarts the app; runs you shared to an online server stay there.

## Loot: your inventory

Experimental. For now it works for Path of Exile 2 only, because the PoE1 inventory layout has not been measured, and only for a game window 1440 pixels tall, checked on real screenshots at 2560x1440.

- Open your inventory before a map and again after it. The app reads it by itself, or you press F9 (or Ctrl+Shift+L). The loot of a map is what your inventory gained between the two reads.
- Only priced stackable items count, not gear.
- While automatic reading is on (Settings → Path of Exile), the app reads a small part of the screen when the game is in front and you are outside a map. It does not read the game's memory or send input to it.
- If more than one map passes without a read, the whole gain goes to the last map and its result says how many maps it covers.
- A read is skipped while a tooltip covers your items. Anything the app cannot read for sure counts as no gain, so the total can come out low but should not come out high.
- Nothing from the screen is saved or sent. The item counts of your last read stay in memory until you close the app, so after a restart open your inventory before the next map, or that map is not counted.

## Prices: poe.ninja

Item values come from [poe.ninja](https://poe.ninja). The app asks for prices by league and item category only. Prices for a session's game and league are loaded when the session starts (or when the first inventory loot is counted after a restart) and kept in memory until you switch game or league or restart the app. Counting inventory loot waits up to 5 seconds for them; loot without a price counts as 0, and if poe.ninja could not be reached the app tries again after 5 minutes. For PoE2 the app loads only poe.ninja's currency exchange prices, so other PoE2 items are valued at 0. Item icons are downloaded from `web.poecdn.com` the first time they are shown and cached on disk (up to 64 MB).

## Profit

- **Path of Exile 1:** the intended source is a stash comparison: snapshots of your stash before and after a session. Snapshots need the `account:stashes` API scope, and the built-in sign-in only asks for `account:characters`, so the stash tracker is turned off and the app sends no stash requests. Inventory reading does not cover PoE1 yet, so PoE1 maps have no loot source for now.
- **Path of Exile 2:** GGG offers no stash API for PoE2. Profit is the value of the loot counted from your inventory after the map, priced from poe.ninja's currency exchange (see [Prices](#prices-poeninja)).

The session keeps this profit however it ends: as you leave the map, with the End button, or when you quit the app. Each completed session is added to your map results and, if the overlay is on, shown as a result card in the overlay (not while the app is quitting).

## What Juice Journal does not do

- It does not inject anything into the game, hook it, or read its memory.
- It does not send keys or mouse input to the game.
- It does not write to game files or the game's settings.

The in-game overlay is a separate, always-on-top window. It does not take keyboard focus, so the game stays in the foreground when you click it.
