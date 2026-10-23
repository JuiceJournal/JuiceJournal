<p align="center">
  <img src="desktop/src/assets/brand/mark.svg" alt="Juice Journal" width="96">
</p>

# Juice Journal

A farming journal and in-game overlay for **Path of Exile 1** and **Path of Exile 2**. Free, open source and ad-free. Your data stays on your PC.

Juice Journal follows your map runs from the game's log file, recognises the character you are playing and keeps a journal of your sessions. An optional overlay shows your current run on top of the game and asks whether to start a session when you enter a map.

Inspired by [TLI Tracker](https://github.com/Giboork/TLI-tracker-translated) from the Torchlight Infinite community.

> **Status: alpha.** Windows only. There are no installer releases yet; build it from source (see below).

## Features

| Feature | Notes |
|---|---|
| Map and session tracking | Reads the game's `Client.txt` log: map entries and exits, time per map, sessions |
| Character on Play | Detects when you press Play and which of your characters you are on |
| In-game overlay | Run status, a "start session?" prompt on map entry, a character picker after Play and a result card when a session ends. Off by default (Settings) |
| Local journal | Sessions, loot and map results per Path of Exile account, stored on your PC |
| Path of Exile sign-in | Official OAuth sign-in on your PC; only reads your character list |
| Farm types and profit tiers | Tag runs by league content; results are labelled by profit tier |
| Languages | English and Turkish. German, French, Spanish, Italian, Portuguese (Brazil) and Russian are only partly translated; Japanese, Korean and Chinese can be selected but show English |
| OCR loot scan | Experimental, during an active session with the game window in front: F9 or Ctrl+Shift+L takes a screenshot of your screen and reads loot names from it. The loot is priced with [poe.ninja](https://poe.ninja); in PoE2 only currency exchange items have a price |

**Profit is limited for now.** Profit is the value of the loot the experimental OCR scan adds to a session. Stash comparison, the reliable source for PoE1, needs the `account:stashes` API scope, which the built-in sign-in does not request yet, so the stash tracker is off; GGG offers no stash API for PoE2. Details: [How tracking works](docs/how-tracking-works.md).

## Privacy and data

Juice Journal has no accounts and no servers of its own. Your data is stored under `%APPDATA%\Juice Journal\`:

- `config.json`: settings, your signed-in profile, map results, the cached character list, a short activity log (sign-ins, session starts and ends) and the GGG token (encrypted with Windows data protection)
- `profiles/<id>/journal.json`: your sessions and loot
- `icon-cache/`: downloaded item icons
- `ocr-cache/`: the OCR language data (`eng.traineddata`), downloaded on the first scan

The OCR scan's screenshot is processed on your PC and is not uploaded.

The app talks to these hosts only:

| Host | Why |
|---|---|
| `www.pathofexile.com`, `api.pathofexile.com` | Sign-in and your character list |
| `poe.ninja` | Item prices (league and category only) |
| `web.poecdn.com` | Item icons |
| `cdn.jsdelivr.net` | OCR language data, first scan only |
| GitHub | Checking for and downloading updates, installed builds only |
| The server address in Settings → Online (default `http://localhost:3001`, your own PC) | Only after you turn on online features there: the Farming Hub list and the server sign-in. Once signed in to the server, also sharing runs and the server's stash snapshots when the device has no Path of Exile connection. Online features are off by default, and while they are off nothing is sent to this address |

There is no telemetry and there are no ads.

## Fair play

Juice Journal reads the game's log file and uses the official Path of Exile API. To find the game and place the overlay, it also checks the Windows process list and the game window's position. During a session it checks which window is in front, so it can hold the OCR hotkeys only while the game is.

- It does **not** inject into the game, hook it or read its memory.
- It does **not** send keys or mouse input to the game.
- It does **not** modify game files or settings.

The overlay is a separate always-on-top window. It never takes keyboard focus, so clicking it leaves the game in the foreground. It shows over **Windowed** and **Windowed Fullscreen**; in our tests it also showed over Path of Exile 2 in **Fullscreen with DirectX 12**. Use Windowed Fullscreen if it does not appear.

## Getting started

Requirements: Windows 10/11 (64-bit), [Node.js](https://nodejs.org) 22.12 or newer (developed on Node 24), Git.

```bash
git clone https://github.com/JuiceJournal/JuiceJournal.git
cd JuiceJournal/desktop
npm install
npm run dev
```

If `npm install` warns that install scripts were skipped (npm 12 does this by default), approve them with `npm install-scripts approve electron koffi` and run `npm install` again; otherwise Electron is not downloaded.

Good to know:

- You must sign in with Path of Exile (**Continue with Path of Exile**) before you can use the app. It uses local port `34127`, which must be free.
- If the log file was not found, set the `Client.txt` path in Settings. Turn on the overlay there too.
- The OCR scan hotkeys, F9 and Ctrl+Shift+L, are only held while a session runs and the game window is in front (for the whole session if the app cannot read which window is in front); the game does not receive those two keys then. Change them in Settings → Hotkeys.
- Closing the window keeps the app running in the tray.
- Deleting `%APPDATA%\Juice Journal\` removes all of your local data.

Build a Windows installer into `desktop/dist/`:

```bash
npm run build:win
```

Builds are not code-signed yet, so Windows SmartScreen will warn when someone runs an installer they downloaded.

## Optional backend and web app

`backend/` (Express + PostgreSQL) and `web/` (Next.js) are not needed to use the desktop app. If you self-host the backend, turn on online features in Settings → Online and enter its address there. It powers the Farming Hub list. To share runs, sign in to the server on the same tab; that sign-in goes through the backend's own Path of Exile OAuth setup. See [backend/README.md](backend/README.md) and [web/README.md](web/README.md).

## Development

```bash
cd desktop
npm test               # unit tests (node:test)
npm run test:e2e       # Electron end-to-end tests (Playwright)
```

Backend and web tests: `npm test` in `backend/` (after `npm install`) and in `web/`. GitHub Actions runs the unit tests for all three on every pull request.

Project layout:

```
desktop/   Electron app: main process, renderer, overlay, tests
backend/   Optional Express + PostgreSQL API
web/       Optional Next.js site
docs/      User and contributor documentation
```

More: [How tracking works](docs/how-tracking-works.md) · [Path of Exile sign-in](docs/path-of-exile-sign-in.md) · [Contributing](CONTRIBUTING.md)

## License

Code: [MIT](LICENSE).

Path of Exile names, game art and item icons belong to Grinding Gear Games and are not covered by the MIT license. Fonts are under the SIL Open Font License (see `desktop/src/assets/fonts/`).

Juice Journal isn't affiliated with or endorsed by Grinding Gear Games in any way.
