import db from "@/lib/db";
import { sql } from "drizzle-orm";
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

/** Upper bound on the catch-up walk — a longer outage than this is a backfill job
 * (scripts/run-backfill.ts), not something the nightly tick should silently grind through. */
const MAX_CATCHUP_DAYS = 10;

/** `YYYY-MM-DD` for a Date, evaluated in IST rather than UTC. The naive
 * `d.toISOString().slice(0,10)` this used to rely on is only correct for run times where the UTC
 * and IST calendar dates happen to agree — it silently returns the previous day for anything
 * fired between 00:00 and 05:30 IST. */
function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Every weekday from the day after the newest stored candle through yesterday (IST), oldest
 * first — i.e. the days this service still owes admin_backend.
 *
 * Why this exists: the 19:00 cron is in-process node-cron on a box with no RTC, so a reboot can
 * leave the clock jumping under an already-armed timer and the tick silently never fires (this
 * happened on 2026-08-20, losing 2026-08-19 and 2026-08-20 until they were ingested by hand).
 * A single-day `ingestYesterday` turns any such miss into a permanent hole, because nothing ever
 * revisits it. Walking forward from what's actually stored makes the next successful run —
 * scheduled OR at boot — repair the gap on its own.
 *
 * Holidays need no special handling: NSE simply doesn't publish a file, `fetchSecBhavdataFull`
 * 404s, and `ingestDailyCandles` records 'no_trading_day' without throwing.
 */
async function resolveMissingTradeDates(): Promise<string[]> {
  const [row] = await db
    .select({ maxDate: sql<string | null>`max(${dailyCandles.tradeDate})` })
    .from(dailyCandles);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWanted = istDate(yesterday);

  if (!row?.maxDate) return [lastWanted];

  const out: string[] = [];
  const cursor = new Date(`${row.maxDate}T00:00:00+05:30`);
  cursor.setDate(cursor.getDate() + 1);
  while (out.length < MAX_CATCHUP_DAYS) {
    const ymd = istDate(cursor);
    if (ymd > lastWanted) break;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) out.push(ymd);
    cursor.setDate(cursor.getDate() + 1);
  }
  // Already current — still re-run the most recent day so a re-fire refreshes rather than no-ops.
  return out.length > 0 ? out : [lastWanted];
}

/** One trading day's full set of daily artefacts. */
async function ingestOneTradeDate(tradeDate: string): Promise<void> {
  await Promise.allSettled([
    ingestDailyCandles(tradeDate),
    ingestDailyIndexClose(tradeDate),
    ingestDailyFoCandles(tradeDate),
    ingestDailyParticipantOi(tradeDate),
    ingestDailyParticipantVolume(tradeDate),
  ]);
}

/** Steady-state job: ingest every trading day still missing, not just yesterday's file. NSE
 * typically publishes ~18:30 IST, so the scheduler fires after that. See
 * `resolveMissingTradeDates` for why this catches up rather than assuming exactly one day. */
export async function ingestYesterday(): Promise<void> {
  const dates = await resolveMissingTradeDates();
  infoLog("daily ingest starting", { dates, count: dates.length });

  for (const tradeDate of dates) {
    await ingestOneTradeDate(tradeDate);
  }

  // Deals endpoints are "latest snapshot" style with no date parameter — run once per tick, not
  // once per caught-up day.
  await Promise.allSettled([ingestDailyBulkDeals(), ingestDailyBlockDeals()]);

  infoLog("daily ingest complete", { dates, count: dates.length });
}
