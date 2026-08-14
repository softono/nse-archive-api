import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { parseIndexCloseCsv, type IndexCloseRow } from "@/parse/indices";

function ddmmyyyy(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}${m}${y}`;
}

/** Endpoint #4 — daily close for every NSE index. */
export async function fetchIndexClose(
  tradeDate: string,
): Promise<{ rows: IndexCloseRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(tradeDate)}.csv`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_index_close",
    tradeDate,
    ext: "csv",
    data: buf,
  });
  return { rows: parseIndexCloseCsv(buf.toString("utf-8")), archivedPath };
}
