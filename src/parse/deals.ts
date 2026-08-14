export interface DealRow {
  tradeDate: string; // YYYY-MM-DD, taken from the row's own Date column
  symbol: string;
  securityName?: string;
  clientName: string;
  buySell: string;
  quantity: number;
  price: number;
  remarks?: string;
}

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

// "13-AUG-2026" -> "2026-08-13"
function toIsoDate(nseDate: string): string {
  const [d, mon, y] = nseDate.split("-");
  const mm = MONTHS[mon.toUpperCase()];
  if (!mm) throw new Error(`Unrecognized date in deals CSV: ${nseDate}`);
  return `${y}-${mm}-${d.padStart(2, "0")}`;
}

// bulk.csv / block.csv — rolling current-snapshot files (no date in the URL). Columns: Date,
// Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price
// [,Remarks — bulk only].
export function parseDealsCsv(csvText: string): DealRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iDate = idx("DATE");
  const iSymbol = idx("SYMBOL");
  const iSecName = idx("SECURITY NAME");
  const iClient = idx("CLIENT NAME");
  const iBuySell = idx("BUY/SELL");
  const iQty = idx("QUANTITY TRADED");
  const iPrice = idx("TRADE PRICE / WGHT. AVG. PRICE");
  const iRemarks = idx("REMARKS");

  if (iDate < 0 || iSymbol < 0 || iClient < 0 || iQty < 0 || iPrice < 0) {
    throw new Error("Deals CSV missing expected columns — header may have changed");
  }

  const out: DealRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < header.length || !cols[iSymbol]) continue;
    out.push({
      tradeDate: toIsoDate(cols[iDate]),
      symbol: cols[iSymbol],
      securityName: iSecName >= 0 ? cols[iSecName] : undefined,
      clientName: cols[iClient],
      buySell: cols[iBuySell],
      quantity: Number(cols[iQty]),
      price: Number(cols[iPrice]),
      remarks: iRemarks >= 0 && cols[iRemarks] && cols[iRemarks] !== "-" ? cols[iRemarks] : undefined,
    });
  }
  return out;
}
