# nse-archive

Standalone historical-candle archive service for NSE daily bhavcopy data — downloads NSE's free
public archive files on a schedule, parses them into a per-symbol daily candle store, and serves a
small REST API.

## Prerequisites

- Node.js 20+ (developed against v24)
- A Postgres database (a dedicated `nse_archive` database is assumed — see `.env`)
- Redis (optional — used only as a response cache for `/candles`; the service runs fine without
  it, just uncached)

## Get started

```bash
cd nse_archive
npm install
```

Copy the example env file and fill in real values (a working `.env` with `DATABASE_URL` and
`REDIS_URL` should already exist for this deployment — check before overwriting):

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4010` |
| `DATABASE_URL` | Postgres connection string | — required |
| `CACHE_DRIVER` | `redis` to enable caching, anything else to disable | `none` |
| `REDIS_URL` | Redis connection string | — required if `CACHE_DRIVER=redis` |
| `ARCHIVE_DIR` | Where raw downloaded CSV/ZIP files are kept | `./archive` |
| `BACKFILL_START_DATE` | Earliest date the backfill walks back to | `2024-01-01` |
| `NSE_FETCH_TIMEOUT_MS` | Per-request timeout | `15000` |
| `NSE_RATE_LIMIT_MS` | Minimum gap between NSE requests | `1000` |
| `API_KEY` | If set, requires `x-api-key` header on all routes except `/health` | unset (no auth) |

Create the tables:

```bash
npm run db:generate   # regenerate migration SQL from src/db/schema.ts (only needed after a schema change)
npm run db:migrate    # apply migrations to DATABASE_URL
```

Start the service:

```bash
npm run dev    # API + in-process cron scheduler, restarts on file change
npm run start  # same, without watch — use this in production/pm2
```

The API is now listening on `http://localhost:4010` (or your configured `PORT`). Verify it's up:

```bash
curl http://localhost:4010/health
# {"ok":true}
```

## Backfilling history

The API and scheduler alone only pick up new days going forward. To load historical data, run the
backfill — it walks backward from today to `BACKFILL_START_DATE`, one calendar day at a time,
skipping any day already recorded in `ingestion_log` (`ok` or `no_trading_day`), so it's safe to
stop and re-run at any point:

```bash
npm run backfill
```

Rate-limited to one NSE request per second by default (`NSE_RATE_LIMIT_MS`), so a full run from
`2024-01-01` to today takes on the order of 15–20 minutes. You can also trigger it remotely without
blocking the request:

```bash
curl -X POST http://localhost:4010/backfill/trigger
# {"status":"started"}
```

Check progress at any time via `GET /status` (see below).

## API

All routes are read-only except `/backfill/trigger`. Add `x-api-key: <API_KEY>` header if
`API_KEY` is set.

- `GET /candles?symbol=RELIANCE&series=EQ&from=2024-01-01&to=2024-12-31`
  → `{ symbol, series, candles: [{ date, open, high, low, close, volume, deliveryPct }] }`
- `GET /index-candles?index=Nifty%2050&from=2024-01-01&to=2024-12-31`
  → `{ index, candles: [{ date, open, high, low, close, volume }] }`
- `GET /symbols`
  → distinct `(symbol, series)` pairs archived, with min/max `trade_date` — check coverage before
    requesting a range
- `GET /status`
  → per-source ingestion counts and the most recent `failed` rows, for operator visibility
- `POST /backfill/trigger`
  → starts/resumes the backfill in the background, returns `202` immediately

Example, after backfilling or letting the scheduler run for a day:

```bash
curl "http://localhost:4010/candles?symbol=RELIANCE&series=EQ&from=2026-08-01&to=2026-08-13"
```

## Project layout

```
src/
  server.ts          Entrypoint — starts the API and the cron scheduler
  app.ts              Express app, routes, optional API-key middleware
  config.ts           Env var loading/validation (zod)
  fetch/               NSE HTTP client + per-endpoint fetchers (bhavcopy, indices)
  parse/               CSV/ZIP -> normalized row parsers
  db/                  Drizzle schema + generated migrations
  ingest/              daily.service (steady-state), backfill.service (resumable),
                       scheduler (node-cron), ingestion-log (checkpoint bookkeeping)
  api/                 Route controllers
  lib/                 db, redis cache, logger, raw-file archiving
  scripts/             One-off CLI entrypoints (e.g. run-backfill.ts)
```

## Notes

- No intraday/minute candles — NSE's public archive is daily-only (see `prd.md`).
- No code dependency on `admin_backend`. If you ever wire this in as a `MarketDataProvider`, that
  integration lives in `admin_backend`, not here.
- Raw downloaded files are kept on disk under `ARCHIVE_DIR/{source}/{date}.csv[.zip]` as the
  canonical source-of-truth artifact — not duplicated into Postgres.
