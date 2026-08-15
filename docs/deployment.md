# Deployment & Operations Guide

This guide covers configuring, operating, and running `nse-archive` in development and production environments.

---

## Environment Variables

All configuration is loaded through environment variables validated at startup by Zod in [src/config.ts](file:///c:/www/wwwroot/dev/nse_archive/src/config.ts).

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | Number | `4010` | Port for the Express REST API. |
| `DATABASE_URL` | String | *Required* | PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname`). |
| `CACHE_DRIVER` | String | `none` | Set to `redis` to enable Redis caching; otherwise caching is disabled. |
| `REDIS_URL` | String | `redis://localhost:6379` | Redis connection URL (required if `CACHE_DRIVER=redis`). |
| `ARCHIVE_DIR` | String | `./archive` | Filesystem path where raw downloaded CSV and ZIP files are kept. |
| `BACKFILL_START_DATE` | String | `2024-01-01` | Earliest date to backfill historical market data. |
| `NSE_FETCH_TIMEOUT_MS`| Number | `15000` | HTTP request timeout in milliseconds for NSE archive fetches. |
| `NSE_RATE_LIMIT_MS` | Number | `1000` | Minimum throttle interval in ms between outbound requests. |
| `API_KEY` | String | *Unset* | Static API key required in `x-api-key` header (optional for private VPCs). |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Apply database migrations
npm run db:migrate

# 4. Seed securities master list
npm run seed:securities

# 5. Start development server (with tsx hot reload)
npm run dev
```

---

## Production Deployment

### Process Management with PM2

An [ecosystem.config.cjs](file:///c:/www/wwwroot/dev/nse_archive/ecosystem.config.cjs) is provided:

```javascript
module.exports = {
  apps: [
    {
      name: "nse-archive",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "--env-file=.env src/server.ts",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

#### Starting with PM2:
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

---

## Operational Runbook & CLI Commands

### 1. Seeding Securities Master Catalog
To ingest or refresh the listed equities directory and sector classifications:
```bash
npm run seed:securities
```

### 2. Running Historical Backfill
To run a historical backfill from `BACKFILL_START_DATE` to today:
```bash
npm run backfill
```

### 3. Triggering Ingestion via HTTP API
If running behind an automated CI/CD pipeline or orchestration tool:
```bash
# Trigger backfill
curl -X POST http://localhost:4010/backfill/trigger -H "x-api-key: $API_KEY"

# Trigger securities master sync
curl -X POST http://localhost:4010/securities/sync -H "x-api-key: $API_KEY"

# Trigger surveillance sync
curl -X POST http://localhost:4010/surveillance/sync -H "x-api-key: $API_KEY"
```

### 4. Running Unit Tests
```bash
npm test
```

### 5. Type Checking
```bash
npm run typecheck
```

---

## Monitoring & Health Checks

- **Health Probe**: `GET /health` &mdash; Returns `{"ok": true}` (HTTP 200). Use for load balancers and Kubernetes liveness probes.
- **Operational Status**: `GET /status` &mdash; Returns date coverage per data source, error logs, and checkpoint stats.
