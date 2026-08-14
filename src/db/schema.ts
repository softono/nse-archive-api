import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const dailyCandles = pgTable(
  "daily_candles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    symbol: text("symbol").notNull(),
    series: text("series").notNull().default("EQ"),
    tradeDate: date("trade_date").notNull(),
    open: numeric("open", { precision: 12, scale: 2 }).notNull(),
    high: numeric("high", { precision: 12, scale: 2 }).notNull(),
    low: numeric("low", { precision: 12, scale: 2 }).notNull(),
    close: numeric("close", { precision: 12, scale: 2 }).notNull(),
    prevClose: numeric("prev_close", { precision: 12, scale: 2 }),
    volume: bigint("volume", { mode: "number" }).notNull(),
    tradedValue: numeric("traded_value", { precision: 18, scale: 2 }),
    tradesCount: integer("trades_count"),
    deliveryQty: bigint("delivery_qty", { mode: "number" }),
    deliveryPct: numeric("delivery_pct", { precision: 5, scale: 2 }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("daily_candles_symbol_series_date_uq").on(t.symbol, t.series, t.tradeDate),
    index("daily_candles_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

export const indexDailyClose = pgTable(
  "index_daily_close",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    indexName: text("index_name").notNull(),
    tradeDate: date("trade_date").notNull(),
    open: numeric("open", { precision: 12, scale: 2 }),
    high: numeric("high", { precision: 12, scale: 2 }),
    low: numeric("low", { precision: 12, scale: 2 }),
    close: numeric("close", { precision: 12, scale: 2 }).notNull(),
    volume: bigint("volume", { mode: "number" }),
    pointsChange: numeric("points_change", { precision: 12, scale: 2 }),
    pctChange: numeric("pct_change", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("index_daily_close_name_date_uq").on(t.indexName, t.tradeDate)],
);

export const foDailyCandles = pgTable(
  "fo_daily_candles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    symbol: text("symbol").notNull(),
    instrumentType: text("instrument_type").notNull(), // raw FinInstrmTp: STF/STO/IDF/IDO etc.
    tradeDate: date("trade_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    strikePrice: numeric("strike_price", { precision: 12, scale: 2 }),
    optionType: text("option_type"), // CE | PE | null for futures
    open: numeric("open", { precision: 12, scale: 2 }).notNull(),
    high: numeric("high", { precision: 12, scale: 2 }).notNull(),
    low: numeric("low", { precision: 12, scale: 2 }).notNull(),
    close: numeric("close", { precision: 12, scale: 2 }).notNull(),
    settlePrice: numeric("settle_price", { precision: 12, scale: 2 }),
    openInterest: bigint("open_interest", { mode: "number" }),
    changeInOi: bigint("change_in_oi", { mode: "number" }),
    volume: bigint("volume", { mode: "number" }).notNull(),
    tradedValue: numeric("traded_value", { precision: 18, scale: 2 }),
    tradesCount: integer("trades_count"),
    lotSize: integer("lot_size"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // strikePrice/optionType are nullable columns, but the ingest layer always writes a non-null
    // sentinel ("0" / "") for futures rows rather than NULL — Postgres unique indexes treat NULL
    // as distinct-from-NULL, which would otherwise let re-ingestion insert duplicate futures rows
    // instead of updating them. See ingest/daily.service.ts's ingestDailyFoCandles.
    unique("fo_daily_candles_contract_date_uq").on(
      t.symbol,
      t.instrumentType,
      t.expiryDate,
      t.strikePrice,
      t.optionType,
      t.tradeDate,
    ),
    index("fo_daily_candles_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

export const participantActivity = pgTable(
  "participant_activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tradeDate: date("trade_date").notNull(),
    metric: text("metric").notNull(), // 'oi' | 'volume'
    clientType: text("client_type").notNull(), // Client | DII | FII | Pro | TOTAL
    futureIndexLong: bigint("future_index_long", { mode: "number" }),
    futureIndexShort: bigint("future_index_short", { mode: "number" }),
    futureStockLong: bigint("future_stock_long", { mode: "number" }),
    futureStockShort: bigint("future_stock_short", { mode: "number" }),
    optionIndexCallLong: bigint("option_index_call_long", { mode: "number" }),
    optionIndexPutLong: bigint("option_index_put_long", { mode: "number" }),
    optionIndexCallShort: bigint("option_index_call_short", { mode: "number" }),
    optionIndexPutShort: bigint("option_index_put_short", { mode: "number" }),
    optionStockCallLong: bigint("option_stock_call_long", { mode: "number" }),
    optionStockPutLong: bigint("option_stock_put_long", { mode: "number" }),
    optionStockCallShort: bigint("option_stock_call_short", { mode: "number" }),
    optionStockPutShort: bigint("option_stock_put_short", { mode: "number" }),
    totalLong: bigint("total_long", { mode: "number" }),
    totalShort: bigint("total_short", { mode: "number" }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("participant_activity_date_metric_client_uq").on(t.tradeDate, t.metric, t.clientType),
  ],
);

// Bulk/block deals are published by NSE as a rolling current-snapshot file (no per-date archive
// URL exists), so this table can only be populated going forward by the daily job — no backfill.
export const deals = pgTable(
  "deals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tradeDate: date("trade_date").notNull(),
    dealType: text("deal_type").notNull(), // 'bulk' | 'block'
    symbol: text("symbol").notNull(),
    securityName: text("security_name"),
    clientName: text("client_name").notNull(),
    buySell: text("buy_sell").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    remarks: text("remarks"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("deals_dedupe_uq").on(
      t.tradeDate,
      t.dealType,
      t.symbol,
      t.clientName,
      t.buySell,
      t.quantity,
      t.price,
    ),
    index("deals_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

// 'ok' | 'no_trading_day' | 'failed' — see ingest/*.service.ts for the only writers of this table.
export const ingestionLog = pgTable(
  "ingestion_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    tradeDate: date("trade_date").notNull(),
    status: text("status").notNull(),
    rowsWritten: integer("rows_written"),
    error: text("error"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [unique("ingestion_log_source_date_uq").on(t.source, t.tradeDate)],
);

export type DailyCandle = typeof dailyCandles.$inferSelect;
export type NewDailyCandle = typeof dailyCandles.$inferInsert;
export type IndexDailyClose = typeof indexDailyClose.$inferSelect;
export type NewIndexDailyClose = typeof indexDailyClose.$inferInsert;
export type IngestionLog = typeof ingestionLog.$inferSelect;
export type NewIngestionLog = typeof ingestionLog.$inferInsert;
export type FoDailyCandle = typeof foDailyCandles.$inferSelect;
export type NewFoDailyCandle = typeof foDailyCandles.$inferInsert;
export type ParticipantActivity = typeof participantActivity.$inferSelect;
export type NewParticipantActivity = typeof participantActivity.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
