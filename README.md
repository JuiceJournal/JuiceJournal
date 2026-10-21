<p align="center">
  <img src="desktop/src/assets/brand/mark.svg" alt="Juice Journal" width="96">
</p>

# Juice Journal

A farming journal and in-game overlay for **Path of Exile 1** and **Path of Exile 2**. Free, open source and ad-free. Your data stays on your PC.

Juice Journal follows your map runs from the game's log file, recognises the character you are playing, prices your loot with poe.ninja and keeps a journal of every session. An optional overlay shows the current run, map prompts and map results on top of the game.

Inspired by [TLI Tracker](https://github.com/Giboork/TLI-tracker-translated) from the Torchlight Infinite community.

> **Status: alpha.** Windows only. There are no installer releases yet; build it from source (see below).

## Features

| Feature | Notes |
|---|---|
| Map and session tracking | Reads the game's `Client.txt` log: map entries and exits, time per map, sessions |
| Character on Play | Detects when you press Play and which of your characters you are on |
| In-game overlay | Run status, a "start session?" prompt on map entry, and a result card when a map ends. Off by default (Settings) |
| Local journal | Sessions, loot, map costs and map results, stored per Path of Exile profile on your PC |
| Loot pricing | Prices from [poe.ninja](https://poe.ninja), cached in memory; item icons cached on disk |
| Path of Exile sign-in | Official OAuth sign-in on your PC; only reads your character list |
| Farm types and profit tiers | Tag runs by league content and see how good a run was at a glance |
| 12 languages | English and Turkish reviewed; others partly translated |
| OCR loot scan | Experimental: reads loot text from a screenshot (F9) |

**Profit.** For PoE1, profit comes from loot added to a session. Stash snapshot comparison needs the `account:stashes` API scope, which the built-in sign-in does not request yet, so it is not available for now. GGG offers no stash API for PoE2, so PoE2 profit stays at 0 instead of being guessed. Details: [How tracking works](docs/how-tracking-works.md).

## Privacy and data

Juice Journal has no accounts and no servers of its own. Everything is stored under `%APPDATA%\Juice Journal\`:

- `config.json`: settings, your signed-in profile, cached character list, the GGG token (encrypted with Windows data protection)
- `profiles/<id>/journal.json`: your journal
- `icon-cache/`: downloaded item icons

The app talks to these hosts only:

| Host | Why |
|---|---|
| `www.pathofexile.com`, `api.pathofexile.com` | Sign-in and your character list |
| `poe.ninja` | Item prices (league and category only) |
| `web.poecdn.com` | Item icons |
| `cdn.jsdelivr.net` | OCR language data, on the first OCR scan only |
| `github.com` | Update checks in installed builds |
| A backend URL you configure | Only if you self-host the optional backend |

There is no telemetry and there are no ads.

## Fair play

Juice Journal uses only what GGG allows third-party tools to use: the game's log file and the official API.

- It does **not** inject into the game, hook it or read its memory.
- It does **not** send keys or mouse input to the game.
- It does **not** modify game files or settings.

The overlay is a separate always-on-top window. It never takes keyboard focus, so clicking it leaves the game in the foreground. It shows over **Windowed** and **Windowed Fullscreen**, and over **Fullscreen with DirectX 12**. Use Windowed Fullscreen if it does not appear.

## Getting started

Requirements: Windows 10/11 (64-bit), [Node.js](https://nodejs.org) 22.12 or newer (developed on Node 24), Git.

```bash
git clone https://github.com/JuiceJournal/JuiceJournal.git
cd JuiceJournal/desktop
npm install
npm run dev
```

Then sign in with Path of Exile, check the `Client.txt` path in Settings if it was not found, and turn on the overlay in Settings if you want it.

If `npm install` warns that install scripts were skipped (npm 12 does this by default), approve them with `npm install-scripts approve electron koffi` and run `npm install` again; otherwise Electron is not downloaded.

Build a Windows installer into `desktop/dist/`:

```bash
npm run build:win
```

Builds are not code-signed yet, so Windows SmartScreen will warn when you run the installer.

## Optional backend and web app

`backend/` (Express + PostgreSQL) and `web/` (Next.js) are not needed to use the desktop app. If you self-host the backend and set its URL in Settings → API, it powers the Currency browser page and the Farming Hub list. Publishing to the Farming Hub still needs a backend login that the current desktop UI does not offer. See [backend/README.md](backend/README.md) and [web/README.md](web/README.md).

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
