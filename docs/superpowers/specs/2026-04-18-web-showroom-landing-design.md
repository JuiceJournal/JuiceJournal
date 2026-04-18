# Web Showroom Landing Design

Date: 2026-04-18
Status: Approved for implementation
Scope: Public-facing web landing page for Juice Journal

## Goal

Turn the public web surface into a showroom-style landing page for the desktop application.

This page should:

- present Juice Journal as a desktop-first companion app
- communicate the product clearly without requiring sign-in
- reflect both Path of Exile 1 and Path of Exile 2
- feel atmospheric and game-adjacent rather than generic SaaS

## Product Boundaries

The web app is no longer the primary interactive product surface.

Public web should become:

- landing
- showcase
- brand/product explanation

The following stay in the repository but are not part of the public entry flow:

- `/login`
- `/dashboard`
- `/dashboard/sessions`
- `/dashboard/currency`
- `/dashboard/leaderboard`
- `/dashboard/strategies`

These routes should remain available internally, but the public site should not funnel users into them.

## Routing Decision

`/` becomes the new public landing page.

It should no longer redirect to `/login`.

`/login` may continue to exist, but it is not the primary public destination and should not be promoted from the landing page.

## Core Experience

The desired direction is a hybrid cinematic showcase:

- top of page: immersive, visual, atmospheric
- middle of page: clear, product-oriented explanation
- bottom of page: strong desktop-focused call to action

This avoids two failure modes:

- purely cinematic but unclear
- purely functional but visually generic

## Primary CTA

Primary CTA language should focus on exploration, not conversion forms.

Approved direction:

- `Explore the Desktop App`

Avoid for now:

- `Download Now`
- `Sign In`
- `Join Waitlist`

## Information Architecture

### 1. Header

Minimal, clean, public-facing header.

Content:

- Juice Journal wordmark / brand
- one primary CTA

Do not include:

- dashboard navigation
- login CTA
- auth-state-dependent UI

### 2. Hero

The hero must carry the emotional weight of the page.

Content direction:

- strong headline
- short subheading
- primary CTA
- secondary CTA for “how it works” / scroll intent

Approved headline direction:

- `Track every run. Measure every farm.`

Approved supporting line direction:

- `A Path of Exile companion for sessions, profit, and farming clarity.`

### 3. Value Strip

Immediately below the hero, a short value statement band.

Approved pillars:

- `Track Sessions`
- `Measure Profit`
- `Compare Farms`

This should feel like a compact signal strip, not generic feature cards.

### 4. Desktop Showcase

This section explains the product using a desktop-app-forward visual.

Content:

- one dominant app preview or mockup
- 3 short explanation points

Approved point direction:

- `Session timelines`
- `Profit snapshots`
- `PoE1 / PoE2 context`

### 5. Game Worlds Section

This section should show that the product understands both PoE1 and PoE2.

It should feel like two adjacent worlds or panes rather than a documentation section.

Expected signals:

- class / character identity
- maps / routes / farming scenes
- economy / currency / stash mood

This section is about game context, not exhaustive feature detail.

### 6. Farm Showcase Section

This section reframes farming as something measurable and comparable.

Message direction:

- `Turn your runs into patterns`
- `See which maps actually pay off`

This should feel analytical, but still game-native.

### 7. Closing CTA

Close the page with a second desktop-focused CTA.

Supporting note direction:

- `Desktop-first companion. Web used as a public showcase.`

## Visual Direction

Approved visual style:

- `dark fantasy utility`

It should feel adjacent to Path of Exile, but still belong to Juice Journal as its own product.

### Color

Core palette:

- coal black
- stone gray
- aged gold
- burnt amber
- small amounts of steel-blue / cold metallic tones

Avoid:

- clean SaaS whites
- bright synthetic gradients
- playful startup colors

### Typography

Use contrast:

- display serif for major headlines
- clean sans for body and utility text

The result should feel deliberate and premium, not default.

### Surface Language

Prefer:

- panel-like surfaces
- framed scenes
- thin metallic borders
- restrained glow

Avoid:

- generic rounded SaaS cards everywhere
- dashboard clutter on the public page

### Motion

Motion should be subtle and purposeful:

- hero reveal
- light parallax / drift
- restrained hover reactions

Avoid persistent animation noise.

## Content Tone

Tone should be:

- direct
- product-confident
- concise
- not over-marketed

This is not a hype page. It is a strong, stylish product showcase for a knowledgeable audience.

## Content Rules

The public landing should not imply capabilities we do not currently expose on the web.

Do:

- describe the product as a desktop companion
- show app visuals
- explain sessions / profit / comparison

Do not:

- imply public web sign-in is the main path
- imply browser-first usage
- overstate live production integrations that still depend on external approvals

## Technical Direction

Keep the existing route tree intact where possible.

Implementation should:

- replace the current `/` redirect page with a real landing page
- reduce or remove auth-first language from shared public chrome
- avoid linking public users into dashboard-first flows

The hidden/internal routes can remain untouched unless they interfere with the landing experience.

## Success Criteria

This design succeeds if:

1. `/` works as a standalone public showroom page
2. the page clearly communicates desktop-first product value
3. the page visually reflects both PoE1 and PoE2
4. the public web entry no longer feels like an auth shell
5. `/dashboard*` routes remain present but are no longer the public path

## Recommended Next Step

Write the implementation plan and then implement the landing page in an isolated worktree.
