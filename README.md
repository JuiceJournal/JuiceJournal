# Juice Journal

A stash-first farming journal for **Path of Exile 1** and **Path of Exile 2**.

Inspired by [TLI Tracker](https://github.com/Giboork/TLI-tracker-translated) from the Torchlight Infinite community, Juice Journal focuses on stash-based farming analysis for Path of Exile: snapshot stash state, measure output, calculate profit-per-hour, and optimize strategies with data-backed comparisons.

---

## Why Juice Journal?

Most PoE players farm maps without knowing their actual profit rate. You might *feel* like Crimson Temple is profitable, but is it really better than Cemetery when you factor in map investment costs? Juice Journal answers that question with real data.

- **Before:** "I think I made some currency today"
- **After:** "Cemetery averages 287c/hour with my current atlas setup, while Crimson Temple only does 215c/hour after scarab costs"

---

## How It Works

```
Start Session --> Select Map & League --> Snapshot Stash Before
                                                           |
                                                           v
                                            Farm Maps / Dump Loot To Stash
                                                           |
                                                           v
                                              Snapshot Stash After Session
                                                           |
                                                           v
                                           Automatic Item Diff + Price Lookup
                                                           |
                                                           v
                                 Session Summary: Profit, Cost, Net Revenue, Item Breakdown
                                                           |
                                                           v
                             Historical Analytics: Compare Maps, Strategies, Builds
```

### Primary Tracking Model: Stash Snapshots

Once our OAuth application is approved by GGG, the core tracking flow will use **stash tab snapshots**:

1. Snapshot your stash tabs before a farming session (via PoE API)
2. Run your maps and dump loot into stash as usual
3. Snapshot stash tabs after session
4. Diff between snapshots = items gained = automatic profit calculation

No manual loot entry and no screen reading in the main flow; just stash-based tracking from real account state.

### OCR Status

OCR remains available only as:
- an experimental fallback
- a temporary bridge when stash access is unavailable

It is not the main product direction.

---

## Features

### Desktop Application (Electron)

| Feature | Description |
|---------|-------------|
| **Session Tracking** | Start/stop farming sessions tied to specific maps, zones, or boss encounters |
| **Real-time Profit** | Live chaos-per-hour and divine-per-hour calculation during active sessions |
| **Stash-Based Loot Tracking** | Measure session gains by comparing stash snapshots before and after farming |
| **Client.txt Parsing** | Auto-detect map entries, zone changes, and area transitions from PoE game logs |
| **Map Cost Tracking** | Track map investment (scarabs, fragments, currency spent) vs. revenue earned |
| **Currency Browser** | Browse all currencies with icons, prices, and category filters |
| **Multi-League** | Track both PoE 1 and PoE 2 economies simultaneously with league selection |
| **Price Sync** | Comprehensive pricing from poe.ninja covering 20,000+ items across all categories |
| **PoE Account Linking** | OAuth 2.1 with PKCE for PoE account linking and stash access (pending GGG approval) |
| **i18n Support** | Full Turkish and English interface with instant language switching |
| **Settings Panel** | Tabbed settings with General, Path of Exile, Hotkeys, Notifications, API, and About sections |
| **Fallback OCR** | Optional experimental OCR path when stash-based tracking is unavailable |
| **System Tray** | Background operation with full tray menu (sessions, navigation, quick actions) |
| **Game Detection** | Auto-detect running PoE process |

### Web Dashboard (Next.js 14)

| Feature | Description |
|---------|-------------|
| **Personal Stats** | Detailed farming statistics with charts and trends |
| **Leaderboard** | Compare farming efficiency with other players |
| **Map Comparison** | Side-by-side map profitability analysis |
| **Real-time Updates** | WebSocket-powered live data |

### Backend API (Node.js + Express)

| Feature | Description |
|---------|-------------|
| **Authentication** | JWT-based auth with bcrypt password hashing |
| **RESTful API** | Full CRUD for sessions, loot entries, prices, and statistics |
| **WebSocket** | Real-time updates for connected clients |
| **Price Engine** | Automated poe.ninja sync with hourly cron and per-league cooldowns |
| **Input Validation** | express-validator on all endpoints with sanitization |
| **Security** | Helmet headers, CORS configuration, rate limiting, parameterized queries |
| **Production Hardening** | Environment-based config, no hardcoded secrets, configurable CORS origins |

---

## Price Data Coverage

All pricing is sourced from [poe.ninja](https://poe.ninja) — the community standard used by PoE Overlay, Awakened PoE Trade, Xiletrade, and virtually every PoE community tool.

### Path of Exile 1

| Category | API Source | Items |
|----------|-----------|-------|
| Currency | currencyoverview + exchange API | ~100+ |
| Fragments | currencyoverview + exchange API | Scarabs, Breachstones, Emblems, etc. |
| Essences | itemoverview | All essence tiers |
| Divination Cards | itemoverview | All div cards |
| Unique Weapons | itemoverview | All unique weapons |
| Unique Armours | itemoverview | All unique armour pieces |
| Unique Accessories | itemoverview | All unique accessories |
| Unique Jewels | itemoverview | All unique jewels |
| Unique Flasks | itemoverview | All unique flasks |
| Skill Gems | itemoverview | All skill gems with level/quality |
| Base Types | itemoverview | 20,000+ crafting bases |
| **Total** | | **13,000+ unique items** |

### Path of Exile 2

| Category | API Source | Items |
|----------|-----------|-------|
| Currency | exchange API | All PoE 2 currencies |
| Fragments | exchange API | All fragments |
| Runes | exchange API | All rune types |
| Essences | exchange API | All essences |
| Uncut Gems | exchange API | Uncut skill/support/spirit gems |
| Soul Cores | exchange API | All soul cores |
| Ultimatum | exchange API | Ultimatum inscribed items |
| Distilled Emotions | exchange API | All distilled emotions |

Prices sync automatically every hour with a 5-minute cooldown per `poeVersion:league` combination.

---

## Architecture

```
JuiceJournal/
│
├── backend/                        # Node.js + Express + PostgreSQL
│   ├── config/
│   │   ├── env.js                  # Centralized environment config with production assertions
│   │   ├── database.js             # Sequelize connection config
│   │   ├── migrate.js              # Database migration runner
│   │   └── seed.js                 # Admin user seeding (env-driven, no hardcoded creds)
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication middleware
│   ├── models/
│   │   ├── User.js                 # User model with PoE OAuth fields
│   │   ├── Session.js              # Farming session model
│   │   ├── LootEntry.js            # Individual loot drop records
│   │   ├── Price.js                # Currency/item price cache
│   │   └── index.js                # Sequelize model registry
│   ├── routes/
│   │   ├── auth.js                 # Register, login, profile, PoE OAuth flow
│   │   ├── sessions.js             # Session CRUD
│   │   ├── loot.js                 # Loot entry management
│   │   ├── prices.js               # Price queries + sync trigger
│   │   └── stats.js                # Personal stats + leaderboard
│   ├── services/
│   │   ├── poeNinjaService.js      # poe.ninja API integration (PoE1 + PoE2)
│   │   ├── poeAuthService.js       # GGG OAuth 2.1 PKCE + token encryption
│   │   ├── cronService.js          # Scheduled price sync
│   │   └── logger.js               # Structured logging
│   ├── docker-compose.yml          # PostgreSQL 16 + pgAdmin
│   ├── .env.example                # All env vars documented with CHANGE_ME markers
│   └── server.js                   # Express app + WebSocket server
│
├── desktop/                        # Electron 33 desktop application
│   ├── main.js                     # Main process: IPC, tray, hotkeys, OAuth local server
│   ├── preload.js                  # Context bridge (secure IPC exposure)
│   └── src/
│       ├── index.html              # Full UI: login, dashboard, sessions, currency, settings
│       ├── app.js                  # Renderer: state management, navigation, i18n, error handling
│       ├── styles.css              # PoE-themed dark UI with gold accents
│       └── modules/
│           ├── translations.js     # TR/EN translation strings + t() helper
│           ├── apiClient.js        # Backend API client with auth
│           ├── priceService.js     # Price lookup and caching
│           ├── logParser.js        # Client.txt log file parser
│           ├── gameDetector.js     # PoE process detection
│           ├── poeApiClient.js     # PoE OAuth client-side flow
│           ├── stashAnalyzer.js    # Stash tab analysis
│           └── currencyRegistry.js # Currency metadata and icon registry
│
├── web/                            # Next.js 14 web dashboard
│   ├── src/                        # App router pages and components
│   ├── tailwind.config.js          # Tailwind CSS configuration
│   └── next.config.js              # Next.js configuration
│
└── docs/                           # Design documents and roadmaps
```

---

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **Docker** and **Docker Compose** (for PostgreSQL)
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/PoeFarmTracker.git
cd JuiceJournal
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Open `.env` and set the required values:

```env
# Required — choose strong values
DB_PASSWORD=your_database_password
JWT_SECRET=your_jwt_secret_min_32_chars
PGADMIN_PASSWORD=your_pgadmin_password

# Optional — defaults work for development
DEFAULT_LEAGUE=Mirage
PORT=3001
```

Generate a secure JWT secret:
```bash
openssl rand -base64 48
```

### 3. Start the Database

```bash
cd backend
docker-compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432
- **pgAdmin** on port 5050

### 4. Start the Backend

```bash
cd backend
npm install
npm run db:seed    # Creates admin user (password auto-generated if not set in env)
npm run dev        # Starts on http://localhost:3001
```

### 5. Start the Desktop App

```bash
cd desktop
npm install
npm run dev
```

### 6. Start the Web Dashboard (Optional)

```bash
cd web
npm install
npm run dev        # Starts on http://localhost:3000
```

---

## Services

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| Backend API | 3001 | http://localhost:3001 | REST API + WebSocket |
| PostgreSQL | 5432 | — | Primary database |
| pgAdmin | 5050 | http://localhost:5050 | Database management UI |
| Web Dashboard | 3000 | http://localhost:3000 | Next.js frontend (optional) |

---

## API Reference

### Authentication

```
POST   /api/auth/register          Create a new account
POST   /api/auth/login             Login (returns JWT token)
GET    /api/auth/me                Get current user profile
PUT    /api/auth/profile           Update profile
```

### PoE Account Linking

```
GET    /api/auth/poe/status        Check PoE link status
POST   /api/auth/poe/start         Start OAuth flow (returns auth URL)
POST   /api/auth/poe/callback      Complete OAuth flow (exchange code)
DELETE /api/auth/poe/link          Disconnect PoE account
```

### Sessions

```
GET    /api/sessions               List farming sessions (paginated)
POST   /api/sessions/start         Start a new farming session
PUT    /api/sessions/:id/end       End a farming session
PUT    /api/sessions/:id           Update session details
GET    /api/sessions/:id           Get session with loot entries
```

### Loot

```
POST   /api/loot                   Add a loot entry to active session
POST   /api/loot/bulk              Add multiple loot entries at once
GET    /api/loot/:sessionId        Get all loot for a session
GET    /api/loot/recent            Get recent loot across sessions
```

### Prices

```
GET    /api/prices/current         Query current prices (filterable by type, league, poeVersion)
POST   /api/prices/sync            Trigger manual price sync from poe.ninja
GET    /api/prices/leagues         Get list of active leagues
GET    /api/prices/categories      Get available item categories
```

### Statistics

```
GET    /api/stats/personal         Personal farming statistics
GET    /api/stats/summary          Quick stats summary for dashboard
GET    /api/stats/leaderboard/:league/:period   Leaderboard by league and time period
```

All endpoints (except register/login) require a valid JWT token in the `Authorization: Bearer <token>` header.

---

## PoE Account Linking (OAuth 2.1)

The application includes a complete OAuth 2.1 integration for linking Path of Exile accounts via GGG's official API.

### Implementation Details

| Aspect | Detail |
|--------|--------|
| **Flow** | Authorization Code with PKCE (S256) |
| **Client Type** | Public Client (desktop application) |
| **Code Verifier** | 32-byte cryptographically random, base64url-encoded |
| **Token Storage** | AES-256-GCM encrypted at rest with per-token random IV |
| **Redirect URI** | `http://127.0.0.1:34127/oauth/poe/callback` (loopback) |
| **User-Agent** | `OAuth <client_id>/0.1.0 (contact: <email>) PoEFarmTracker` |
| **Token Lifetime** | Access: 10 hours, Refresh: 7 days (public client limits) |

### Requested Scopes

| Scope | Purpose |
|-------|---------|
| `account:profile` | Display linked PoE account name |
| `account:stashes` | Stash tab snapshots for automatic loot detection |
| `account:characters` | Character context (class, level) for build-specific analytics |
| `account:leagues` | Auto-detect active leagues for correct pricing |

### Current Status

OAuth app registration is pending GGG approval. The application works fully without OAuth — account linking is an optional enhancement. In development, mock mode simulates the OAuth flow for testing.

To register your own OAuth app, email `oauth@grindinggear.com` per [GGG's developer documentation](https://www.pathofexile.com/developer/docs/authorization).

---

## Environment Variables

All configuration is managed via environment variables. See [`backend/.env.example`](backend/.env.example) for the complete reference.

### Required

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret (minimum 32 characters in production) |
| `PGADMIN_PASSWORD` | pgAdmin web UI password |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend API port |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `poefarm` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_AUTO_SYNC` | `true` (dev) | Auto-sync Sequelize models (must be `false` in production) |
| `DEFAULT_LEAGUE` | `Mirage` | Default league for price sync |
| `PRICE_SYNC_INTERVAL` | `1` | Price sync interval in hours |
| `PRICE_SYNC_MIN_INTERVAL_MS` | `300000` | Minimum interval between manual syncs (5 min) |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiry |
| `CORS_ORIGINS` | — | Comma-separated allowed CORS origins |
| `POE_CLIENT_ID` | — | GGG OAuth client ID (enables real account linking) |
| `POE_REDIRECT_URI` | — | OAuth redirect URI |
| `POE_TOKEN_ENCRYPTION_KEY` | — | Encryption key for PoE tokens at rest |
| `POE_SCOPES` | `account:profile` | OAuth scopes to request |
| `POE_CONTACT` | — | Contact email for GGG User-Agent header |

### Production Requirements

In production (`NODE_ENV=production`), the backend enforces:
- `JWT_SECRET` must be at least 32 characters and not a known default
- `DB_AUTO_SYNC` must be `false` (use migrations instead)
- `POE_TOKEN_ENCRYPTION_KEY` must be at least 16 characters (if OAuth is configured)
- No mock mode — real OAuth credentials required

---

## NPM Scripts

### Backend

```bash
npm run dev              # Start with hot reload (nodemon)
npm start                # Production start
npm run db:seed          # Create admin user
npm run db:migrate       # Run database migrations
npm run docker:up        # Start PostgreSQL + pgAdmin
npm run docker:down      # Stop Docker services
npm run docker:reset     # Reset database (WARNING: destroys all data)
npm run docker:psql      # Open PostgreSQL interactive shell
npm run docker:logs      # Tail Docker service logs
```

### Desktop

```bash
npm run dev              # Start Electron in development mode
npm start                # Start Electron
npm run build            # Build distributable (electron-builder)
npm run build:win        # Build Windows installer (NSIS)
```

### Web

```bash
npm run dev              # Start Next.js development server
npm run build            # Production build
npm start                # Start production server
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop | Electron | 33 |
| Backend | Node.js + Express | 20 / 4.x |
| Database | PostgreSQL | 16 |
| ORM | Sequelize | 6.x |
| Web Frontend | Next.js + Tailwind CSS | 14 |
| Authentication | JWT + bcrypt | — |
| OAuth | OAuth 2.1 + PKCE (S256) | — |
| Token Encryption | AES-256-GCM | — |
| Pricing | poe.ninja API | — |
| Process Manager | nodemon (dev) | — |
| Containerization | Docker Compose | — |
| Security | Helmet, express-rate-limit, express-validator | — |

---

## Troubleshooting

### Docker services won't start

```bash
docker-compose ps                              # Check container status
docker-compose logs postgres                   # Check PostgreSQL logs
docker-compose down && docker-compose up -d    # Restart everything
```

### Port already in use

```bash
# Windows
netstat -ano | findstr :5432
netstat -ano | findstr :3001

# Linux / macOS
lsof -i :5432
lsof -i :3001
```

### Database reset

```bash
cd backend
npm run docker:reset    # WARNING: this destroys ALL data
npm run db:seed         # Re-create admin user after reset
```

### Price sync returns 0 items

- Check your internet connection — poe.ninja must be reachable
- Verify `DEFAULT_LEAGUE` matches an active league name
- Check backend logs for API response errors
- Manual sync has a 5-minute cooldown per league — wait and retry

### Desktop app can't connect to backend

- Ensure backend is running on port 3001
- Check Settings > API tab — API URL should be `http://localhost:3001`
- Use the "Test Connection" button in settings to verify

---

## Contributing

We are a two-person team building this as a passion project for the PoE community. Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

MIT
