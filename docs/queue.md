# Scheduling, Concurrency & Queue Architecture

This document describes the job orchestration, concurrency control, and scheduling model used in `nse-archive`.

---

## Design Rationale: In-Process Orchestration vs External Queues

In production trading infrastructure, avoiding unnecessary operational dependencies is paramount. `nse-archive` adopts an **in-process scheduling and checkpoint-driven execution model** rather than deploying external distributed queues (e.g. BullMQ, RabbitMQ, Kafka) for several key reasons:

1. **Deterministic Sequential Workflows**: NSE archive files are published on fixed daily schedules (~18:30 IST for Bhavcopy, ~06:30 IST for ASM/GSM lists). Ingestion is daily batch work, not high-volume streaming events.
2. **Atomic DB-Level Checkpointing**: The `ingestion_log` table in PostgreSQL acts as a persistent, durable state store for all jobs. There is no risk of Redis queue and Postgres database state drifting out of sync.
3. **Outbound Rate-Limit Discipline**: External exchanges strictly throttle scraping. Running an in-process single pipeline guarantees adherence to `NSE_RATE_LIMIT_MS` (1 req/sec) without requiring distributed locks.
4. **Resilience & Resumability**: If a container or server restarts mid-backfill, re-triggering the process picks up precisely where it left off by querying `ingestion_log`.

---

## Scheduling Architecture

The service uses `node-cron` initialized inside the server process in [src/ingest/scheduler.ts](file:///c:/www/wwwroot/dev/nse_archive/src/ingest/scheduler.ts), pinned to the `Asia/Kolkata` timezone:

| Job | Cron Schedule | Time (IST) | Target Function | Description |
|---|---|---|---|---|
| **Daily EOD Ingest** | `0 19 * * 1-5` | 19:00 Mon-Fri | `ingestYesterday()` | Ingests Bhavcopy, Index Close, F&O, Participant Activity, Deals. |
| **Morning Surveillance Sync** | `0 7 * * 1-5` | 07:00 Mon-Fri | `ingestSurveillance()` | Fetches updated ASM/GSM lists, updates `securities.surveillance`. |

```typescript
// src/ingest/scheduler.ts
export function startScheduler(): void {
  cron.schedule(
    "0 19 * * 1-5",
    () => {
      infoLog("daily ingest cron fired");
      ingestYesterday().catch((err) => errorLog("daily ingest failed", { error: err.message }));
    },
    { timezone: "Asia/Kolkata" },
  );

  cron.schedule(
    "0 7 * * 1-5",
    () => {
      infoLog("surveillance ingest cron fired");
      ingestSurveillance().catch((err) => errorLog("surveillance ingest failed", { error: err.message }));
    },
    { timezone: "Asia/Kolkata" },
  );
}
```

---

## Checkpointing & Idempotency (`ingestion_log`)

Every ingestion unit writes a status record to `ingestion_log`:

```sql
CREATE TABLE "ingestion_log" (
  "id" serial PRIMARY KEY,
  "source" text NOT NULL,
  "trade_date" date NOT NULL,
  "status" text NOT NULL, -- 'ok' | 'no_trading_day' | 'failed'
  "rows_written" integer,
  "error" text,
  "fetched_at" timestamp DEFAULT now(),
  CONSTRAINT "ingestion_log_source_date_uq" UNIQUE("source", "trade_date")
);
```

### Execution States:
- **`ok`**: File downloaded, parsed, and successfully persisted into PostgreSQL.
- **`no_trading_day`**: Received HTTP 404 from NSE. Denotes a weekend or market holiday. Subsequent runs will skip this date immediately.
- **`failed`**: Upstream network error, timeout, or schema mismatch. Logged with error stack; can be retried automatically.

---

## Concurrency & Rate Limiting

Outbound HTTP requests to `nsearchives.nseindia.com` pass through a centralized rate-limiting queue mechanism in [src/fetch/nse-client.ts](file:///c:/www/wwwroot/dev/nse_archive/src/fetch/nse-client.ts):

```typescript
let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const wait = lastRequestAt + config.NSE_RATE_LIMIT_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}
```

- **Exponential Backoff**: On HTTP 429, 500, or network timeouts, requests retry up to 3 times with exponential backoff (`1s`, `2s`, `4s`).
- **Abort Signals**: Per-request timeouts (`NSE_FETCH_TIMEOUT_MS`, default 15000ms) prevent lingering hung sockets from exhausting connection pools.

---

## Asynchronous API Triggers

Long-running jobs (like multi-year backfills or complete securities master rebuilds) are triggered via asynchronous HTTP endpoints:
- `POST /backfill/trigger`
- `POST /securities/sync`
- `POST /surveillance/sync`

These routes respond with `202 Accepted` immediately, executing the task in the background event loop and logging progress via structured Pino logger output.

---

## Future Scaling: Transitioning to BullMQ / Worker Queues

If future requirements demand horizontal scaling across multiple worker nodes (e.g. archiving multiple international exchanges or distributing high-concurrency scraping), the architecture is prepared for a plug-in BullMQ adapter:

```
[API Producer] ---> [Redis BullMQ Queue] ---> [Worker 1 (Bhavcopy)]
                                        ---> [Worker 2 (F&O & Indices)]
                                        ---> [Worker 3 (Surveillance)]
```

Because database upserts are fully idempotent via `ON CONFLICT DO UPDATE`, jobs can be distributed across multiple worker processes without race conditions.
