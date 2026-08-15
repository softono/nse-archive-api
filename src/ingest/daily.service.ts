import db from "@/lib/db";
import {
  dailyCandles,
  indexDailyClose,
  foDailyCandles,
  participantActivity,
  deals,
} from "@/db/schema";
import { fetchSecBhavdataFull } from "@/fetch/bhavcopy";
import { fetchIndexClose } from "@/fetch/indices";
import { fetchFoBhavcopy } from "@/fetch/fo-bhavcopy";
import {
  fetchParticipantOi,
  fetchParticipantVolume,
} from "@/fetch/participant-activity";
import { fetchBulkDeals, fetchBlockDeals } from "@/fetch/deals";
import { NseNotFoundError } from "@/fetch/nse-client";
import { logIngestion } from "@/ingest/ingestion-log";
import { infoLog, warningLog } from "@/lib/logger";

const SOURCE_CANDLES = "nse_sec_bhavdata_full";
const SOURCE_INDICES = "nse_index_close";
const SOURCE_FO = "nse_fo_udiff";
const SOURCE_PARTICIPANT_OI = "nse_participant_oi";
const SOURCE_PARTICIPANT_VOL = "nse_participant_vol";
const SOURCE_BULK_DEALS = "nse_bulk_deals";
const SOURCE_BLOCK_DEALS = "nse_block_deals";

/** Ingests one calendar day of full-market daily candles. A 404 means NSE didn't publish for this
 * date (weekend/holiday) — logged as 'no_trading_day', not an error, per the PRD's holiday-
 * handling policy (no second holiday calendar maintained here). */
export async function ingestDailyCandles(
  tradeDate: string,
): Promise<{ rowsWritten: number }> {
  try {
    const { rows } = await fetchSecBhavdataFull(tradeDate);
    let written = 0;
    for (const row of rows) {
      if (
        !row.symbol ||
        !Number.isFinite(row.open) ||
        !Number.isFinite(row.close)
      )
        continue;
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
          tradedValue:
            row.tradedValue != null ? String(row.tradedValue) : undefined,
          tradesCount: row.tradesCount,
          deliveryQty:
            row.deliveryQty != null ? Math.round(row.deliveryQty) : undefined,
          deliveryPct:
            row.deliveryPct != null ? String(row.deliveryPct) : undefined,
          source: SOURCE_CANDLES,
        })
        .onConflictDoUpdate({
          target: [
            dailyCandles.symbol,
            dailyCandles.series,
            dailyCandles.tradeDate,
          ],
          set: {
            open: String(row.open),
            high: String(row.high),
            low: String(row.low),
            close: String(row.close),
            prevClose:
              row.prevClose != null ? String(row.prevClose) : undefined,
            volume: Math.round(row.volume),
            tradedValue:
              row.tradedValue != null ? String(row.tradedValue) : undefined,
            tradesCount: row.tradesCount,
            deliveryQty:
              row.deliveryQty != null ? Math.round(row.deliveryQty) : undefined,
            deliveryPct:
              row.deliveryPct != null ? String(row.deliveryPct) : undefined,
            source: SOURCE_CANDLES,
          },
        });
      written += 1;
    }
    await logIngestion({
      source: SOURCE_CANDLES,
      tradeDate,
      status: "ok",
      rowsWritten: written,
    });
    infoLog("daily candles ingested", {
      tradeDate,
      rowsParsed: rows.length,
      written,
    });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({
        source: SOURCE_CANDLES,
        tradeDate,
        status: "no_trading_day",
      });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({
      source: SOURCE_CANDLES,
      tradeDate,
      status: "failed",
      error: message,
    });
    warningLog("daily candles ingest failed", { tradeDate, error: message });
    throw err;
  }
}

