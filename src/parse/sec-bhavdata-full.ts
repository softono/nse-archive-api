// Column layout ported from admin_backend's proven-correct parseBhavdataCsv
// (src/modules/market-data/nse-scrape.provider.ts) — same source file, same columns.
export interface SecBhavdataRow {
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
  deliveryQty?: number;
  deliveryPct?: number;
}

export function parseSecBhavdataCsv(csvText: string): SecBhavdataRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iSymbol = idx("SYMBOL");
  const iSeries = idx("SERIES");
  const iPrevClose = idx("PREV_CLOSE");
  const iOpen = idx("OPEN_PRICE");
  const iHigh = idx("HIGH_PRICE");
  const iLow = idx("LOW_PRICE");
  const iClose = idx("CLOSE_PRICE");
  const iVolume = idx("TTL_TRD_QNTY");
  const iValue = idx("TURNOVER_LACS");
  const iTrades = idx("NO_OF_TRADES");
  const iDelivQty = idx("DELIV_QTY");
  const iDelivPct = idx("DELIV_PER");

  if (iSymbol < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
    throw new Error("sec_bhavdata_full CSV missing expected OHLC columns — header may have changed");
  }

  const out: SecBhavdataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < header.length) continue;
    out.push({
      symbol: cols[iSymbol],
      series: iSeries >= 0 ? cols[iSeries] : "",
      prevClose: iPrevClose >= 0 ? Number(cols[iPrevClose]) || undefined : undefined,
      open: Number(cols[iOpen]),
      high: Number(cols[iHigh]),
      low: Number(cols[iLow]),
      close: Number(cols[iClose]),
      volume: Number(cols[iVolume]) || 0,
      tradedValue: iValue >= 0 ? Number(cols[iValue]) * 100000 : undefined, // lacs -> rupees
      tradesCount: iTrades >= 0 ? Number(cols[iTrades]) || undefined : undefined,
      deliveryQty: iDelivQty >= 0 ? Number(cols[iDelivQty]) || undefined : undefined,
      deliveryPct: iDelivPct >= 0 ? Number(cols[iDelivPct]) || undefined : undefined,
    });
  }
  return out;
}
