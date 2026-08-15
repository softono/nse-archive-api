# API Reference

The `nse-archive` service exposes a REST API for querying historical and daily market data, securities master lists, corporate actions, and live reference data, as well as operational triggers.

---

## Authentication & Headers

- If `API_KEY` is configured in the environment (`.env`), all endpoints (except `/health`) require the `x-api-key` header:
  ```http
  x-api-key: your-configured-api-key
  ```
- If `API_KEY` is empty/unset, the service runs in open mode (intended for private networks).
- Requests returning JSON respond with `Content-Type: application/json`.

---

## Base Endpoints

### 1. Health Check
Checks if the web server is alive. Bypasses API key validation.

- **Method**: `GET`
- **Path**: `/health`
- **Response**:
  ```json
  {
    "ok": true
  }
  ```

---

### 2. Service Status
Provides operational visibility into data ingestion, counts, and recent failures.

- **Method**: `GET`
- **Path**: `/status`
- **Response**:
  ```json
  {
    "sources": [
      {
        "source": "nse_sec_bhavdata_full",
        "okDays": 650,
        "noTradingDays": 250,
        "failedDays": 0,
        "firstDate": "2024-01-01",
        "lastDate": "2026-08-14"
      }
    ],
    "recentFailures": []
  }
  ```

---

## Market Data Endpoints

### 3. Historical Equity Candles
Fetches historical daily OHLCV and delivery data for a given equity symbol and date range.

- **Method**: `GET`
- **Path**: `/candles`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `symbol` | `string` | **Yes** | NSE stock symbol | `RELIANCE` |
  | `series` | `string` | No | Security series (default: `EQ`) | `EQ` |
  | `from` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `2024-01-01` |
  | `to` | `string` | **Yes** | End date (`YYYY-MM-DD`) | `2024-12-31` |

- **Response**:
  ```json
  {
    "symbol": "RELIANCE",
    "series": "EQ",
    "candles": [
      {
        "date": "2024-01-01",
        "open": 2580.00,
        "high": 2610.50,
        "low": 2575.20,
        "close": 2601.10,
        "volume": 4512030,
        "deliveryPct": 54.25
      }
    ]
  }
  ```

---

### 4. Full Market Day Snapshot
Retrieves the entire market EOD candles for all symbols on a specific trade date in a single request.

- **Method**: `GET`
- **Path**: `/candles/day`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `date` | `string` | **Yes** | Trade date (`YYYY-MM-DD`) | `2026-08-14` |
  | `series` | `string` | No | Security series (default: `EQ`) | `EQ` |

- **Response**:
  ```json
  {
    "date": "2026-08-14",
    "series": "EQ",
    "candles": [
      {
        "symbol": "20MICRONS",
        "open": 180.50,
        "high": 185.00,
        "low": 178.20,
        "close": 182.30,
        "volume": 24500,
        "tradedValue": 4466350,
        "tradesCount": 450,
        "deliveryQty": 12000,
        "deliveryPct": 48.98
      }
    ]
  }
  ```

---

### 5. Index Daily Candles
Fetches historical daily close data for benchmark and sectoral indices.

- **Method**: `GET`
- **Path**: `/index-candles`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `index` | `string` | **Yes** | Index name | `Nifty 50` |
  | `from` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `2024-01-01` |
  | `to` | `string` | **Yes** | End date (`YYYY-MM-DD`) | `2024-12-31` |

- **Response**:
  ```json
  {
    "index": "Nifty 50",
    "candles": [
      {
        "date": "2024-01-01",
        "open": 21727.75,
        "high": 21755.60,
        "low": 21678.00,
        "close": 21741.90,
        "volume": 156820000,
        "pointsChange": 10.50,
        "pctChange": 0.05
      }
    ]
  }
  ```

---

### 6. Futures & Options Daily Candles
Fetches historical F&O contract candles.

- **Method**: `GET`
- **Path**: `/fo-candles`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `symbol` | `string` | **Yes** | Underlying symbol | `NIFTY` |
  | `from` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `2024-01-01` |
  | `to` | `string` | **Yes** | End date (`YYYY-MM-DD`) | `2024-01-10` |
  | `instrumentType` | `string` | No | `FUTSTK`, `FUTIDX`, `OPTSTK`, `OPTIDX` | `FUTIDX` |
  | `expiry` | `string` | No | Expiry date (`YYYY-MM-DD`) | `2024-01-25` |
  | `strike` | `string` | No | Strike price | `21500.00` |
  | `optionType` | `string` | No | `CE` or `PE` | `CE` |

---

### 7. Participant Activity
Fetches aggregated participant open interest and volume breakdown (Client, DII, FII, Pro).

