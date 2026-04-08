# Desktop Icon Design

Date: 2026-04-08
Topic: Juice Journal desktop app icon refresh
Status: Approved for planning

## Goal

Replace the legacy desktop app icon from the earlier PoeFarm branding with a new icon that matches the `Juice Journal` name while still feeling native to the Path of Exile ecosystem.

The new icon should:
- feel like a modern desktop app icon, not a literal game item render
- keep the existing desktop palette centered on dark charcoal and warm gold
- reference Path of Exile through a simplified Divine Orb motif
- express the "journal" part of the product name without using letters

## Design Direction

The approved direction is a **closed field journal with a Divine Orb medallion**.

The icon composition is:
- a rounded-square app tile as the outer silhouette
- a centered closed notebook/journal as the primary form
- a simplified Divine Orb-inspired circular medallion on the journal cover
- restrained warm glow and gold trim to connect to the current desktop visual language

This direction was chosen over an open notebook or monogram-based icon because it keeps the silhouette strong at small sizes and communicates the product concept with fewer details.

## Visual Language

### Overall Feel

The icon should feel:
- modern
- premium
- readable at a glance
- influenced by Path of Exile mood without copying in-game UI ornament too closely

It should not feel:
- like fan art pasted into an icon
- overly gothic or relic-heavy
- busy at small sizes
- dependent on text or initials

### Color Palette

The icon should stay aligned with the desktop app palette in [styles.css](D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/styles.css):
- primary gold: `#c6a15b`
- highlight gold: `#e8c98d`
- dark base: `#0f0c0a`
- dark panel tones around `#15110f` to `#181310`

Color usage guidance:
- use the dark tones for the app tile and notebook body
- use gold for trim, the medallion, and the main highlight edge
- keep glow subtle and localized
- avoid adding new accent colors that break the current brand

## Components

### Outer Tile

The outer tile should:
- use a rounded-square silhouette suitable for Windows desktop icon rendering
- have a dark, slightly warm charcoal gradient
- include a soft vignette or edge shading for depth
- avoid excessive texture that would turn noisy at small sizes

### Journal Form

The journal should:
- sit centered within the tile
- be closed, not open
- read clearly as a notebook or ledger from silhouette alone
- include a slight spine indication on one side
- use subtle beveling rather than detailed leather texture

### Divine Orb Medallion

The Divine Orb element should:
- be simplified into a circular gold medallion
- borrow the recognizable radial geometry of a Divine Orb without copying the game asset literally
- be centered on the front cover
- remain bold enough to survive downscaling

### Lighting

Lighting should:
- emphasize one top-left or upper-edge highlight
- use a soft gold bloom around the medallion only
- preserve strong contrast between icon layers
- avoid multiple competing glow sources

## Asset Scope

This design applies to:
- [icon.png](D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/icon.png)
- [icon.ico](D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/icon.ico)

Secondary alignment may be applied later to:
- [tray-icon.png](D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/tray-icon.png)

The initial implementation should prioritize the main application icon first. The tray icon can remain separate if necessary for legibility at very small sizes.

## Implementation Approach

Preferred implementation order:
1. Create a clean master icon source in a scalable or high-resolution format.
2. Export a square PNG master for desktop packaging.
3. Generate the Windows ICO from the approved PNG master.
4. Verify visibility at common Windows icon sizes before finalizing.

If AI-assisted generation is used, the result must still be refined or selected based on small-size readability rather than prompt aesthetics alone.

## Constraints

- No letters, initials, or wordmarks.
- No direct reuse of copyrighted Path of Exile item art as the final icon.
- No major palette shift away from the current gold and dark neutral tones.
- The icon must remain recognizable at small sizes used in Windows shortcuts and installer surfaces.

## Validation

The icon design is successful if:
- it is immediately distinct from the older PoeFarm branding
- it reads as "journal + PoE economy" without text
- it fits alongside the current desktop UI colors
- it remains legible in both large and small icon previews

## Testing

Before shipping the asset update:
- inspect the PNG at large size for silhouette clarity
- inspect generated ICO sizes for detail collapse or muddy highlights
- verify the icon appears correctly in Electron packaging configuration
- verify no stale icon assets are still referenced in the desktop build config

## Open Decisions Resolved

The following decisions are now fixed for implementation:
- desktop scope only
- no letters
- journal plus Divine Orb motif
- modern app icon styling
- current desktop palette retained
