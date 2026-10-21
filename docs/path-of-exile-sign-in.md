# Path of Exile sign-in

Juice Journal signs in with your Path of Exile account on your own PC. There is no Juice Journal account and no Juice Journal server involved.

## How it works

1. You click **Continue with Path of Exile** (or **Connect Path of Exile** in Settings to reconnect). The app opens `www.pathofexile.com` in your default browser.
2. You approve access on GGG's site. GGG then redirects the browser to a short-lived local address on your PC (`http://127.0.0.1:34127/oauth/poe/callback`), so port `34127` must be free.
3. The app exchanges the code for an access token. The flow uses PKCE (S256) and a random `state` value, and it gives up after 3 minutes.

Juice Journal is a *public* OAuth client: it has no client secret, which is how GGG requires desktop apps to work. GGG cannot verify that the app asking for access is the real Juice Journal, so only use a build you made yourself from this repository (or, once they exist, the [official releases](https://github.com/JuiceJournal/JuiceJournal/releases)).

## What it can access

The app asks for one scope: `account:characters`, which lists your characters and their leagues and levels. It cannot read your stash, trade, or change anything on your account.

## Where the token is kept

The access token is encrypted with Windows' data protection through Electron `safeStorage` and stored in `%APPDATA%\Juice Journal\config.json`. If encryption is unavailable on your system, the token is not saved; after a restart your profile still opens and you reconnect Path of Exile to refresh your characters.

GGG does not issue refresh tokens to this kind of client. When the token expires (about 10 hours), your profile and journal keep working; only the character list asks you to reconnect.

To remove access, sign out in the app and revoke Juice Journal's access in your pathofexile.com account settings.

## Using your own OAuth client

If you register your own GGG OAuth client, set these environment variables before starting the app. They are read at run time, not built into an installer.

| Variable | Default |
|---|---|
| `POE_CLIENT_ID` | `juicejournal` |
| `POE_REDIRECT_URI` | `http://127.0.0.1:34127/oauth/poe/callback` |

For a fork you distribute, change `DEFAULT_POE_CLIENT_ID` and `POE_CONTACT` in `desktop/src/modules/poeApiClient.js`, the redirect URI in `desktop/main.js` and `build.publish` in `desktop/package.json`.

The optional backend has its own `POE_*` settings; see `backend/.env.example`.
