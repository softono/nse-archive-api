export interface ParsedSecurityRow {
  symbol: string;
  exchange: string;
  isin: string | null;
  providerToken: string | null;
  series: string | null;
  name: string | null;
  sector: string; // Guaranteed non-null
  industry: string; // Guaranteed non-null
  lotSize: number | null;
  priceBandPct: string | null;
  surveillance: string | null;
  listedOn: string | null;
  delistedOn: string | null;
  isActive: boolean;
  isPrimary: boolean;
  isQuarantined: boolean;
  quarantineReason: string | null;
  quarantinedAt: Date | null;
}

const MONTH_MAP: Record<string, string> = {
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

/** Parses NSE date string like '06-OCT-2008' or '29-NOV-1995' to 'YYYY-MM-DD' */
export function parseNseListingDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split("-");
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, "0");
  const month = MONTH_MAP[parts[1].toUpperCase()];
  const year = parts[2];
  if (!month || !year || isNaN(Number(day)) || isNaN(Number(year))) return null;
  return `${year}-${month}-${day}`;
}

export const INDUSTRY_TO_SECTOR_MAP: Record<string, string> = {
  "Financial Services": "Financials",
  "Automobile and Auto Components": "Automobile & Auto Components",
  "Information Technology": "Information Technology",
  "Fast Moving Consumer Goods": "Fast Moving Consumer Goods",
  Healthcare: "Healthcare",
  "Metals & Mining": "Metals & Mining",
  Chemicals: "Chemicals",
  Power: "Energy & Utilities",
  "Oil Gas & Consumable Fuels": "Energy & Utilities",
  "Consumer Durables": "Consumer Durables",
  "Consumer Services": "Consumer Services",
  Construction: "Construction & Infrastructure",
  "Construction Materials": "Construction Materials",
  "Capital Goods": "Capital Goods",
  Telecommunication: "Telecommunication",
  Services: "Services",
  Realty: "Real Estate",
  "Forest Materials": "Basic Materials",
  "Media Entertainment & Publication": "Media & Entertainment",
  Textiles: "Textiles & Apparels",
  Utilities: "Energy & Utilities",
  Diversified: "Diversified",
};

export function inferClassification(
  symbol: string,
  name: string,
  series?: string,
): { sector: string; industry: string } {
  const sym = symbol.toUpperCase();
  const upperName = (name || "").toUpperCase();
  const s = (series || "").toUpperCase();

  if (s === "GB" || s === "GS" || s === "SG") {
    return {
      sector: "Government Securities",
      industry: "Sovereign / State Bonds",
    };
  }
  if (
    upperName.includes("ETF") ||
    sym.includes("BEES") ||
    sym.includes("ETF") ||
    upperName.includes("INDEX FUND")
  ) {
    return { sector: "Financials", industry: "Exchange Traded Funds" };
  }
  if (upperName.includes("BANK")) {
    return { sector: "Financials", industry: "Financial Services" };
  }
  if (
    /\b(FINANCE|FINANCIAL|CAPITAL|INVESTMENT|SECURITIES|HOLDINGS|LEASING|INSURANCE|WEALTH|CREDIT|FIN)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Financials", industry: "Financial Services" };
  }
  if (
    /\b(PHARMA|HEALTHCARE|DRUG|LAB|LABS|MED|MEDICINE|BIOTECH|HOSPITAL|LIFE SCIENCES|THERAPEUTICS)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Healthcare", industry: "Healthcare" };
  }
  if (
    /\b(TECH|INFO|SOFTWARE|DIGITAL|SYSTEMS|SOLUTIONS|COMPUTERS|CYBER|INFOTECH)\b/.test(
      upperName,
    )
  ) {
    return {
      sector: "Information Technology",
      industry: "Information Technology",
    };
  }
  if (
    /\b(POWER|ENERGY|SOLAR|WIND|ELECTRIC|GAS|PETRO|OIL|RENEWABLE|GENCO)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Energy & Utilities", industry: "Power & Energy" };
  }
  if (
    /\b(AUTO|MOTORS|AUTOMOTIVE|VEHICLES|TYRES|WHEELS|AUTOMOBILE|ENGINES)\b/.test(
      upperName,
    )
  ) {
    return {
      sector: "Automobile & Auto Components",
      industry: "Automobile and Auto Components",
    };
  }
  if (
    /\b(STEEL|IRON|MINING|METALS|ALUMINIUM|COPPER|MINERALS|ALLOYS|FORGING|TUBES|FOUNDRY)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Metals & Mining", industry: "Metals & Mining" };
  }
  if (
    /\b(CHEM|CHEMICAL|CHEMICALS|FERTILIZER|FERTILISERS|PESTICIDE|ORGANIC|POLYMERS|PAINTS|SPECIALTY CHEMICALS)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Chemicals", industry: "Chemicals" };
  }
  if (
    /\b(TEXTILE|TEXTILES|FABRIC|FABRICS|COTTON|SPINNING|SILK|YARN|GARMENT|GARMENTS|APPAREL|DENIM)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Textiles & Apparels", industry: "Textiles" };
  }
  if (
    /\b(FOOD|FOODS|BEVERAGE|BEVERAGES|AGRO|TEA|COFFEE|SUGAR|CONSUMER|BREWERIES|DISTILLERIES|DAIRY|SPICES)\b/.test(
      upperName,
    )
  ) {
    return {
      sector: "Fast Moving Consumer Goods",
      industry: "Fast Moving Consumer Goods",
    };
  }
  if (
    /\b(CONSTRUCTION|INFRA|INFRASTRUCTURE|BUILD|PROJECTS|ENGINEERING|DEVELOPERS|HOMES|PROPERTIES|ESTATE|REALTY)\b/.test(
      upperName,
    )
  ) {
    return {
      sector: "Real Estate & Infrastructure",
      industry: "Construction & Realty",
    };
  }
  if (
    /\b(LOGISTICS|SHIPPING|TRANSPORT|PORT|PORTS|EXPRESS|CARGO|FREIGHT)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Services", industry: "Logistics & Transport" };
  }
  if (
    /\b(HOTEL|HOTELS|RESORT|RESORTS|HOSPITALITY|TOURISM|TRAVEL)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Consumer Services", industry: "Hotels & Tourism" };
  }
  if (
    /\b(PAPER|PACKAGING|PLASTIC|PLASTICS|CONTAINERS|CORRUGATED)\b/.test(
      upperName,
    )
  ) {
    return { sector: "Basic Materials", industry: "Packaging & Materials" };
  }
  if (
    /\b(MEDIA|ENTERTAINMENT|FILMS|COMMUNICATION|BROADCAST|TELEVISION|NETWORKS|PUBLICATION|CINEMA)\b/.test(
      upperName,
    )
  ) {
    return {
      sector: "Media & Entertainment",
      industry: "Media & Entertainment",
    };
  }

  return {
    sector: "Industrials & General",
    industry: "General / Diversified Equity",
  };
}