export async function ingestDailyIndexClose(
  tradeDate: string,
): Promise<{ rowsWritten: number }> {
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
          pointsChange:
            row.pointsChange != null ? String(row.pointsChange) : undefined,
          pctChange: row.pctChange != null ? String(row.pctChange) : undefined,
        })
        .onConflictDoUpdate({
          target: [indexDailyClose.indexName, indexDailyClose.tradeDate],
          set: {
            open: row.open != null ? String(row.open) : undefined,
            high: row.high != null ? String(row.high) : undefined,
            low: row.low != null ? String(row.low) : undefined,
            close: String(row.close),
            volume: row.volume != null ? Math.round(row.volume) : undefined,
            pointsChange:
              row.pointsChange != null ? String(row.pointsChange) : undefined,
            pctChange:
              row.pctChange != null ? String(row.pctChange) : undefined,
          },
        });
      written += 1;
    }
    await logIngestion({
      source: SOURCE_INDICES,
      tradeDate,
      status: "ok",
      rowsWritten: written,
    });
    infoLog("index close ingested", {
      tradeDate,
      rowsParsed: rows.length,
      written,
    });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({
        source: SOURCE_INDICES,
        tradeDate,
        status: "no_trading_day",
      });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({
      source: SOURCE_INDICES,
      tradeDate,
      status: "failed",
      error: message,
    });
    warningLog("index close ingest failed", { tradeDate, error: message });
    throw err;
  }
}

/** F&O daily bhavcopy — OHLC, open interest, change in OI, settlement price, and lot size all in
 * one file, per contract (future or option). */
export async function ingestDailyFoCandles(
  tradeDate: string,
): Promise<{ rowsWritten: number }> {
  try {
    const { rows } = await fetchFoBhavcopy(tradeDate);
    let written = 0;
    for (const row of rows) {
      if (
        !row.symbol ||
        !Number.isFinite(row.open) ||
        !Number.isFinite(row.close)
      )
        continue;
      const values = {
        symbol: row.symbol,
        instrumentType: row.instrumentType,
        tradeDate,
        expiryDate: row.expiryDate,
        // Postgres unique indexes treat NULL as distinct-from-NULL, so futures rows (which have no
        // strike/option type) need non-null sentinels here — otherwise re-ingesting the same day
        // would insert duplicate futures rows instead of updating, breaking idempotency.
        strikePrice: row.strikePrice != null ? String(row.strikePrice) : "0",
        optionType: row.optionType ?? "",
        open: String(row.open),
        high: String(row.high),
        low: String(row.low),
        close: String(row.close),
        settlePrice:
          row.settlePrice != null ? String(row.settlePrice) : undefined,
        openInterest:
          row.openInterest != null ? Math.round(row.openInterest) : undefined,
        changeInOi:
          row.changeInOi != null ? Math.round(row.changeInOi) : undefined,
        volume: Math.round(row.volume),
        tradedValue:
          row.tradedValue != null ? String(row.tradedValue) : undefined,
        tradesCount: row.tradesCount,
        lotSize: row.lotSize,
        source: SOURCE_FO,
      };
      await db
        .insert(foDailyCandles)
        .values(values)
        .onConflictDoUpdate({
          target: [
            foDailyCandles.symbol,
            foDailyCandles.instrumentType,
            foDailyCandles.expiryDate,
            foDailyCandles.strikePrice,
            foDailyCandles.optionType,
            foDailyCandles.tradeDate,
          ],
          set: values,
        });
      written += 1;
    }
    await logIngestion({
      source: SOURCE_FO,
      tradeDate,
      status: "ok",
      rowsWritten: written,
    });
    infoLog("fo candles ingested", {
      tradeDate,
      rowsParsed: rows.length,
      written,
    });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({
        source: SOURCE_FO,
        tradeDate,
        status: "no_trading_day",
      });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({
      source: SOURCE_FO,
      tradeDate,
      status: "failed",
      error: message,
    });
    warningLog("fo candles ingest failed", { tradeDate, error: message });
    throw err;
  }
}

