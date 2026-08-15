# nse-archive

Autonomous, standalone historical-market data archive service for National Stock Exchange (NSE) daily Bhavcopy, index closes, derivatives, participant open interest, block/bulk deals, securities master catalog, corporate actions, and surveillance measures.

---

## Key Features

- **Automated EOD Ingestion**: Daily cron job (19:00 IST) pulls full-market equity OHLCV + delivery metrics, indices, F&O contracts, participant activity, and bulk/block deals.
- **Morning Surveillance Sync**: Daily cron job (07:00 IST) pulls SEBI/NSE ASM & GSM surveillance stages and synchronizes them with the securities master.
- **Securities Master & Sector Classification**: Ingests the full listed equities directory from NSE Archive and correlates index constituent files, guaranteeing **100% non-null `sector` and `industry` fields**.
- **Resumable Backfill Engine**: Checkpoint-driven historical backfill engine walks back to `BACKFILL_START_DATE` without duplicate network requests.
- **Dual-Tier Fetching**: Static archive downloader with strict rate-limiting (`nsearchives.nseindia.com`) + cookie-warmup JSON proxy (`www.nseindia.com`).
- **REST API with Redis Caching**: Sub-millisecond response caching for candles and securities; graceful fallback if Redis is disabled.

---

## Prerequisites

- **Node.js 20+** (developed against v24)
- **PostgreSQL 14+** (database `nse_archive` configured in `.env`)
- **Redis** (optional — used as an LRU response cache; service runs fine uncached)

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Run database migrations
npm run db:migrate

# 4. Seed securities master catalog
npm run seed:securities

# 5. Start development server
npm run dev
```

The API will listen on `http://localhost:4010` (or your configured `PORT`).

```bash
curl http://localhost:4010/health
# {"ok":true}
```

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4010` |
| `DATABASE_URL` | Postgres connection string | — *required* |
| `CACHE_DRIVER` | `redis` to enable caching, anything else to disable | `none` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ARCHIVE_DIR` | Directory where raw CSV/ZIP files are stored | `./archive` |
| `BACKFILL_START_DATE` | Earliest date the backfill walks back to | `2024-01-01` |
| `NSE_FETCH_TIMEOUT_MS` | Per-request timeout in milliseconds | `15000` |
| `NSE_RATE_LIMIT_MS` | Minimum interval between NSE requests in ms | `1000` |
| `API_KEY` | Optional static key for `x-api-key` header | unset (open) |

---

## Historical Backfilling

To load historical market data back to `BACKFILL_START_DATE` (e.g. `2024-01-01`):

```bash
npm run backfill
```

The backfill skips previously processed dates recorded in `ingestion_log` (`ok` or `no_trading_day`), making it fully safe to stop and resume at any point. You can also trigger it asynchronously via API:

```bash
curl -X POST http://localhost:4010/backfill/trigger
# {"status":"started"}
```

---

## REST API Overview

Add `x-api-key: <API_KEY>` header to requests if `API_KEY` is set.

### Market Data
- `GET /candles?symbol=RELIANCE&series=EQ&from=2024-01-01&to=2024-12-31` &mdash; Historical equity OHLCV & delivery %.
- `GET /candles/day?date=2026-08-14&series=EQ` &mdash; Full-market EOD snapshot for a single date.
- `GET /index-candles?index=Nifty%2050&from=2024-01-01&to=2024-12-31` &mdash; Benchmark & sectoral index candles.
- `GET /fo-candles?symbol=NIFTY&from=2024-01-01&to=2024-01-10` &mdash; Derivatives contract candles.
- `GET /participant-activity?from=2024-01-01&to=2024-01-31` &mdash; FII, DII, Pro, Client open interest & volume.
- `GET /deals?from=2024-01-01&to=2024-01-31` &mdash; Bulk and block deals.

### Master & Reference Data
- `GET /symbols` &mdash; Distinct traded `(symbol, series)` pairs with date coverage ranges.
- `GET /securities?search=TATA&sector=Financials` &mdash; Master catalog with guaranteed non-null sector & industry.
- `GET /holidays` &mdash; Trading & clearing holiday schedules.
- `GET /corporate-calendar` &mdash; Upcoming corporate board meetings & results.
- `GET /announcements` &mdash; Corporate announcements & filings.
- `GET /fii-dii-flows` &mdash; Daily institutional investment flows.
- `GET /insider-disclosures?kind=pit` &mdash; PIT & SAST insider disclosures.
- `GET /corporate-actions?symbol=INFY` &mdash; Historical and upcoming corporate actions.

