import config from "@/config";
import {
  ingestDailyCandles,
  ingestDailyIndexClose,
  ingestDailyFoCandles,
  ingestDailyParticipantOi,
  ingestDailyParticipantVolume,
} from "@/ingest/daily.service";
import { getLoggedStatus } from "@/ingest/ingestion-log";
import { infoLog, warningLog } from "@/lib/logger";

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Each backfillable source is checked independently rather than using one source as a stand-in
// for "this day is done" — sources added after the original equity/index backfill already
// completed (F&O, participant OI/volume) need their own days processed even on days already
// marked 'ok' for nse_sec_bhavdata_full.
const BACKFILL_SOURCES: { source: string; ingest: (tradeDate: string) => Promise<unknown> }[] = [
  { source: "nse_sec_bhavdata_full", ingest: ingestDailyCandles },
  { source: "nse_index_close", ingest: ingestDailyIndexClose },
  { source: "nse_fo_udiff", ingest: ingestDailyFoCandles },
  { source: "nse_participant_oi", ingest: ingestDailyParticipantOi },
  { source: "nse_participant_vol", ingest: ingestDailyParticipantVolume },
];

/** Resumable, walks backward from today one calendar day at a time. For each day, each source in
 * BACKFILL_SOURCES is skipped individually if already 'ok'/'no_trading_day' in ingestion_log and
 * otherwise (re-)ingested — safe to stop and re-run at any point, and safe to re-run after adding
 * a new source without re-fetching days already done for the older sources. Per the PRD's scoped
 * decision, this only reaches BACKFILL_START_DATE (2024-onward — the UDiFF-era archive); the
 * pre-2024 legacy bhavcopy format is explicitly out of scope for v1. Bulk/block deals are
 * deliberately not in BACKFILL_SOURCES — NSE publishes no per-date archive for them. */
export async function runBackfill(startDate = config.BACKFILL_START_DATE): Promise<void> {
  let cursor = new Date().toISOString().slice(0, 10);
  let daysProcessed = 0;
  let daysSkipped = 0;

  while (cursor >= startDate) {
    const pending: (typeof BACKFILL_SOURCES)[number][] = [];
    for (const entry of BACKFILL_SOURCES) {
      const status = await getLoggedStatus(entry.source, cursor);
      if (status !== "ok" && status !== "no_trading_day") pending.push(entry);
    }

    if (pending.length === 0) {
      daysSkipped += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    try {
      for (const entry of pending) await entry.ingest(cursor);
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
