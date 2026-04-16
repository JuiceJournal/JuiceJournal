# Active Character Identity Decision Point Design

Date: 2026-04-16
Status: Draft for review
Scope: Decision point after exhausting current low-risk and read-only user-mode identity discovery attempts

## Goal

Document the real technical state of active-character detection after extensive exploration and define the remaining viable paths forward.

This is not an implementation spec.

It is a decision spec:

- what we proved
- what failed
- what remains
- what the cost/risk tradeoff is now

## Product Goal We Were Chasing

For both `PoE1` and `PoE2`:

1. user selects a character
2. user presses `Play`
3. Juice Journal updates to the actually loaded character within `1-3 seconds`

And we wanted this with:

- no stale API dependence
- no wrong character switches
- no blank card
- no hidden platform dependency

## What We Built

The branch now contains all of these:

- local native bridge scaffold
- bridge supervisor
- process / transition / window probes
- character-pool sync
- account-hint sync
- named-pipe probe
- artifact probe with real root discovery
- artifact preview metadata
- file-specific artifact parsers
- read-only memory feasibility spike
- neighborhood-level memory diagnostics

So this was not a shallow attempt. The discovery surface is wide.

## What We Proved

### 1. Process Tree Is Not Enough

Observed:

- PoE2 process is easy to detect
- Steam ancestry is visible
- command line is visible

But:

- command line consistently only exposed `--nopatch`
- no character identity appeared there

Conclusion:

- process ancestry / command line is not a sufficient source

### 2. Window Metadata Is Not Enough

Observed:

- foreground PoE window title and class are visible

But:

- title remained generic (`Path of Exile 2`)
- class remained generic (`POEWindowClass`)

Conclusion:

- window title/class does not carry usable character identity

### 3. Named Pipes Did Not Produce Useful Signal

Observed:

- probe worked
- candidate pipe count stayed zero in live sampling

Conclusion:

- current named-pipe surface is effectively negative

### 4. Artifact Surface Exists But Does Not Yet Yield Identity

Observed files:

- `poe2_production_Config.ini`
- `poe2_production_Loaded.mtx`
- `EShop/*.json`

Observed parsed results:

- config file contained runtime/display/login settings
- `account_name` field was empty
- no character name found
- loaded `.mtx` file exposed stable numeric tokens, but not direct identity

Conclusion:

- artifacts are real and parseable
- but current parsed artifact content did not expose active-character identity

### 5. Read-Only Memory String Scan Works Technically But Did Not Find Character Names

Observed:

- live PoE process can be opened read-only
- committed readable private regions can be enumerated
- bounded buffers can be read and scanned

But:

- direct target-name hits stayed zero

Conclusion:

- naive read-only string scan is not enough

### 6. Read-Only Neighborhood Diagnostics Did Not Produce Stable Character-Sensitive Signal

Observed:

- region fingerprints vary
- text islands are extractable
- neighborhood profiling works

But in A/A/B:

- exact hits remained zero
- neighborhood text stayed generic/noisy
- region fingerprints changed even between repeated runs of the same character

Conclusion:

- current neighborhood-level diagnostics are too noisy for production identity

## Where That Leaves Us

The important conclusion is:

- we did not merely “fail to implement enough”
- we exhausted a large class of low-risk and medium-risk user-mode read-only techniques

So the project is now at a genuine decision point.

## Remaining Options

### Option 1: Stop Here and Relax the Product Goal

Meaning:

- accept that deterministic `1-3 second` active-character detection is not feasible with our current constraints
- keep delayed API refresh and other fallbacks

Pros:

- lowest engineering and legal risk
- no invasive work

Cons:

- does not meet the overlay-quality bar

### Option 2: Pursue Overwolf / GEP Access as an Explicit Platform Strategy

Meaning:

- revisit whether Overwolf’s game-event infrastructure can be used with formal approval/partnership constraints

Pros:

- closest known path to an industry-proven answer

Cons:

- platform dependency
- approval/business constraints
- not fully in our control

### Option 3: Escalate to More Aggressive User-Mode Reverse-Engineering

Meaning:

- pointer-chain discovery
- structured memory layout reverse-engineering
- object/structure identification rather than simple string scanning

Pros:

- probably the only remaining path to a fully local deterministic answer

Cons:

- much higher maintenance cost
- much higher product/legal/anti-cheat risk
- substantially more reverse-engineering work

This is no longer a “small probe enhancement.”

## Recommendation

My engineering recommendation is:

- do not continue pretending that another small low-risk probe will solve it
- treat the next move as an explicit product decision

Recommended order:

1. record current approach as `negative / insufficient`
2. make a conscious choice between:
   - platform strategy (`Overwolf/GEP`)
   - aggressive reverse-engineering spike
   - product goal relaxation

If the goal remains “overlay-level certainty” with no platform dependency, then the honest next move is:

- aggressive reverse-engineering spike

## If We Choose Aggressive Reverse-Engineering

The next spike should be framed narrowly:

- still user-mode
- still no writes/injection
- pointer/structure discovery only
- private experimental branch only
- diagnostics only

It should **not** be presented as shipping work yet.

## If We Choose To Stop

The bridge work still has value:

- we now have a well-instrumented native diagnostics framework
- we can keep it for future experiments
- we can avoid wasting more time on dead-end low-risk probes

## Success Criteria For This Decision Spec

This spec succeeds if the team can clearly answer:

1. are we willing to take on aggressive reverse-engineering risk
2. are we willing to take on platform dependency risk
3. or do we accept a weaker product outcome

## Recommended Next Step

Choose one of these intentionally:

1. write the implementation plan for an aggressive reverse-engineering spike
2. research the Overwolf/GEP path as a real platform strategy
3. write the product fallback spec for a weaker active-character experience