- **Method**: `GET`
- **Path**: `/participant-activity`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `from` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `2024-01-01` |
  | `to` | `string` | **Yes** | End date (`YYYY-MM-DD`) | `2024-01-31` |
  | `metric` | `string` | No | `oi` or `volume` | `oi` |

---

### 8. Bulk & Block Deals
Fetches bulk and block deals recorded on the exchange.

- **Method**: `GET`
- **Path**: `/deals`
- **Query Parameters**:
  | Param | Type | Required | Description | Example |
  |---|---|---|---|---|
  | `from` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `2024-01-01` |
  | `to` | `string` | **Yes** | End date (`YYYY-MM-DD`) | `2024-01-31` |
  | `symbol` | `string` | No | Filter by stock symbol | `TCS` |
  | `dealType`| `string` | No | `bulk` or `block` | `block` |

---

## Securities & Master Data

### 9. Distinct Traded Symbols
Returns list of distinct `(symbol, series)` pairs present in the candle archive with their active date range.

- **Method**: `GET`
- **Path**: `/symbols`

---

### 10. Securities Master List
Returns master information on securities, including ISIN, company name, non-null sector & industry classifications, lot size, and ASM/GSM surveillance stages.

- **Method**: `GET`
- **Path**: `/securities`
- **Query Parameters**:
  | Param | Type | Description | Example |
  |---|---|---|---|
  | `symbol` | `string` | Exact symbol filter | `INFY` |
  | `sector` | `string` | Sector search (substring match) | `Technology` |
  | `industry` | `string` | Industry search (substring match) | `Software` |
  | `series` | `string` | Security series filter | `EQ` |
  | `search` | `string` | Multi-field search (symbol, name, ISIN) | `TATA` |
  | `is_active`| `boolean` | Active flag filter | `true` |
  | `limit` | `number` | Page limit (default: 100, max: 2000) | `50` |
  | `offset` | `number` | Pagination offset | `0` |

- **Response**:
  ```json
  {
    "total": 2406,
    "limit": 1,
    "offset": 0,
    "securities": [
      {
        "id": 1745,
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "isin": "INE002A01018",
        "providerToken": null,
        "series": "EQ",
        "name": "Reliance Industries Limited",
        "sector": "Energy & Utilities",
        "industry": "Oil Gas & Consumable Fuels",
        "lotSize": 1,
        "priceBandPct": null,
        "surveillance": null,
        "listedOn": "1995-11-29",
        "delistedOn": null,
        "isActive": true,
        "isPrimary": true,
        "updatedAt": "2026-08-15T02:53:33.674Z",
        "isQuarantined": false,
        "quarantineReason": null,
        "quarantinedAt": null
      }
    ]
  }
  ```

---

## Reference Data & Upstream Proxies

Live reference data endpoints proxy authenticated sessions to `www.nseindia.com` JSON endpoints with automatic cookie warmup.

### 11. Trading Holidays
- **Method**: `GET`
- **Path**: `/holidays`
- **Response**: Trading and clearing holiday schedules for Equities and F&O segments.

### 12. Corporate Calendar
- **Method**: `GET`
- **Path**: `/corporate-calendar`
- **Response**: `{ "events": [ ... ] }` &mdash; Upcoming board meetings, AGM/EGMs, and financial results.

### 13. Corporate Announcements
- **Method**: `GET`
- **Path**: `/announcements`
- **Response**: `{ "announcements": [ ... ] }` &mdash; Live feed of corporate filings and press releases.

### 14. FII / DII Trade Flows
- **Method**: `GET`
- **Path**: `/fii-dii-flows`
- **Response**: `{ "flows": [ ... ] }` &mdash; Institutional investment buy/sell net turnover.

### 15. Insider Disclosures (PIT & SAST)
- **Method**: `GET`
- **Path**: `/insider-disclosures`
- **Query Parameters**:
  - `kind`: `pit` (Prohibition of Insider Trading) or `sast` (Substantial Acquisition of Shares and Takeovers).

### 16. Corporate Actions
- **Method**: `GET`
- **Path**: `/corporate-actions`
- **Query Parameters**:
  - `symbol`: Stock symbol (e.g. `TCS`, `INFY`).

---

## Ingestion Triggers

### 17. Trigger Historical Backfill
- **Method**: `POST`
- **Path**: `/backfill/trigger`
- **Response**: `202 Accepted` &mdash; `{"status": "started"}`

### 18. Trigger Securities Master Sync
- **Method**: `POST`
- **Path**: `/securities/sync`
- **Response**: `202 Accepted` &mdash; `{"status": "started"}`

### 19. Trigger Surveillance (ASM/GSM) Sync
- **Method**: `POST`
- **Path**: `/surveillance/sync`
- **Response**: `202 Accepted` &mdash; `{"status": "started"}`
