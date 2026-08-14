import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { parseSecBhavdataCsv, type SecBhavdataRow } from "@/parse/sec-bhavdata-full";
import { parseUdiffZip, type UdiffRow } from "@/parse/bhavcopy-udiff";

function ddmmyyyy(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}${m}${y}`;
}

function yyyymmdd(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/** Endpoint #1 — full-market daily OHLCV + delivery %, all series. Primary daily source: no zip,
 * proven working (already in production use per this project's PRD). */
export async function fetchSecBhavdataFull(
  tradeDate: string,
): Promise<{ rows: SecBhavdataRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(tradeDate)}.csv`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_sec_bhavdata_full",
    tradeDate,
    ext: "csv",
    data: buf,
  });
  return { rows: parseSecBhavdataCsv(buf.toString("utf-8")), archivedPath };
}

/** Endpoint #2 — current-format ("UDiFF") full-market bhavcopy, zip-wrapped CSV. */
export async function fetchUdiffBhavcopy(
  tradeDate: string,
): Promise<{ rows: UdiffRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${yyyymmdd(tradeDate)}_F_0000.csv.zip`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_udiff",
    tradeDate,
    ext: "csv.zip",
    data: buf,
  });
  return { rows: parseUdiffZip(buf), archivedPath };
}
