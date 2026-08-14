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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("index_daily_close_name_date_uq").on(t.indexName, t.tradeDate)],
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
