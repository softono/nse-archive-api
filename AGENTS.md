# Agent Guidelines (`AGENTS.md`)

This document serves as the operational guide and architectural reference for AI coding assistants working in the `nse-archive` codebase.

---

## 1. Project Purpose & System Boundaries

`nse-archive` is a standalone, production-grade market data ingestion and archival microservice for the National Stock Exchange (NSE) of India.

- **Primary Responsibility**: Download, parse, archive, persist, and serve daily Bhavcopy files, index data, F&O derivatives, participant activities, bulk/block deals, securities master catalogs, and surveillance measures.
- **Boundaries**:
  - `nse-archive` is **read-only** for market consumers.
  - It does **not** depend on or import code from `admin_backend` or trading engines.
  - Consumers interface with `nse-archive` purely via its REST API (or by querying its dedicated PostgreSQL database).

---

## 2. Directory Structure & Layer Responsibilities

Follow strict layer separation when adding features or modifying code:

```
src/
├── api/          # Express route controllers. Validate query params, query DB/cache, return JSON.
├── db/           # Drizzle ORM schemas, migration metadata, and generated SQL migrations.
├── fetch/        # Outbound HTTP client logic. (NO database writes here).
│   ├── nse-client.ts       # Rate-limited static archive downloader (nsearchives.nseindia.com)
│   └── nse-json-client.ts  # Cookie-warmup JSON proxy client (www.nseindia.com)
├── ingest/       # Ingestion orchestration, batch upserts, and node-cron scheduler.
├── lib/          # Shared utilities: db singleton, Redis cache, Pino logger, raw disk archiver.
├── parse/        # Pure, side-effect-free CSV/ZIP parser functions. Must have unit tests in `tests/`.
└── scripts/      # Standalone CLI scripts runnable via TSX (e.g. seed-securities.ts, run-backfill.ts).
```

---

## 3. Strict Development Rules

### Rule 1: No Automatic Git Commits
- **NEVER** run `git commit` or commit files automatically.
- Stage changes using `git add` and instruct the user to review and commit.

### Rule 2: Database Idempotency & Upserts
- Every table MUST have a composite unique constraint for deduplication.
- All database writes during ingestion MUST use `.onConflictDoUpdate()` or explicit deduplication logic.
- Do NOT perform raw SQL inserts without conflict handling.

### Rule 3: Securities Sector & Industry Non-Null Guarantee
- The `sector` and `industry` columns in the `securities` table MUST **never be null or empty string** during scraping or ingestion.
- Fallback classifications (e.g. series-based, keyword-based, or `"Industrials & General"`) must be applied in `src/parse/securities.ts` if a security is not present in index constituent files.

### Rule 4: Timezone Consistency
- All cron jobs in `src/ingest/scheduler.ts` MUST explicitly specify `{ timezone: "Asia/Kolkata" }`.
- Date strings for trade dates MUST adhere to `YYYY-MM-DD` ISO format.

### Rule 5: Raw Archival to Disk
- Raw downloaded files from NSE must be archived to disk using `archiveRawFile()` under `archive/{source}/{date}.csv[.zip]` before database parsing. Do not store raw file binary blobs in PostgreSQL.

---

## 4. Key Developer Commands

Always run verification commands before completing a task:

```bash
# 1. Run Unit Tests (Vitest)
npm test

# 2. Check TypeScript Types (Zero errors expected)
npm run typecheck

# 3. Format Source Code with Prettier
npm run format

# 4. Generate & Run Database Migrations (after modifying src/db/schema.ts)
npm run db:generate
npm run db:migrate

# 5. Seed Securities Catalog
npm run seed:securities
```

---

## 5. Database Schema & Tables Quick Reference

All schemas are defined in [`src/db/schema.ts`](file:///c:/www/wwwroot/dev/nse_archive/src/db/schema.ts):

| Table Name | Primary Key | Unique Conflict Target | Description |
|---|---|---|---|
| `securities` | `id` (serial) | `[symbol, exchange, series]` | Equity master directory with non-null sector & industry. |
| `daily_candles` | `id` (bigserial) | `[symbol, series, tradeDate]` | Daily OHLCV and delivery percentages. |
| `index_daily_close` | `id` (bigserial) | `[indexName, tradeDate]` | Benchmark & sectoral index close values. |
| `fo_daily_candles` | `id` (bigserial) | `[symbol, instrumentType, expiryDate, strikePrice, optionType, tradeDate]` | F&O contract EOD candles. |
| `participant_activity`| `id` (bigserial) | `[tradeDate, metric, clientType]` | FII, DII, Client, Pro Open Interest & Volume breakdown. |
| `deals` | `id` (bigserial) | `[tradeDate, dealType, symbol, clientName, buySell, quantity, price]` | Bulk and block transaction records. |
| `ingestion_log` | `id` (bigserial) | `[source, tradeDate]` | Status ledger (`ok`, `no_trading_day`, `failed`) for job checkpoints. |

---

## 6. Adding a New Data Source / Ingestion Pipeline

When introducing a new NSE dataset:
1. **Schema**: Add table definition with proper unique constraints to `src/db/schema.ts`.
2. **Migration**: Run `npm run db:generate` and `npm run db:migrate`.
3. **Fetcher**: Create `src/fetch/<source>.ts` using `fetchNseArchive` or `fetchNseJsonWithCookies`.
4. **Parser**: Create `src/parse/<source>.ts` with pure parser functions.
5. **Unit Tests**: Add tests under `tests/parse/<source>.test.ts` with mock sample data.
6. **Ingestion Service**: Add ingestion function in `src/ingest/<source>.service.ts` logging to `ingestion_log`.
7. **Scheduler & Routes**: Register in `src/ingest/scheduler.ts` and expose query endpoints in `src/api/`.
8. **Documentation**: Update `docs/api.md`, `docs/database.md`, and `docs/workflow.md`.
