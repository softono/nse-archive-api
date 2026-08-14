import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { parseDealsCsv, type DealRow } from "@/parse/deals";

/** Bulk/block deals — rolling current-snapshot files, no date in the URL and no historical
 * per-date archive path exists on this host. Only usable for steady-state daily capture; each
 * row's own Date column (not "today") is used as its tradeDate since the file can span a short
 * trailing window. Not wired into backfill.service.ts — there's nothing to backfill from here. */
export async function fetchBulkDeals(
  archiveTradeDate: string,
): Promise<{ rows: DealRow[]; archivedPath: string }> {
  const url = "https://nsearchives.nseindia.com/content/equities/bulk.csv";
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_bulk_deals",
    tradeDate: archiveTradeDate,
    ext: "csv",
    data: buf,
  });
  return { rows: parseDealsCsv(buf.toString("utf-8")), archivedPath };
}

export async function fetchBlockDeals(
  archiveTradeDate: string,
): Promise<{ rows: DealRow[]; archivedPath: string }> {
  const url = "https://nsearchives.nseindia.com/content/equities/block.csv";
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_block_deals",
    tradeDate: archiveTradeDate,
    ext: "csv",
    data: buf,
  });
  return { rows: parseDealsCsv(buf.toString("utf-8")), archivedPath };
}
