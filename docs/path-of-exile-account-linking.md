# Path of Exile Account Linking

This milestone keeps the current local auth system and adds PoE account linking on top of it.

## Goals

- Keep username/password login as the primary sign-in path for now.
- Add desktop-first Path of Exile account linking.
- Support a mock mode until GGG issues a real OAuth client.
- Store PoE tokens on the backend only.

## Backend API

- `POST /api/auth/poe/connect/start`
- `POST /api/auth/poe/connect/complete`
- `GET /api/auth/poe/status`
- `DELETE /api/auth/poe/disconnect`

## Desktop flow

1. User signs in with the local app account.
2. User opens desktop settings and clicks `Connect Path of Exile`.
3. In mock mode, linking completes immediately with mock account data.
4. In live mode, desktop opens the browser, waits for the loopback callback, then completes the link via backend.

## Live mode requirements

- `POE_CLIENT_ID`
- `POE_REDIRECT_URI`
- `POE_TOKEN_ENCRYPTION_KEY`
- optional `POE_SCOPES`

## Notes

- Current first scope is `account:profile`.
- Web UI can consume the compact `poe` link status from `GET /api/auth/me` later.
