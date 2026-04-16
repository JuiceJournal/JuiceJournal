# Memory Reading Feasibility Design

Date: 2026-04-16
Status: Draft for review
Scope: User-mode, read-only memory inspection feasibility spike for `PoE1 + PoE2` active-character identity

## Goal

Determine whether a read-only, user-mode memory inspection approach can identify the active Path of Exile character quickly and reliably enough to meet the product requirement:

1. user selects a character
2. user presses `Play`
3. Juice Journal switches to the loaded character within `1-3 seconds`

This phase is strictly a feasibility spike.

It does **not** mean:

- production rollout
- automatic shipping
- user release
- background deployment

It is a technical risk-assessment phase only.

## Why We Are Here

The low-risk user-mode surfaces have now been exercised deeply:

- process command line
- process ancestry
- foreground window data
- named pipes
- artifact names
- artifact previews
- parsed config/state/mtx diagnostics

Result:

- we are getting meaningful diagnostics
- but not direct active-character identity
- and not a reliable exact-match signal strong enough for production promotion

So the remaining question is:

- is read-only memory inspection technically able to expose character identity where these lower-risk surfaces do not

## External Risk Boundary

Grinding Gear Games’ public terms and staff guidance are not friendly to tools that interact with the client or expose information not normally visible.

Relevant official sources:

- Terms of Use: [Path of Exile & Path of Exile 2 Terms of Use](https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy)
- Staff forum guidance: [Clarification on terms of service related to using 3rd party programs](https://www.pathofexile.com/forum/view-thread/3734853/filter-account-type/staff)

Important practical interpretation:

- GGG does not guarantee that a third-party tool is allowed
- GGG explicitly advises against tools that interact with the client in ways that provide an advantage or expose information that is not normally visible

Because of that, this phase must remain:

- private
- isolated
- opt-in for local experimentation only
- non-production until an explicit later decision

## Core Decision

### What This Spike Is Allowed To Do

Allowed:

- read-only user-mode process memory access
- manual/local execution only
- one-shot or short-lived sampling
- diagnostics-only output
- local comparison against a synced character pool

Not allowed:

- kernel/driver components
- injection
- patching or writing process memory
- input automation
- hidden always-on background collection
- production hint promotion from memory data during this phase

### Output Standard

This spike succeeds only if one of these is proven:

1. direct identity
   - memory contains active character name or equivalent field

2. strong correlation
   - memory contains a stable pointer/string structure that can be mapped to one exact character

3. negative result
   - memory is inaccessible, unstable, or too risky to rely on

## Recommended Approach

### Approach A: String-Focused Read-Only Sampling

Read a small set of committed readable memory regions from the PoE process and scan for:

- current account name
- known character names from the synced pool
- class/ascendancy labels
- nearby structured text

Why this is first:

- fastest to validate
- easiest to reason about
- lowest implementation cost inside a memory-reading world

Limits:

- high noise
- many false positives
- no structure unless we find stable neighbors

### Approach B: Region Profiling and Stable Address Discovery

Profile the process over repeated samples:

- locate regions where character strings appear
- identify whether those addresses or nearby layouts remain stable across launches
- infer whether a structure exists around the string

Why second:

- if direct string search finds hits, this tells us whether they are usable

Limits:

- higher implementation cost
- still not a shipping answer on its own

### Approach C: Full Structured Reverse-Engineering

Actively reverse in-memory layouts, pointer chains, and object structures.

Why not first:

- this is the most invasive user-mode path
- much higher maintenance burden
- much closer to a true reverse-engineering program than a light feasibility spike

Recommendation:

- do **not** start here
- only consider this if Approaches A and B show strong promise

## Recommended Direction

Proceed with:

- Approach A first
- then Approach B only if A yields promising string hits

Do not go to structured reverse-engineering unless the first spike proves there is real value there.

## Architecture

### Native Bridge Side

Keep memory work isolated from the existing probes.

Recommended split:

- `MemoryProbe`
  - enumerates candidate memory regions
- `MemoryStringScanner`
  - scans bounded readable buffers for known target strings
- `MemoryHitNormalizer`
  - shapes raw hits into diagnostics
- `MemoryFeasibilityCoordinator`
  - compares hits against synced character pool and reports whether the signal is direct, correlated, or noise

The existing bridge should continue to treat this output as diagnostics only.

### Desktop Side

No renderer changes.

Desktop main should only:

- continue syncing `characterPool`
- optionally pass a limited set of target names for the spike
- log diagnostics

No user-facing hint promotion during this phase.

## Safety Constraints

The spike must:

- run only when explicitly started
- target only the active `PathOfExile` process
- read only committed readable regions
- cap total bytes scanned
- cap per-region bytes scanned
- log no raw dumps larger than a small safe sample
- avoid persisting arbitrary process memory to disk

Diagnostics should prefer:

- hashes
- match counts
- redacted snippets
- region metadata

over raw memory payloads.

## Testing Strategy

### Unit Tests

- region filters accept only readable committed regions
- string scanner matches known pool names
- scanner rejects binary noise
- diagnostics stay bounded and redacted

### Integration Tests

- bridge can enumerate a fake readable process memory source
- bridge reports direct string hits for a synthetic region
- bridge remains fail-closed when access is denied

### Manual Validation

For one PoE2 character A and one PoE2 character B:

1. open character A
2. run one-shot memory feasibility sample
3. repeat character A
4. switch to character B
5. run one-shot sample again

We are looking for:

- A vs A stability
- A vs B clear difference
- exact character-name hits or stable nearby markers

## Exit Criteria

This spike is worth continuing only if:

- it produces consistent direct character-name hits
- or it yields a stable per-character region/signature

If it does not do either, we should stop and not sink more work into memory reading.

## Out of Scope

Still out of scope:

- shipping a memory reader
- background automation
- kernel drivers
- pointer-chain reverse-engineering
- anti-detection work
- evasion work of any kind

## Recommended Next Step

Write the implementation plan for a **read-only memory feasibility spike** that:

1. enumerates safe readable regions
2. scans bounded memory for synced character names
3. emits diagnostics only
4. compares A/A/B stability before any further escalation
