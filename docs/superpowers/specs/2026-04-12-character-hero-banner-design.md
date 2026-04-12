# Character Hero Banner Design

Date: 2026-04-12
Status: Draft for review
Scope: Desktop dashboard character summary card visual redesign

## Goal

Replace the current compact character summary card with a hero-style banner inspired by the PoE Overlay II character panel.

The new design should make the selected character feel prominent and readable at a glance while preserving the existing dashboard width and overall layout rhythm.

## Product Outcome

The character card should:

- keep the current dashboard footprint
- feel more like a cinematic character banner than a stats card
- use a full-width background artwork behind the character details
- keep the small circular portrait on the left
- display only:
  - `level`
  - `league`
  - `account`
  - `class`

No additional combat or resource stats are part of this design.

## Visual Direction

### Core Layout

The card becomes a layered hero banner:

- left edge:
  - circular portrait medallion
  - level shown near or under the portrait
- center-left:
  - character name as the primary heading
  - league pill beside the name
  - class label beside the league
- lower content row:
  - compact information blocks for:
    - level
    - league
    - account
- far right / upper-right:
  - small `PoE1` / `PoE2` badge

### Background

The card uses a large class/ascendancy artwork as a full background banner.

Rules:

- artwork should stretch across the card width
- text must remain readable over the image
- add a dark gradient overlay between the image and text
- avoid blurred or visibly pixelated rendering
- do not reduce card size to compensate for the new art

### Foreground Portrait

The small portrait remains, but it should read as a foreground medallion rather than the main image.

Rules:

- use a circular crop
- keep it visually sharper than the current square portrait block
- preserve the current theme and gold-accent styling

## Asset Strategy

Each character visual should have two image roles:

1. `portrait`
Small circular image used on the left side.

2. `banner`
Large background artwork used across the card.

This applies to both `PoE1` and `PoE2`.

### PoE2 Mapping

Planned mappings:

- `Druid2` / `Shaman`
  - portrait: shaman close-up
  - banner: shaman full artwork
- `Monk2` / `Invoker`
  - portrait: monk close-up
  - banner: invoker/monk full artwork
- `Mercenary3` / `Gemling Legionnaire`
  - portrait: mercenary close-up
  - banner: mercenary full artwork
- `Huntress1` / `Amazon`
  - portrait: huntress close-up
  - banner: huntress full artwork

### PoE1 Mapping

The same dual-asset approach applies:

- `Templar`
- `Ranger`
- `Witch`
- `Marauder`
- `Duelist`
- `Shadow`
- `Scion`

Each gets:

- one portrait image
- one banner artwork

## Data Requirements

The card only consumes fields we already trust:

- character name
- class label
- level
- league
- account
- game version badge

No live stat panel is included.

## Rendering Rules

### Empty / Missing State

If no valid character exists:

- keep the card layout stable
- use the current empty-state copy
- do not show a broken banner
- fall back to a neutral banner or dark themed background

### Image Loading

If a banner asset is missing:

- fall back to the current dark/gold styled background
- keep portrait rendering if available

If a portrait asset is missing:

- fall back to the initials / badge logic already present

### Sharpness

To avoid muddy or stretched visuals:

- use proper full-size source images for banners
- avoid relying on tiny portrait crops as background art
- keep `background-size` / image-fit behavior intentional and class-specific if needed

## Architecture

### Visual Model

Extend the current character visual model so it returns both:

- `portraitPath`
- `bannerPath`

Optional supporting fields:

- `portraitKey`
- `bannerKey`
- `classLabel`
- `baseClassLabel`
- `tone`

### Renderer

The dashboard renderer should:

- set the hero card background from `bannerPath`
- set the circular portrait from `portraitPath`
- keep text content rendering independent from image availability

### CSS

The card styling should:

- use layered positioning
- separate background art from text surface
- add a gradient mask for readability
- preserve current responsive behavior

## Testing Strategy

### Unit Tests

- visual model returns both portrait and banner mapping for known classes
- PoE2 variant classes map to the correct display label and asset family
- missing banner or portrait falls back safely

### Renderer Tests

- card uses empty state when no completed character data exists
- renderer sets banner and portrait targets correctly
- class/league/account/level render correctly in the hero layout

### Manual Validation

Check on:

- `PoE1`
- `PoE2`
- desktop width currently used in the dashboard

Validate:

- background art is crisp
- text remains readable
- badge and layout remain aligned
- portrait and banner belong to the same character family

## Out of Scope

Not part of this design:

- active-character detection improvements
- OCR-based selection reading
- live combat stats
- resource bars
- history/community integration

This is a pure visual redesign of the dashboard character card.