### Ingestion & Sync Triggers
- `POST /backfill/trigger` &mdash; Start/resume historical backfill in background.
- `POST /securities/sync` &mdash; Trigger securities master catalog scraping & classification.
- `POST /surveillance/sync` &mdash; Trigger ASM/GSM surveillance stage synchronization.
- `GET /status` &mdash; Ingestion statistics, coverage dates, and recent failure logs.

*For complete query parameter tables and response payloads, see [docs/api.md](docs/api.md).*

---

## NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx watch --env-file=.env src/server.ts` | Start server in watch/development mode. |
| `npm run start` | `tsx --env-file=.env src/server.ts` | Start server for production/PM2. |
| `npm test` | `vitest run` | Run test suite. |
| `npm run typecheck` | `tsc --noEmit` | Check TypeScript compilation without emitting. |
| `npm run db:generate` | `drizzle-kit generate` | Generate SQL migration from `src/db/schema.ts`. |
| `npm run db:migrate` | `tsx --env-file=.env node_modules/drizzle-kit/bin.cjs migrate` | Apply migrations to PostgreSQL. |
| `npm run seed:securities` | `tsx --env-file=.env src/scripts/seed-securities.ts` | Scrape and populate `securities` table. |
| `npm run backfill` | `tsx --env-file=.env src/scripts/run-backfill.ts` | Run historical backfill CLI. |
| `npm run format` | `prettier --write src` | Format source code with Prettier. |

---

## Documentation

Comprehensive guides are located in [`docs/`](docs/):

- [API Reference](docs/api.md) &mdash; Complete endpoint reference with request/response schemas.
- [Architecture Overview](docs/architecture.md) &mdash; System design, data flow diagrams, and tech stack.
- [Queue & Concurrency Guide](docs/queue.md) &mdash; In-process scheduling, checkpointing, and rate-limiting.
- [Ingestion Workflows](docs/workflow.md) &mdash; Step-by-step lifecycles and sequence diagrams for all pipelines.
- [Database Schema](docs/database.md) &mdash; Complete ER diagrams, table definitions, and constraints.
- [Deployment & Operations](docs/deployment.md) &mdash; Setup, PM2 configuration, runbooks, and health checks.

---

## Project Structure

```
nse_archive/
├── docs/                 # Architectural, API, database, and operational docs
│   ├── api.md
│   ├── architecture.md
│   ├── database.md
│   ├── deployment.md
│   ├── queue.md
│   └── workflow.md
├── src/
│   ├── server.ts         # Process entrypoint — starts Express API and cron scheduler
│   ├── app.ts            # Express application setup, middlewares, and route binding
│   ├── config.ts         # Zod environment variable validation
│   ├── api/              # REST API controllers & route definitions
│   ├── db/               # Drizzle ORM schema, relations, and migrations
│   ├── fetch/            # Static archive HTTP client, JSON client, and fetchers
│   ├── parse/            # CSV/ZIP parsers (bhavcopy, indices, securities, surveillance)
│   ├── ingest/           # Daily ingestion, backfill, securities, surveillance & scheduler
│   ├── lib/              # Database connection, Redis caching, Logger, Raw archiving
│   └── scripts/          # CLI scripts (run-backfill.ts, seed-securities.ts)
├── tests/                # Vitest unit and integration test suite
├── archive/              # Canonical raw disk archive directory (./archive/{source}/{date})
├── drizzle.config.ts     # Drizzle Kit configuration
└── ecosystem.config.cjs  # PM2 cluster configuration
```

---

## Notes & Constraints

- **Daily Granularity Only**: NSE's public archive publishes daily EOD bhavcopy data only; no intraday or tick data is available.
- **Single Source of Truth**: Raw downloaded archive files are preserved on disk under `./archive/{source}/{date}.csv[.zip]` and not duplicated as blobs in PostgreSQL.
- **Strict Idempotency**: All ingestion queries utilize PostgreSQL `ON CONFLICT DO UPDATE` upserts for deduplication.