async function ingestParticipantActivity(
  tradeDate: string,
  metric: "oi" | "volume",
): Promise<{ rowsWritten: number }> {
  const source =
    metric === "oi" ? SOURCE_PARTICIPANT_OI : SOURCE_PARTICIPANT_VOL;
  const fetcher = metric === "oi" ? fetchParticipantOi : fetchParticipantVolume;
  try {
    const { rows } = await fetcher(tradeDate);
    let written = 0;
    for (const row of rows) {
      if (!row.clientType) continue;
      const values = {
        tradeDate,
        metric,
        clientType: row.clientType,
        futureIndexLong: row.futureIndexLong,
        futureIndexShort: row.futureIndexShort,
        futureStockLong: row.futureStockLong,
        futureStockShort: row.futureStockShort,
        optionIndexCallLong: row.optionIndexCallLong,
        optionIndexPutLong: row.optionIndexPutLong,
        optionIndexCallShort: row.optionIndexCallShort,
        optionIndexPutShort: row.optionIndexPutShort,
        optionStockCallLong: row.optionStockCallLong,
        optionStockPutLong: row.optionStockPutLong,
        optionStockCallShort: row.optionStockCallShort,
        optionStockPutShort: row.optionStockPutShort,
        totalLong: row.totalLong,
        totalShort: row.totalShort,
        source,
      };
      await db
        .insert(participantActivity)
        .values(values)
        .onConflictDoUpdate({
          target: [
            participantActivity.tradeDate,
            participantActivity.metric,
            participantActivity.clientType,
          ],
          set: values,
        });
      written += 1;
    }
    await logIngestion({
      source,
      tradeDate,
      status: "ok",
      rowsWritten: written,
    });
    infoLog("participant activity ingested", {
      tradeDate,
      metric,
      rowsParsed: rows.length,
      written,
    });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({ source, tradeDate, status: "no_trading_day" });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({ source, tradeDate, status: "failed", error: message });
    warningLog("participant activity ingest failed", {
      tradeDate,
      metric,
      error: message,
    });
    throw err;
  }
}

export const ingestDailyParticipantOi = (tradeDate: string) =>
  ingestParticipantActivity(tradeDate, "oi");
export const ingestDailyParticipantVolume = (tradeDate: string) =>
  ingestParticipantActivity(tradeDate, "volume");

/** Bulk/block deals — rolling current-snapshot files with no per-date archive, so this only ever
 * ingests "whatever NSE is showing right now", tagged with each row's own Date column. Not
 * backfillable; only called from the steady-state daily job, never from backfill.service.ts. */
async function ingestDeals(
  dealType: "bulk" | "block",
): Promise<{ rowsWritten: number }> {
  const source = dealType === "bulk" ? SOURCE_BULK_DEALS : SOURCE_BLOCK_DEALS;
  const fetcher = dealType === "bulk" ? fetchBulkDeals : fetchBlockDeals;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await fetcher(today);
    let written = 0;
    for (const row of rows) {
      if (!row.symbol || !row.clientName || !Number.isFinite(row.quantity))
        continue;
      await db
        .insert(deals)
        .values({
          tradeDate: row.tradeDate,
          dealType,
          symbol: row.symbol,
          securityName: row.securityName,
          clientName: row.clientName,
          buySell: row.buySell,
          quantity: Math.round(row.quantity),
          price: String(row.price),
          remarks: row.remarks,
          source,
        })
        .onConflictDoNothing({
          target: [
            deals.tradeDate,
            deals.dealType,
            deals.symbol,
            deals.clientName,
            deals.buySell,
            deals.quantity,
            deals.price,
          ],
        });
      written += 1;
    }
    await logIngestion({
      source,
      tradeDate: today,
      status: "ok",
      rowsWritten: written,
    });
    infoLog("deals ingested", { dealType, rowsParsed: rows.length, written });
    return { rowsWritten: written };
  } catch (err) {
    if (err instanceof NseNotFoundError) {
      await logIngestion({
        source,
        tradeDate: today,
        status: "no_trading_day",
      });
      return { rowsWritten: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    await logIngestion({
      source,
      tradeDate: today,
      status: "failed",
      error: message,
    });
    warningLog("deals ingest failed", { dealType, error: message });
    throw err;
  }
}

export const ingestDailyBulkDeals = () => ingestDeals("bulk");
export const ingestDailyBlockDeals = () => ingestDeals("block");

/** Steady-state job: fetch yesterday's file. NSE typically publishes ~18:30 IST, so the scheduler
 * fires after that; "yesterday" from this process's perspective at run time is the trading day
 * being ingested. */
export async function ingestYesterday(): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const tradeDate = d.toISOString().slice(0, 10);
  await Promise.allSettled([
    ingestDailyCandles(tradeDate),
    ingestDailyIndexClose(tradeDate),
    ingestDailyFoCandles(tradeDate),
    ingestDailyParticipantOi(tradeDate),
    ingestDailyParticipantVolume(tradeDate),
    ingestDailyBulkDeals(),
    ingestDailyBlockDeals(),
  ]);
}
