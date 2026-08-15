# Architecture Overview

`nse-archive` is an autonomous, standalone market data ingestion and archiving service for National Stock Exchange (NSE) historical and daily Bhavcopy records, index data, derivatives, corporate reference information, and security master directories.

---

## High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph External Sources [External NSE Sources]
        NSE_ARCHIVE["nsearchives.nseindia.com<br/>(Static Archives: Bhavcopy, Indices, Equity_L)"]
        NSE_LIVE["www.nseindia.com<br/>(Live JSON: Corporate Events, Holidays, ASM/GSM)"]
    end

    subgraph nse_archive Service [nse-archive Service]
        SCHEDULER["In-Process Scheduler<br/>(node-cron @ Asia/Kolkata)"]
        CLIENT_ARCHIVE["Static NSE Client<br/>(Rate-limited fetchNseArchive)"]
        CLIENT_JSON["Cookie-Warmup JSON Client<br/>(nse-json-client)"]
        
        subgraph Pipelines [Data Pipelines]
            DAILY_INGEST["Daily EOD Ingest<br/>(19:00 IST)"]
            SURVEILLANCE_INGEST["Surveillance Sync<br/>(07:00 IST)"]
            SECURITIES_INGEST["Securities Master Sync"]
            BACKFILL["Resumable Backfill Engine"]
        end

        subgraph Parsing [Parsing & Normalization]
            PARSE_BHAV["Bhavcopy / UDiFF Parser"]
            PARSE_INDICES["Index Close Parser"]
            PARSE_SEC["Securities & Sector Classifier"]
            PARSE_SURV["ASM/GSM Parser"]
        end

        subgraph Storage & Cache [Storage & Cache Layer]
            PG[(PostgreSQL<br/>Drizzle ORM)]
            DISK[(Raw Disk Archive<br/>./archive/{source}/{date}.csv)]
            REDIS[(Redis Cache<br/>LRU / TTL)]
        end

        subgraph APILayer [Express REST API]
            ROUTES["API Router<br/>/candles, /securities, /status..."]
            AUTH["API Key Auth Guard"]
        end
    end

    subgraph Consumers [Consumers / Internal Services]
        TRADING["Trading Engine"]
        SCREENER["Stock Screener / Analytics"]
        OPERATOR["Operators / Admin Dashboard"]
    end

    %% Flow connections
    SCHEDULER -->|19:00 IST| DAILY_INGEST
    SCHEDULER -->|07:00 IST| SURVEILLANCE_INGEST
    
    DAILY_INGEST --> CLIENT_ARCHIVE
    BACKFILL --> CLIENT_ARCHIVE
    SECURITIES_INGEST --> CLIENT_ARCHIVE
    SURVEILLANCE_INGEST --> CLIENT_JSON

    CLIENT_ARCHIVE --> NSE_ARCHIVE
    CLIENT_JSON --> NSE_LIVE

    CLIENT_ARCHIVE --> DISK

    CLIENT_ARCHIVE --> PARSE_BHAV
    CLIENT_ARCHIVE --> PARSE_INDICES
    CLIENT_ARCHIVE --> PARSE_SEC
    CLIENT_JSON --> PARSE_SURV

    PARSE_BHAV --> PG
    PARSE_INDICES --> PG
    PARSE_SEC --> PG
    PARSE_SURV --> PG

    ROUTES --> AUTH
    AUTH --> REDIS
    AUTH --> PG
    AUTH --> CLIENT_JSON

    TRADING --> ROUTES
    SCREENER --> ROUTES
    OPERATOR --> ROUTES
```

---

## Tech Stack & Design Principles

| Layer | Technologies | Key Rationale |
|---|---|---|
| **Runtime** | Node.js (v20+ / v24), TypeScript 5.9, TSX | Modern ESM, strong static type-safety, rapid runtime execution. |
| **HTTP Web API** | Express 5.2 | Lightweight, battle-tested, unopinionated routing. |
| **ORM & Database** | PostgreSQL 14+, Drizzle ORM 0.45, `postgres` driver | Zero-overhead type-safe queries, migration generation, high throughput batch upserts. |
| **Caching** | Redis (ioredis) | Sub-millisecond response caching for candles and securities; graceful degradation if Redis is offline. |
| **Scheduling** | node-cron | Single-process, zero-dependency cron runner configured for `Asia/Kolkata` timezone. |
| **Parsing & Storage** | adm-zip, native streams | Fast ZIP extraction and memory-efficient CSV processing. |
| **Testing** | Vitest 4.1 | High-speed unit and integration testing. |

---

## Architectural Subsystems

### 1. HTTP Client & Fetching Layer (`src/fetch/`)
NSE data is split between two distinct infrastructure tiers:
1. **Static Archive Client (`src/fetch/nse-client.ts`)**:
   - Downloads static CSV and ZIP files from `nsearchives.nseindia.com`.
   - Requires no cookies or session state; uses standard `User-Agent`.
   - Governed by strict rate-limiting (`NSE_RATE_LIMIT_MS`, default 1000ms) with exponential backoff and request timeouts.
2. **Dynamic JSON Client (`src/fetch/nse-json-client.ts`)**:
   - Interacts with live `www.nseindia.com` JSON endpoints (corporate actions, announcements, ASM/GSM).
   - Manages automatic session cookie warmup and cookie renewal against bot-mitigation firewalls.

### 2. Raw Disk Archival (`src/lib/raw-archive.ts`)
To preserve single-source-of-truth data integrity, every downloaded file is written directly to disk:
```
archive/
  ├── nse_sec_bhavdata_full/2026-08-14.csv
  ├── nse_fo_udiff/2026-08-14.csv.zip
  ├── nse_index_close/2026-08-14.csv
  ├── nse_bulk_deals/2026-08-14.csv
  ├── nse_block_deals/2026-08-14.csv
  └── nse_equity_list/2026-08-15.csv
```
The raw files are kept intact on disk rather than storing raw blobs in PostgreSQL.

### 3. Parsing & Normalization Layer (`src/parse/`)
Converts exchange formats (CSV, fixed-width, ZIP archives) into typed, relational schemas:
- **`bhavcopy-udiff.ts`** & **`sec-bhavdata-full.ts`**: Handles OHLCV normalization, delivery volume calculation, and price corrections.
- **`securities.ts`**: Joins master equity lists with index constituents, resolving sector/industry taxonomy.
- **`surveillance.ts`**: Parses Long-Term and Short-Term ASM/GSM surveillance lists.

### 4. Storage & Ingestion Engine (`src/ingest/` & `src/db/`)
- **Deduplication Strategy**: All tables use composite unique indexes (e.g. `(symbol, series, trade_date)`). Ingestion utilizes PostgreSQL `ON CONFLICT DO UPDATE` upserts for complete idempotency.
- **Ingestion Log (`ingestion_log`)**: Tracks state per date/source (`ok`, `no_trading_day`, `failed`). This enables resuming backfills without duplicate network calls.

### 5. API & Caching Layer (`src/api/` & `src/lib/redis.ts`)
- High-frequency query endpoints (`/candles`, `/candles/day`, `/securities`) use a Redis cache layer with configurable TTLs.
- When `CACHE_DRIVER` is not `redis`, queries fall directly to indexed PostgreSQL queries transparently.
