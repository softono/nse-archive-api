import { eq, and, isNotNull, notInArray } from "drizzle-orm";
import db from "@/lib/db";
import { securities } from "@/db/schema";
import { fetchSurveillanceLists } from "@/fetch/reference-data";
import { mergeSurveillanceLists } from "@/parse/surveillance";
import { infoLog } from "@/lib/logger";
import { logIngestion } from "@/ingest/ingestion-log";

/** Persists ASM/GSM surveillance status into this service's own `securities.surveillance`.
 * Ported from admin_backend's nse-scrape.provider.ts persistSurveillanceLists — moved here so
 * trading no longer scrapes NSE's bot-mitigation-fronted ASM/GSM endpoints directly; it now reads
 * current surveillance status back via GET /securities instead. Symbols present in the fetched
 * lists get their surveillance stage set; symbols NOT present are reset to null (a security can
 * exit surveillance — this must be able to clear the flag, not just set it). */
export async function ingestSurveillance(): Promise<{ rowsWritten: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const lists = await fetchSurveillanceLists();
  if (!lists) {
    await logIngestion({
      source: "nse_surveillance_lists",
      tradeDate: today,
      status: "failed",
      error: "fetch failed",
    });
    return { rowsWritten: 0 };
  }

  const bySymbol = mergeSurveillanceLists(lists);

  // Count rows actually matched in `securities`, not symbols attempted — the NSE lists include
  // names outside this NSE/EQ universe, so attempted != persisted and reporting the former
  // overstates coverage.
  let written = 0;
  for (const [symbol, stage] of bySymbol) {
    const res = await db
      .update(securities)
      .set({ surveillance: stage, updatedAt: new Date() })
      .where(
        and(eq(securities.exchange, "NSE"), eq(securities.symbol, symbol)),
      );
    written += (res as unknown as { count?: number }).count ?? 0;
  }

  // Clear surveillance for symbols no longer present in either list. Single statement scoped to
  // currently-flagged rows rather than a per-security UPDATE over the whole universe.
  const listed = [...bySymbol.keys()];
  const cleared = await db
    .update(securities)
    .set({ surveillance: null, updatedAt: new Date() })
    .where(
      and(
        eq(securities.exchange, "NSE"),
        isNotNull(securities.surveillance),
        listed.length > 0 ? notInArray(securities.symbol, listed) : undefined,
      ),
    );

  const rowsCleared = (cleared as unknown as { count?: number }).count ?? 0;
  infoLog("surveillance lists persisted", {
    symbolsListed: bySymbol.size,
    rowsWritten: written,
    rowsCleared,
  });
  await logIngestion({
    source: "nse_surveillance_lists",
    tradeDate: today,
    status: "ok",
    rowsWritten: written,
  });
  return { rowsWritten: written };
}
