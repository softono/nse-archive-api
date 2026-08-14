export interface ParticipantActivityRow {
  clientType: string;
  futureIndexLong?: number;
  futureIndexShort?: number;
  futureStockLong?: number;
  futureStockShort?: number;
  optionIndexCallLong?: number;
  optionIndexPutLong?: number;
  optionIndexCallShort?: number;
  optionIndexPutShort?: number;
  optionStockCallLong?: number;
  optionStockPutLong?: number;
  optionStockCallShort?: number;
  optionStockPutShort?: number;
  totalLong?: number;
  totalShort?: number;
}

// fao_participant_oi_{DDMMYYYY}.csv / fao_participant_vol_{DDMMYYYY}.csv — a quoted title row,
// then a header row, then one row per client type (Client, DII, FII, Pro, TOTAL). Column headers
// carry inconsistent trailing whitespace in the live file (e.g. "Future Stock Short       "), so
// headers are trimmed before matching.
export function parseParticipantActivityCsv(csvText: string): ParticipantActivityRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 3) return [];
  const header = lines[1].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iClientType = idx("CLIENT TYPE");
  const iFutIdxLong = idx("FUTURE INDEX LONG");
  const iFutIdxShort = idx("FUTURE INDEX SHORT");
  const iFutStkLong = idx("FUTURE STOCK LONG");
  const iFutStkShort = idx("FUTURE STOCK SHORT");
  const iOptIdxCallLong = idx("OPTION INDEX CALL LONG");
  const iOptIdxPutLong = idx("OPTION INDEX PUT LONG");
  const iOptIdxCallShort = idx("OPTION INDEX CALL SHORT");
  const iOptIdxPutShort = idx("OPTION INDEX PUT SHORT");
  const iOptStkCallLong = idx("OPTION STOCK CALL LONG");
  const iOptStkPutLong = idx("OPTION STOCK PUT LONG");
  const iOptStkCallShort = idx("OPTION STOCK CALL SHORT");
  const iOptStkPutShort = idx("OPTION STOCK PUT SHORT");
  const iTotalLong = idx("TOTAL LONG CONTRACTS");
  const iTotalShort = idx("TOTAL SHORT CONTRACTS");

  if (iClientType < 0) {
    throw new Error("Participant activity CSV missing 'Client Type' column — header may have changed");
  }

  const num = (cols: string[], i: number) =>
    i >= 0 && cols[i] !== undefined && cols[i] !== "" ? Number(cols[i]) : undefined;

  const out: ParticipantActivityRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols[iClientType]) continue;
    out.push({
      clientType: cols[iClientType],
      futureIndexLong: num(cols, iFutIdxLong),
      futureIndexShort: num(cols, iFutIdxShort),
      futureStockLong: num(cols, iFutStkLong),
      futureStockShort: num(cols, iFutStkShort),
      optionIndexCallLong: num(cols, iOptIdxCallLong),
      optionIndexPutLong: num(cols, iOptIdxPutLong),
      optionIndexCallShort: num(cols, iOptIdxCallShort),
      optionIndexPutShort: num(cols, iOptIdxPutShort),
      optionStockCallLong: num(cols, iOptStkCallLong),
      optionStockPutLong: num(cols, iOptStkPutLong),
      optionStockCallShort: num(cols, iOptStkCallShort),
      optionStockPutShort: num(cols, iOptStkPutShort),
      totalLong: num(cols, iTotalLong),
      totalShort: num(cols, iTotalShort),
    });
  }
  return out;
}
