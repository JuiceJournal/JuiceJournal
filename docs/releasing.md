# Releasing the desktop app

Windows sees Juice Journal as an unsigned app, so the app checks updates itself. Each release carries an Ed25519 signature, and the app installs an update only if that signature matches the public key built into it.

## Publish a release

Run from `desktop/`:

```bash
npx electron-builder --win --publish never
```

```bash
npm run sign:update -- <path to the private key>
```

Upload these two files from `desktop/dist/` to the GitHub release:

- `latest.yml`
- `Juice Journal Setup <version>.exe`, renamed with dashes to match `latest.yml`: `Juice-Journal-Setup-<version>.exe`

The app always downloads the full installer, so the `.blockmap` file is not needed.

Upload `latest.yml` only after signing. A release without a signature is announced, but the app refuses to install it.

## The signing key

The private key signs every update, so anyone who has it can ship code to every install. Keep it out of the repo and out of CI secrets, and keep an offline backup.

- **Lost key:** make a new one with `node scripts/generate-update-key.js <path>` and put the printed public key in `src/modules/updateSignature.js`. Existing installs reject releases signed with the new key, so their users must install the next version by hand once.
- **Leaked key:** do the same, and tell users to reinstall from the release page.
