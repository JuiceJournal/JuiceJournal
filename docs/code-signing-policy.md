# Code signing policy

**Status: not active yet.** Releases up to 1.0.12 carry no code signature, so Windows shows a SmartScreen warning for them. This page describes how releases are signed once SignPath Foundation accepts the project.

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only the Windows installer of the desktop app, `Juice-Journal-Setup-<version>.exe`, built from this repository. Its publisher then reads "SignPath Foundation".

- **Built on GitHub.** The [Release build](../.github/workflows/release-build.yml) workflow builds the installer from the checked-in source on a GitHub-hosted runner and hands it to SignPath. An installer built on someone's PC is never signed.
- **Approved by hand.** Each release is one signing request, and an approver confirms it before the certificate is used.
- **Other files.** The program files inside the installer come from Electron and the npm packages in `desktop/package-lock.json`, and are not signed by this project.

## Team roles

| Role | Who |
|---|---|
| Committers and reviewers | [Esquetta](https://github.com/Esquetta) |
| Approvers | [Esquetta](https://github.com/Esquetta) |

A change from anyone else comes as a pull request and is reviewed before it is merged. The `master` branch takes changes through pull requests only, with the CI checks passing.

## Privacy

The app has no telemetry and no ads. It talks only to the hosts listed under [Privacy and data](../README.md#privacy-and-data) in the README, each for the reason given there: Path of Exile's sign-in and character list, item prices and icons, and GitHub for updates. Your sessions and loot stay on your PC unless you turn on online features and name a server yourself.

## Two signatures

The code signature tells Windows who published the installer. The app does not rely on it for updates: every release also carries the project's own update signature, and the app installs an update only if that signature matches the key built into it. See [Releasing the desktop app](releasing.md).

## Removing the app

Windows Settings, Apps, Installed apps, Juice Journal, Uninstall. Your data stays in `%APPDATA%\Juice Journal` until you delete that folder, or use **Delete everything** in the app's Settings before you uninstall.

## Reporting a problem

If a signed file from this project misbehaves or you believe a signature was misused, open an issue at [github.com/JuiceJournal/JuiceJournal/issues](https://github.com/JuiceJournal/JuiceJournal/issues).
