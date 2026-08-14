import AdmZip from "adm-zip";

export interface UdiffRow {
  symbol: string;
  series: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose?: number;
  volume: number;
  tradedValue?: number;
  tradesCount?: number;
}

// BhavCopy_NSE_CM_0_0_0_{YYYYMMDD}_F_0000.csv.zip — one CSV inside the zip. Columns per NSE's
// current ("UDiFF") format: TradDt,BizDt,Sgmt,Src,FinInstrmTp,ISIN,TckrSymb,SctySrs,...,OpnPric,
// HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,...
export function parseUdiffZip(zipBuffer: Buffer): UdiffRow[] {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error("UDiFF zip contained no CSV entry");
  return parseUdiffCsv(entry.getData().toString("utf-8"));
}

export function parseUdiffCsv(csvText: string): UdiffRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iSymbol = idx("TCKRSYMB");
  const iSeries = idx("SCTYSRS");
  const iOpen = idx("OPNPRIC");
  const iHigh = idx("HGHPRIC");
  const iLow = idx("LWPRIC");
  const iClose = idx("CLSPRIC");
  const iPrevClose = idx("PRVSCLSGPRIC");
  const iVolume = idx("TTLTRADGVOL");
  const iValue = idx("TTLTRFVAL");
  const iTrades = idx("TTLNBOFTXSEXCTD");

  if (iSymbol < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
    throw new Error("UDiFF CSV missing expected OHLC columns — header may have changed");
  }

  const out: UdiffRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < header.length) continue;
    out.push({
      symbol: cols[iSymbol],
      series: iSeries >= 0 ? cols[iSeries] : "",
      open: Number(cols[iOpen]),
      high: Number(cols[iHigh]),
      low: Number(cols[iLow]),
      close: Number(cols[iClose]),
      prevClose: iPrevClose >= 0 ? Number(cols[iPrevClose]) || undefined : undefined,
      volume: Number(cols[iVolume]) || 0,
      tradedValue: iValue >= 0 ? Number(cols[iValue]) || undefined : undefined,
      tradesCount: iTrades >= 0 ? Number(cols[iTrades]) || undefined : undefined,
    });
  }
  return out;
}
