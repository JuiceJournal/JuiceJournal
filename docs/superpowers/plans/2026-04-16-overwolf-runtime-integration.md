# Overwolf Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop app Overwolf-ready by adding the required package/runtime configuration, explicit runtime diagnostics, DEV/QA launch scripts, and submission-facing documentation while preserving plain Electron support.

**Architecture:** Keep the app dual-runtime. Plain Electron stays the default local path, while Overwolf Electron becomes an additive runtime selected by dedicated scripts. Main process code should detect and log runtime facts without changing the existing renderer contract or native bridge fallback chain.

**Tech Stack:** Electron, Overwolf Electron packages, Node test runner, existing main-process test harness, package.json build metadata.

---

### Task 1: Add Overwolf runtime package configuration
- Add Overwolf Electron dependencies and scripts to `desktop/package.json`
- Add `overwolf.packages` config for GEP
- Set stable author metadata needed for app UID continuity
- Add package-level tests covering scripts and config

### Task 2: Add explicit Overwolf runtime diagnostics in main
- Create a small runtime model/helper for:
  - `isOverwolfRuntime`
  - configured package list
  - DEV QA package feed detection
  - `app.overwolf.packages.gep` availability
- Log a structured startup diagnostic from main
- Add focused tests around runtime logging and fail-closed behavior

### Task 3: Add developer-facing run/build commands and docs
- Add DEV and DEV-QA launch scripts
- Add Overwolf build script based on Overwolf builder
- Document:
  - local DEV run
  - DEV package feed
  - Overwolf Developer client expectation
  - code-signing requirement before release
  - which user-provided values will be needed at submission time

### Task 4: Verify and stabilize
- Run focused tests for new runtime/config surface
- Run the full desktop suite
- Leave the branch clean and ready for the next step: app submission / console workflow
