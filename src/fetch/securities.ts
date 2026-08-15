import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { infoLog, warningLog } from "@/lib/logger";

export const INDEX_FILES = [
  "ind_niftytotalmarket_list.csv",
  "ind_nifty500list.csv",
  "ind_niftysmallcap250list.csv",
  "ind_niftymicrocap250_list.csv",
  "ind_nifty50list.csv",
  "ind_niftynext50list.csv",
  "ind_nifty100list.csv",
  "ind_nifty200list.csv",
  "ind_niftymidcap150list.csv",
  "ind_niftymidcap100list.csv",
  "ind_niftysmallcap100list.csv",
  "ind_niftymidcap50list.csv",
  "ind_niftybanklist.csv",
  "ind_niftymidcapselect_list.csv",
  "ind_nifty500Multicap502525_list.csv",
];

export interface RawSecuritiesPayload {
  equityListCsv: string;
  indexCsvs: { filename: string; content: string }[];
  archivedPath?: string;
}

export async function fetchSecuritiesData(): Promise<RawSecuritiesPayload> {
  const today = new Date().toISOString().slice(0, 10);
  const equityUrl =
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

  infoLog("fetching equity master list from NSE archive", { url: equityUrl });
  const eqBuf = await fetchNseArchive(equityUrl);

  const archivedPath = await archiveRawFile({
    source: "nse_equity_list",
    tradeDate: today,
    ext: "csv",
    data: eqBuf,
  });

  const equityListCsv = eqBuf.toString("utf-8");

  const indexCsvs: { filename: string; content: string }[] = [];
  for (const filename of INDEX_FILES) {
    const indexUrl = `https://nsearchives.nseindia.com/content/indices/${filename}`;
    try {
      const buf = await fetchNseArchive(indexUrl, 2);
      indexCsvs.push({ filename, content: buf.toString("utf-8") });
    } catch (err) {
      warningLog("failed to fetch index constituent csv, skipping file", {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    equityListCsv,
    indexCsvs,
    archivedPath,
  };
}
