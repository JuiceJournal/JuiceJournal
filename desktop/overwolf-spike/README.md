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

## Handling Captured Data

Use the on-screen output to inspect payload shape. If a payload should become a fixture, manually sanitize it first and place it under `fixtures/`.

Do not commit raw chat content, account identifiers, or private character data. Chat event data is redacted in the capture UI before display.

## Expected Next Step

Once real payloads are captured, convert the smallest representative examples into unit tests for `desktop/src/modules/nativeGameInfoProducerModel.js`.
