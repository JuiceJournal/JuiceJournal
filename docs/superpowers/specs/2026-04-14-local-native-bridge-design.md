# Local Native Bridge Design

Date: 2026-04-14
Status: Draft for review
Scope: Windows-local native bridge for active Path of Exile character detection without depending on Overwolf as a product platform

## Goal

Add a real native data source that lets Juice Journal update the active character card within roughly `1-3 seconds` after the user presses `Play` and loads into the game.

This design replaces the missing runtime provider, not the producer/consumer pipeline that already exists in the desktop app.

## Product Position

Juice Journal should not depend on Overwolf as a product requirement.

But the current product target still requires a native capability:

- detect active PoE client process
- receive game-adjacent info after load
- emit a high-confidence active character hint quickly

So the real dependency is not Overwolf itself. The real dependency is a native event/info capability that Overwolf happened to provide in the reference app.

## Problem Statement

The current branch already has:

- `nativeCharacterHintModel`
- `nativeGameInfoProducerModel`
- `nativeGameInfoProducer`
- `main.js` lifecycle wiring
- renderer consumption and fallback ordering
- fail-closed smoke coverage

But the card still does not switch after `Play` because there is no real provider underneath it.

We also validated that:

- `GGG character API` is too stale/coarse for this SLA
- `PoE2 Client.txt` contains useful area and level-up data
- `PoE2 Client.txt` does not expose a reliable active-character selection signal at load time

That means the next real step is not more fallback tuning. It is a true local native bridge.

## Technology Decision

The bridge will use:

- `.NET 10`
- Windows-only native process
- local IPC back into Electron

Why `.NET 10`:

- modern Windows-native interop is straightforward
- debugging and shipping are significantly cheaper than a C++ bridge
- process/window/native API access is strong enough for an investigation-first bridge
- ownership stays in our codebase instead of an external platform runtime

## Primary Design

### 1. Companion Bridge Process

Add a separate Windows-native companion process, launched by the Electron main process.

Responsibilities:

- attach to the local PoE runtime context
- observe candidate native signals
- normalize them into a stable event stream
- send high-confidence hints back to Electron

The bridge should be treated as optional:

- if it starts and yields signals, desktop uses them
- if it fails, desktop remains operational and falls back

### 2. Local IPC Contract

Electron and the bridge need a narrow contract.

Recommended transport:

- bridge writes newline-delimited JSON to stdout
- Electron spawns the bridge and reads stdout/stderr

Why this first:

- simplest implementation and debugging path
- no Windows service registration
- no named-pipe framing complexity in v1
- easy to keep fail-closed

Possible later upgrade:

- named pipe for bidirectional control

But that is not required for the first bridge spike.

### 3. Native Event Payload

The bridge should emit only normalized desktop-safe payloads.

Minimum v1 payload:

```json
{
  "type": "active-character-hint",
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "level": 92,
  "confidence": "high",
  "source": "local-native-bridge",
  "detectedAt": "2026-04-14T12:00:00.000Z"
}
```

Supplemental diagnostics payload:

```json
{
  "type": "bridge-diagnostic",
  "level": "info",
  "message": "Attached to PoE2 process",
  "detectedAt": "2026-04-14T12:00:00.000Z"
}
```

The Electron side should ignore any payload that does not match the active game scope.

## Bridge Responsibilities

### Process Lifecycle

The bridge should:

1. start only on Windows
2. be launched by Electron main on app startup or first relevant game detection
3. remain idle until a supported PoE process exists
4. stop with Electron app shutdown

### Runtime Detection

The bridge should understand:

- `PoE1 native`
- `PoE1 Steam`
- `PoE2 native`
- `PoE2 Steam`

It does not own broad app state. It only owns native observation and signal emission.

### Candidate Native Signal Sources

We do not yet know which of these will give the reliable `1-3 second` signal. So the bridge should be built investigation-first, with instrumentation.

Candidate sources:

1. process/window metadata
2. module/handle state around the running client
3. child process / launch transition metadata
4. game window/title/class transitions
5. local files or IPC side channels created by the game runtime

Explicitly out for the first bridge:

- OCR
- memory scanning cheats-style approach
- kernel or driver components

## Architecture

### Electron Main

Add a `BridgeSupervisor` responsibility in `desktop/main.js` or a focused module:

- spawn the `.NET 10` bridge executable
- capture stdout
- parse NDJSON messages
- convert bridge payloads to `emitActiveCharacterHint(...)`
- restart bridge only when needed

### Native Bridge

Add a new sibling project, for example:

- `desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Responsibilities:

- Windows entry point
- process watcher
- signal probes
- JSON line emitter

### Existing Producer

The current `nativeGameInfoProducer` should not be discarded yet.

Instead:

- rename its role conceptually to `native hint source adapter`
- allow it to consume bridge messages instead of a hypothetical `app.overwolf.packages.gep`

That preserves the current renderer contract and most of the current tests.

## Proposed Delivery Phases

### Phase A: Bridge Spike

Goal:

- prove we can launch a `.NET 10` helper from Electron
- prove it can identify PoE1 vs PoE2 process context
- prove stdout IPC is stable

This phase does not yet promise active-character success.

### Phase B: Native Signal Probe

Goal:

- instrument candidate native signals during `character select -> Play -> load`
- determine which signal changes within `1-3 seconds`
- document whether the signal includes:
  - direct character name
  - class
  - level
  - or only a trigger to pair with fallback data

### Phase C: Active Character Emission

Goal:

- emit high-confidence `active-character-hint`
- feed that into existing desktop producer/renderer path
- validate real character card switching

## Error Handling

If the bridge process fails to start:

- log a structured warning
- keep app behavior intact
- keep API fallback alive

If bridge stdout emits malformed JSON:

- ignore that line
- keep bridge alive unless corruption becomes continuous

If the bridge disconnects:

- mark bridge unavailable
- do not blank the character card
- preserve existing fallback behavior

## Testing Strategy

### Unit Tests

Desktop side:

- parse bridge stdout lines into events
- ignore malformed lines
- map valid bridge hint to existing `emitActiveCharacterHint(...)`

Bridge side:

- process detection normalization
- payload serialization
- invalid state handling

### Integration Tests

- Electron launches bridge successfully
- bridge emits a synthetic high-confidence hint
- desktop main forwards it to renderer
- renderer updates active character without delayed API refresh

### Manual Validation

1. launch Juice Journal
2. launch PoE2
3. choose a different character
4. press `Play`
5. verify card updates within `1-3 seconds`

Repeat for:

- PoE2 Steam
- PoE2 native
- PoE1 Steam
- PoE1 native

## Risks

### Unknown Native Signal

The biggest risk is not bridge plumbing. It is whether Windows-local userland APIs expose the right signal without escalating into invasive techniques.

### Shipping Complexity

Adding a `.NET 10` helper increases packaging complexity:

- build output
- Windows publishing
- app startup supervision

This is acceptable if we keep the bridge narrow and optional.

### Cross-Version Drift

PoE1 and PoE2 may require different signal probes. The bridge should therefore model version-specific probes rather than assuming one path fits both.

## Out of Scope

Not part of this design:

- OCR fallback
- anti-cheat-adjacent memory scanning
- non-Windows support
- market/trade overlay work
- stash/result/history features

## Recommended Next Step

Build the `.NET 10` bridge as a spike:

1. spawn from Electron
2. detect PoE1 vs PoE2 runtime
3. emit diagnostics over stdout
4. observe which native signals move during `Play -> load`

If that spike produces a usable signal, the existing desktop native-hint pipeline can consume it with minimal architectural churn.
