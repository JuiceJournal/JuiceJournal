# Web Showroom Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public web entry with a desktop-first showroom landing page while keeping existing auth and dashboard routes in the repository but out of the public path.

**Architecture:** Keep routing simple. Convert `/` into a dedicated public landing page with cinematic hero + showcase sections, preserve `/login` and `/dashboard*` routes without linking to them from public chrome, and reduce shared auth-first navigation on the public surface. Reuse the existing font/theme stack and add only the styling needed for the new landing sections.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, existing i18n locale files.

---

### Task 1: Add showroom copy and route behavior

**Files:**
- Modify: `web/src/lib/locales/en.js`
- Modify: `web/src/lib/locales/tr.js`
- Modify: `web/src/app/page.js`

- [ ] Write failing/guard tests for public route expectations
- [ ] Replace `/` redirect with a real landing page entry
- [ ] Add showroom-specific copy keys for hero, value strip, showcase, worlds, and CTA
- [ ] Verify route no longer redirects to `/login`
- [ ] Commit

### Task 2: Build the public landing page sections

**Files:**
- Create: `web/src/components/ShowroomHero.js`
- Create: `web/src/components/ShowroomValueStrip.js`
- Create: `web/src/components/ShowroomDesktopShowcase.js`
- Create: `web/src/components/ShowroomWorlds.js`
- Create: `web/src/components/ShowroomFarmShowcase.js`
- Create: `web/src/components/ShowroomClosingCta.js`
- Modify: `web/src/app/page.js`

- [ ] Write failing component/source tests for public landing structure
- [ ] Implement the hybrid cinematic showcase sections
- [ ] Keep CTA focused on `Explore the Desktop App`
- [ ] Verify no public auth-first UI appears on `/`
- [ ] Commit

### Task 3: Split public chrome from auth/dashboard chrome

**Files:**
- Create: `web/src/components/PublicNavbar.js`
- Modify: `web/src/components/Navbar.js`
- Modify: `web/src/app/layout.js`

- [ ] Introduce a minimal public navigation for the landing page
- [ ] Keep dashboard navbar behavior for hidden/internal routes
- [ ] Avoid surfacing login/dashboard links on the landing page
- [ ] Verify layout selection works on `/` and existing routes
- [ ] Commit

### Task 4: Add landing-specific styling polish

**Files:**
- Modify: `web/src/app/globals.css`

- [ ] Add showroom-specific utility classes and section styling
- [ ] Keep motion restrained and maintain current palette direction
- [ ] Ensure responsive behavior on mobile and desktop
- [ ] Verify no existing dashboard styling regresses
- [ ] Commit

### Task 5: Verify and document

**Files:**
- Modify: `web/README.md`
- Modify: `README.md`

- [ ] Update docs to explain that web is now a public showroom and desktop-first companion surface
- [ ] Run `cd web && npm run build`
- [ ] Smoke the landing in dev mode
- [ ] Commit
