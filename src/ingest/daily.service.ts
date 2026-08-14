import db from "@/lib/db";
import { dailyCandles, indexDailyClose } from "@/db/schema";
import { fetchSecBhavdataFull } from "@/fetch/bhavcopy";
import { fetchIndexClose } from "@/fetch/indices";
import { NseNotFoundError } from "@/fetch/nse-client";
import { logIngestion } from "@/ingest/ingestion-log";
import { infoLog, warningLog } from "@/lib/logger";

const SOURCE_CANDLES = "nse_sec_bhavdata_full";
const SOURCE_INDICES = "nse_index_close";

/** Ingests one calendar day of full-market daily candles. A 404 means NSE didn't publish for this
 * date (weekend/holiday) — logged as 'no_trading_day', not an error, per the PRD's holiday-
 * handling policy (no second holiday calendar maintained here). */
export async function ingestDailyCandles(tradeDate: string): Promise<{ rowsWritten: number }> {
  try {
    const { rows } = await fetchSecBhavdataFull(tradeDate);
    let written = 0;
    for (const row of rows) {
      if (!row.symbol || !Number.isFinite(row.open) || !Number.isFinite(row.close)) continue;
      await db
        .insert(dailyCandles)
        .values({
          symbol: row.symbol,
          series: row.series || "EQ",
          tradeDate,
          open: String(row.open),
          high: String(row.high),
          low: String(row.low),
          close: String(row.close),
          prevClose: row.prevClose != null ? String(row.prevClose) : undefined,
          volume: Math.round(row.volume),
          tradedValue: row.tradedValue != null ? String(row.tradedValue) : undefined,
          tradesCount: row.tradesCount,
          deliveryQty: row.deliveryQty != null ? Math.round(row.deliveryQty) : undefined,
          deliveryPct: row.deliveryPct != null ? String(row.deliveryPct) : undefined,
          source: SOURCE_CANDLES,
        })
        .onConflictDoUpdate({
          target: [dailyCandles.symbol, dailyCandles.series, dailyCandles.tradeDate],
          set: {
            open: String(row.open),
            high: String(row.high),
            low: String(row.low),
            close: String(row.close),
            prevClose: row.prevClose != null ? String(row.prevClose) : undefined,
            volume: Math.round(row.volume),
            tradedValue: row.tradedValue != null ? String(row.tradedValue) : undefined,
            tradesCount: row.tradesCount,
            deliveryQty: row.deliveryQty != null ? Math.round(row.deliveryQty) : undefined,
            deliveryPct: row.deliveryPct != null ? String(row.deliveryPct) : undefined,
            source: SOURCE_CANDLES,
          },
        });
      written += 1;
    }
    await logIngestion({ source: SOURCE_CANDLES, tradeDate, status: "ok", rowsWritten: written });
    infoLog("daily candles ingested", { tradeDate, rowsParsed: rows.length, written });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({ source: SOURCE_CANDLES, tradeDate, status: "no_trading_day" });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({ source: SOURCE_CANDLES, tradeDate, status: "failed", error: message });
    warningLog("daily candles ingest failed", { tradeDate, error: message });
    throw err;
  }
}

export async function ingestDailyIndexClose(tradeDate: string): Promise<{ rowsWritten: number }> {
  try {
    const { rows } = await fetchIndexClose(tradeDate);
    let written = 0;
    for (const row of rows) {
      if (!row.indexName || !Number.isFinite(row.close)) continue;
      await db
        .insert(indexDailyClose)
        .values({
          indexName: row.indexName,
          tradeDate,
          open: row.open != null ? String(row.open) : undefined,
          high: row.high != null ? String(row.high) : undefined,
          low: row.low != null ? String(row.low) : undefined,
          close: String(row.close),
          volume: row.volume != null ? Math.round(row.volume) : undefined,
        })
        .onConflictDoUpdate({
          target: [indexDailyClose.indexName, indexDailyClose.tradeDate],
          set: {
            open: row.open != null ? String(row.open) : undefined,
            high: row.high != null ? String(row.high) : undefined,
            low: row.low != null ? String(row.low) : undefined,
            close: String(row.close),
            volume: row.volume != null ? Math.round(row.volume) : undefined,
          },
        });
      written += 1;
    }
    await logIngestion({ source: SOURCE_INDICES, tradeDate, status: "ok", rowsWritten: written });
    infoLog("index close ingested", { tradeDate, rowsParsed: rows.length, written });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({ source: SOURCE_INDICES, tradeDate, status: "no_trading_day" });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({ source: SOURCE_INDICES, tradeDate, status: "failed", error: message });
    warningLog("index close ingest failed", { tradeDate, error: message });
    throw err;
  }
}

/** Steady-state job: fetch yesterday's file. NSE typically publishes ~18:30 IST, so the scheduler
 * fires after that; "yesterday" from this process's perspective at run time is the trading day
 * being ingested. */
export async function ingestYesterday(): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const tradeDate = d.toISOString().slice(0, 10);
  await Promise.allSettled([ingestDailyCandles(tradeDate), ingestDailyIndexClose(tradeDate)]);
}
