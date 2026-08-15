export interface IndexCloseRow {
  indexName: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  pointsChange?: number;
  pctChange?: number;
}

// ind_close_all_{DDMMYYYY}.csv columns: Index Name,Index Date,Open Index Value,High Index Value,
// Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield
export function parseIndexCloseCsv(csvText: string): IndexCloseRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iName = idx("INDEX NAME");
  const iOpen = idx("OPEN INDEX VALUE");
  const iHigh = idx("HIGH INDEX VALUE");
  const iLow = idx("LOW INDEX VALUE");
  const iClose = idx("CLOSING INDEX VALUE");
  const iVolume = idx("VOLUME");
  const iPointsChange = idx("POINTS CHANGE");
  const iPctChange = idx("CHANGE(%)");

  if (iName < 0 || iClose < 0) {
    throw new Error(
      "ind_close_all CSV missing expected columns — header may have changed",
    );
  }

  const out: IndexCloseRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < header.length) continue;
    const close = Number(cols[iClose]);
    if (!Number.isFinite(close)) continue;
    out.push({
      indexName: cols[iName],
      open: iOpen >= 0 ? Number(cols[iOpen]) || undefined : undefined,
      high: iHigh >= 0 ? Number(cols[iHigh]) || undefined : undefined,
      low: iLow >= 0 ? Number(cols[iLow]) || undefined : undefined,
      close,
      volume: iVolume >= 0 ? Number(cols[iVolume]) || undefined : undefined,
      pointsChange:
        iPointsChange >= 0 && Number.isFinite(Number(cols[iPointsChange]))
          ? Number(cols[iPointsChange])
          : undefined,
      pctChange:
        iPctChange >= 0 && Number.isFinite(Number(cols[iPctChange]))
          ? Number(cols[iPctChange])
          : undefined,
    });
  }
  return out;
}
