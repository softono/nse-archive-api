import AdmZip from "adm-zip";

export interface FoBhavcopyRow {
  symbol: string;
  instrumentType: string;
  expiryDate: string; // YYYY-MM-DD
  strikePrice?: number;
  optionType?: string; // CE | PE
  open: number;
  high: number;
  low: number;
  close: number;
  settlePrice?: number;
  openInterest?: number;
  changeInOi?: number;
  volume: number;
  tradedValue?: number;
  tradesCount?: number;
  lotSize?: number;
}

// BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip — one CSV inside the zip. Columns: TradDt,BizDt,
// Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,
// OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,
// OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,...
export function parseFoBhavcopyZip(zipBuffer: Buffer): FoBhavcopyRow[] {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error("FO bhavcopy zip contained no CSV entry");
  return parseFoBhavcopyCsv(entry.getData().toString("utf-8"));
}

export function parseFoBhavcopyCsv(csvText: string): FoBhavcopyRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iSymbol = idx("TCKRSYMB");
  const iInstrType = idx("FININSTRMTP");
  const iExpiry = idx("XPRYDT");
  const iStrike = idx("STRKPRIC");
  const iOptnTp = idx("OPTNTP");
  const iOpen = idx("OPNPRIC");
  const iHigh = idx("HGHPRIC");
  const iLow = idx("LWPRIC");
  const iClose = idx("CLSPRIC");
  const iSettle = idx("STTLMPRIC");
  const iOi = idx("OPNINTRST");
  const iChgOi = idx("CHNGINOPNINTRST");
  const iVolume = idx("TTLTRADGVOL");
  const iValue = idx("TTLTRFVAL");
  const iTrades = idx("TTLNBOFTXSEXCTD");
  const iLot = idx("NEWBRDLOTQTY");

  if (iSymbol < 0 || iInstrType < 0 || iExpiry < 0 || iOpen < 0 || iClose < 0) {
    throw new Error("FO bhavcopy CSV missing expected columns — header may have changed");
  }

  const out: FoBhavcopyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < header.length) continue;
    const strike = iStrike >= 0 ? Number(cols[iStrike]) : NaN;
    const optionType = iOptnTp >= 0 ? cols[iOptnTp] : "";
    out.push({
      symbol: cols[iSymbol],
      instrumentType: cols[iInstrType],
      expiryDate: cols[iExpiry],
      strikePrice: Number.isFinite(strike) && strike > 0 ? strike : undefined,
      optionType: optionType && optionType !== "XX" ? optionType : undefined,
      open: Number(cols[iOpen]),
      high: Number(cols[iHigh]),
      low: Number(cols[iLow]),
      close: Number(cols[iClose]),
      settlePrice: iSettle >= 0 ? Number(cols[iSettle]) || undefined : undefined,
      openInterest: iOi >= 0 ? Number(cols[iOi]) || undefined : undefined,
      changeInOi: iChgOi >= 0 ? Number(cols[iChgOi]) || undefined : undefined,
      volume: Number(cols[iVolume]) || 0,
      tradedValue: iValue >= 0 ? Number(cols[iValue]) || undefined : undefined,
      tradesCount: iTrades >= 0 ? Number(cols[iTrades]) || undefined : undefined,
      lotSize: iLot >= 0 ? Number(cols[iLot]) || undefined : undefined,
    });
  }
  return out;
}
