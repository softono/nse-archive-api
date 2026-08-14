import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { parseFoBhavcopyZip, type FoBhavcopyRow } from "@/parse/fo-bhavcopy";

function yyyymmdd(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/** F&O daily bhavcopy (UDiFF format), zip-wrapped CSV — one row per contract (future or option),
 * carrying OHLC, open interest, change in OI, settlement price, and lot size all in one file.
 * Confirmed available from 2024-01-01 onward, same cutover as the equity UDiFF bhavcopy. */
export async function fetchFoBhavcopy(
  tradeDate: string,
): Promise<{ rows: FoBhavcopyRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${yyyymmdd(tradeDate)}_F_0000.csv.zip`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_fo_udiff",
    tradeDate,
    ext: "csv.zip",
    data: buf,
  });
  return { rows: parseFoBhavcopyZip(buf), archivedPath };
}
