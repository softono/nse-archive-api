# Ingestion & Operational Workflows

This document details the step-by-step lifecycle for all data ingestion pipelines, background jobs, and upstream proxy workflows in `nse-archive`.

---

## 1. Daily EOD Ingestion Workflow (19:00 IST)

Runs every trading day after market close (~18:30 IST) when NSE publishes daily bhavcopy files.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Scheduler (node-cron)
    participant Daily as daily.service.ts
    participant Fetcher as Fetch Layer (nse-client)
    participant Disk as Local Archive Storage
    participant Parser as Parse Layer
    participant DB as PostgreSQL (Drizzle)
    participant Log as Ingestion Log

    Cron->>Daily: Trigger ingestYesterday() @ 19:00 IST
    Daily->>Log: Check if date already ingested
    alt Already OK or No Trading Day
        Daily-->>Cron: Skip date
    else Unprocessed Date
        Daily->>Fetcher: fetchSecBhavdataFull(tradeDate)
        Fetcher->>Disk: Archive raw CSV to ./archive/nse_sec_bhavdata_full/
        Fetcher->>Parser: parseSecBhavdataCsv(raw)
        Parser-->>Daily: Parsed SecBhavdataRow[]
        Daily->>DB: Batch upsert into daily_candles
        Daily->>Fetcher: fetchIndexClose(tradeDate)
        Fetcher->>DB: Upsert index_daily_close
        Daily->>Fetcher: fetchFoBhavcopy(tradeDate)
        Fetcher->>DB: Upsert fo_daily_candles
        Daily->>Fetcher: fetchParticipantActivity(tradeDate)
        Fetcher->>DB: Upsert participant_activity
        Daily->>Fetcher: fetchDeals(tradeDate)
        Fetcher->>DB: Upsert deals
        Daily->>Log: Record status = 'ok' in ingestion_log
    end
```

---

## 2. Morning Surveillance (ASM/GSM) Workflow (07:00 IST)

Runs every trading morning before market open (09:00 IST) to synchronize the latest SEBI/NSE Enhanced Surveillance Measure (ESM), Additional Surveillance Measure (ASM), and Graded Surveillance Measure (GSM) stages into `securities.surveillance`.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Scheduler (node-cron)
    participant Surv as surveillance.service.ts
    participant JsonClient as nse-json-client.ts
    participant NSE as www.nseindia.com
    participant DB as PostgreSQL (securities)

    Cron->>Surv: Trigger ingestSurveillance() @ 07:00 IST
    Surv->>JsonClient: fetchSurveillanceLists()
    JsonClient->>NSE: Warmup session cookies
    JsonClient->>NSE: GET /api/live-analysis-asm & /api/live-analysis-gsm
    NSE-->>JsonClient: JSON surveillance lists
    Surv->>Surv: mergeSurveillanceLists() -> Map<symbol, stage>
    loop For each flagged symbol
        Surv->>DB: UPDATE securities SET surveillance = stage WHERE symbol = symbol
    end
    Surv->>DB: UPDATE securities SET surveillance = NULL WHERE symbol NOT IN (flagged_list)
    Surv-->>Cron: Log updated/cleared rows count
```

---

## 3. Securities Master & Sector Classification Workflow

Fetches the complete directory of listed equities from NSE Archive, correlates index constituent files, and classifies all securities so that `sector` and `industry` fields are **guaranteed non-null**.

```mermaid
flowchart TD
    START([Trigger: npm run seed:securities / POST /securities/sync]) --> FETCH_EQ[Fetch EQUITY_L.csv from NSE Archive]
    START --> FETCH_INDICES[Fetch Nifty Index Constituent CSVs<br/>Total Market, Nifty 500, Microcap 250, etc.]
    
    FETCH_EQ --> PARSER[Parse Securities Rows]
    FETCH_INDICES --> MAP_INDUSTRY[Extract Symbol -> Industry Mapping]
    
    MAP_INDUSTRY --> MATCH{Symbol in Index Map?}
    MATCH -->|Yes| APPLY_INDEX[Assign exact Industry<br/>Map Industry -> Macro Sector]
    MATCH -->|No| INFER[Run Keyword & Series Inference<br/>- Check ETF / BEES<br/>- Check Bank, Pharma, IT, Power, Steel...<br/>- Fallback: Industrials & General]
    
    APPLY_INDEX --> VALIDATE[Verify Sector & Industry are NOT NULL]
    INFER --> VALIDATE
    
    VALIDATE --> BATCH_INSERT[Batch Upsert into PostgreSQL 'securities'<br/>ON CONFLICT symbol, exchange, series DO UPDATE]
    BATCH_INSERT --> FINISH([Securities Ingestion Complete])
```

---

## 4. Historical Backfill Workflow

Iterates backward day-by-day from the current date to `BACKFILL_START_DATE` (e.g. `2024-01-01`), safely resuming and skipping previously completed dates.

```mermaid
flowchart TD
    START([Start Backfill]) --> READ_CHECKPOINTS[Query ingestion_log for Completed Dates]
    READ_CHECKPOINTS --> LOOP[Loop: currentDate = today down to BACKFILL_START_DATE]
    
    LOOP --> CHECK{currentDate in Checkpoints?}
    CHECK -->|Yes (ok or no_trading_day)| NEXT[currentDate = currentDate - 1 day]
    CHECK -->|No| ATTEMPT[Fetch & Ingest EOD Data for currentDate]
    
    ATTEMPT --> RESULT{HTTP Response}
    RESULT -->|200 OK| SAVE_DATA[Persist Candles & Mark Status = 'ok']
    RESULT -->|404 Not Found| MARK_HOLIDAY[Mark Status = 'no_trading_day']
    RESULT -->|Error / Timeout| LOG_FAIL[Mark Status = 'failed' with error message]
    
    SAVE_DATA --> NEXT
    MARK_HOLIDAY --> NEXT
    LOG_FAIL --> NEXT
    
    NEXT --> MORE{currentDate >= BACKFILL_START_DATE?}
    MORE -->|Yes| LOOP
    MORE -->|No| DONE([Backfill Finished])
```

---

## 5. Live Reference Data Upstream Proxying

Proxies live requests (holidays, announcements, corporate calendar, FII/DII flows) on demand:

```mermaid
sequenceDiagram
    autonumber
    participant Client as API Consumer (Trading / Web)
    participant API as Express Router
    participant Proxy as reference-data.ts
    participant CookieJar as Cookie Cache
    participant NSE as www.nseindia.com

    Client->>API: GET /corporate-calendar
    API->>Proxy: fetchCorporateCalendar()
    alt Cookie Expired or Missing
        Proxy->>NSE: GET / (Warmup session cookies)
        NSE-->>CookieJar: Set-Cookie headers
    end
    Proxy->>NSE: GET /api/corporate-calendar with Session Cookies
    alt Upstream Success
        NSE-->>Proxy: JSON Payload
        Proxy-->>API: Structured Response
        API-->>Client: 200 OK { events: [...] }
    else Upstream Block / Error
        NSE-->>Proxy: 403 / 500 / Timeout
        Proxy-->>API: Throw error
        API-->>Client: 502 Bad Gateway { error: upstream fetch failed }
    end
```
