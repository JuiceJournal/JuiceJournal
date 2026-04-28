# Overwolf GEP Capture Harness

This directory is manual verification tooling for Overwolf Game Events Provider payloads. It is not part of the normal desktop release.

The production app stays usable without Overwolf. This harness exists only to capture sanitized PoE and PoE2 payload shapes when an Overwolf or ow-electron runtime is available.

## Install

```powershell
cd desktop/overwolf-spike
npm install
```

## Run

```powershell
npm run start
```

For a debug session:

```powershell
npm run start:dev-gep
```

The debug script includes `--owepm-packages-url=https://electronapi-qa.overwolf.com/packages`, which is required while testing the GEP package outside the normal release channel.

## Dependency Note

`@overwolf/ow-electron` is a dev-only dependency for this manual harness. As of `39.6.1`, npm audit reports a moderate transitive `@electron/get -> got` advisory with no available npm fix. Do not ship this harness or its dependency tree in the normal desktop release package.

## Capture Scope

Target game ids:

- Path of Exile: `7212`
- Path of Exile 2: `24886`

Requested features:

- `gep_internal`
- `me`
- `match_info`
- `game_info`
- `death`
- `kill`

The harness also records `getSupportedGames()` and per-game `getFeatures(gameId)` output before calling `setRequiredFeatures`. If the runtime reports a smaller supported feature set than the documented list, the harness records both the requested and runtime-supported feature lists and subscribes to the runtime-supported subset for that capture.

When GEP emits `game-detected`, the harness calls `event.enable()` for the PoE/PoE2 target before expecting native game data. This mirrors Overwolf's sample app flow and is required for the GEP package to connect to the detected game process.

## Handling Captured Data

Use the on-screen output to inspect payload shape. If a payload should become a fixture, manually sanitize it first and place it under `fixtures/`.

Do not commit raw chat content, account identifiers, or private character data. Chat event data is redacted in the capture UI before display.

## Expected Next Step

Once real payloads are captured, convert the smallest representative examples into unit tests for `desktop/src/modules/nativeGameInfoProducerModel.js`.