export function parseSecurities(
  equityListCsv: string,
  indexCsvs: { filename: string; content: string }[],
): ParsedSecurityRow[] {
  // 1. Build mapping from index constituent CSVs
  const industryMap = new Map<string, string>();

  for (const item of indexCsvs) {
    const lines = item.content.trim().split(/\r?\n/);
    if (lines.length < 2) continue;
    const header = lines[0].split(",").map((h) => h.trim().toUpperCase());
    const symIdx = header.findIndex((h) => h.includes("SYMBOL"));
    const indIdx = header.findIndex((h) => h.includes("INDUSTRY"));

    if (symIdx >= 0 && indIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]
          .split(",")
          .map((c) => c.trim().replace(/^"|"$/g, ""));
        const symbol = cols[symIdx]?.toUpperCase();
        const industry = cols[indIdx];
        if (symbol && industry && !industryMap.has(symbol)) {
          industryMap.set(symbol, industry);
        }
      }
    }
  }

  // 2. Parse EQUITY_L.csv
  const eqLines = equityListCsv.trim().split(/\r?\n/);
  if (eqLines.length < 2) return [];

  const eqHeader = eqLines[0].split(",").map((h) => h.trim().toUpperCase());
  const idx = (name: string) => eqHeader.findIndex((h) => h.includes(name));

  const iSymbol = idx("SYMBOL");
  const iName = idx("NAME OF COMPANY");
  const iSeries = idx("SERIES");
  const iDate = idx("DATE OF LISTING");
  const iLot = idx("MARKET LOT");
  const iIsin = idx("ISIN NUMBER");

  const results: ParsedSecurityRow[] = [];

  for (let i = 1; i < eqLines.length; i++) {
    const cols = eqLines[i]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const symbol = iSymbol >= 0 ? cols[iSymbol]?.toUpperCase() : "";
    if (!symbol) continue;

    const name = iName >= 0 ? cols[iName] || null : null;
    const series = iSeries >= 0 ? cols[iSeries] || "EQ" : "EQ";
    const isin = iIsin >= 0 ? cols[iIsin] || null : null;
    const lotSizeStr = iLot >= 0 ? cols[iLot] : null;
    const lotSize =
      lotSizeStr && !isNaN(Number(lotSizeStr)) ? Number(lotSizeStr) : 1;
    const listingDateStr = iDate >= 0 ? cols[iDate] : "";
    const listedOn = parseNseListingDate(listingDateStr);

    let industry = industryMap.get(symbol);
    let sector = industry ? INDUSTRY_TO_SECTOR_MAP[industry] || industry : null;

    if (!industry || !sector) {
      const inferred = inferClassification(symbol, name || "", series);
      industry = industry || inferred.industry;
      sector = sector || inferred.sector;
    }

    results.push({
      symbol,
      exchange: "NSE",
      isin,
      providerToken: null,
      series,
      name,
      sector: sector || "Industrials & General",
      industry: industry || "General / Diversified Equity",
      lotSize,
      priceBandPct: null,
      surveillance: null,
      listedOn,
      delistedOn: null,
      isActive: true,
      isPrimary: series === "EQ",
      isQuarantined: false,
      quarantineReason: null,
      quarantinedAt: null,
    });
  }

  return results;
}
