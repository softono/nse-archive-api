import config from "@/config";
import { ingestDailyCandles, ingestDailyIndexClose } from "@/ingest/daily.service";
import { getLoggedStatus } from "@/ingest/ingestion-log";
import { infoLog, warningLog } from "@/lib/logger";

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Resumable, walks backward from today one calendar day at a time, skipping any day already
 * 'ok' or 'no_trading_day' in ingestion_log — safe to stop and re-run at any point. Per the PRD's
 * scoped decision, this only reaches BACKFILL_START_DATE (2024-onward — the UDiFF-era archive);
 * the pre-2024 legacy bhavcopy format is explicitly out of scope for v1. */
export async function runBackfill(startDate = config.BACKFILL_START_DATE): Promise<void> {
  let cursor = new Date().toISOString().slice(0, 10);
  let daysProcessed = 0;
  let daysSkipped = 0;

  while (cursor >= startDate) {
    const alreadyDone = await getLoggedStatus("nse_sec_bhavdata_full", cursor);
    if (alreadyDone === "ok" || alreadyDone === "no_trading_day") {
      daysSkipped += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    try {
      await ingestDailyCandles(cursor);
      await ingestDailyIndexClose(cursor);
      daysProcessed += 1;
    } catch (err) {
      warningLog("backfill day failed, continuing to next day", {
        tradeDate: cursor,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    cursor = addDays(cursor, -1);
  }

  infoLog("backfill run complete", { startDate, daysProcessed, daysSkipped });
}
