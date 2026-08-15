import { fetchNseJson } from "@/fetch/nse-json-client";
import { archiveRawFile } from "@/lib/raw-archive";
import { infoLog, warningLog } from "@/lib/logger";

// Bot-mitigation-fronted `www.nseindia.com` JSON endpoints — holidays, corporate calendar,
// corporate announcements, FII/DII flows, insider (PIT/SAST) disclosures, ASM/GSM surveillance,
// and symbol-scoped corporate actions. These are plain fetch-and-archive passthroughs: parsing
// into a business schema and joining against a securities universe is the caller's job (either
// this service's own securities.surveillance — see ingest/securities.service.ts — or the
// consuming trading app's tables for everything else). Ported from admin_backend's
// nse-scrape.provider.ts, which used to scrape these directly before this service existed.
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchJsonAndArchive(source: string, path: string): Promise<unknown> {
  const res = await fetchNseJson(path);
  const text = await res.text();
  await archiveRawFile({ source, tradeDate: todayStr(), ext: "json", data: text });
  if (!res.ok) {
    warningLog(`${source} fetch returned non-2xx`, { status: res.status });
    throw new Error(`${source} fetch failed: HTTP ${res.status}`);
  }
  return JSON.parse(text);
}

/** NSE trading holiday calendar. */
export async function fetchHolidayCalendar(): Promise<unknown> {
  return fetchJsonAndArchive("nse_holiday_calendar", "/api/holiday-master?type=trading");
}

/** Corporate/results calendar — board meetings & results. */
export async function fetchCorporateCalendar(): Promise<unknown[]> {
  const json = await fetchJsonAndArchive("nse_corporate_calendar", "/api/event-calendar");
  return Array.isArray(json) ? json : [];
}

/** Corporate announcements, board-wide. */
export async function fetchCorporateAnnouncements(): Promise<unknown[]> {
  const json = await fetchJsonAndArchive(
    "nse_corporate_announcements",
    "/api/corporate-announcements?index=equities",
  );
  return Array.isArray(json) ? json : [];
}

/** FII/DII net cash-market flows. NSE's response is two rows (category "FII/FPI" and "DII"). */
export async function fetchFiiDiiFlows(): Promise<unknown[]> {
  const json = await fetchJsonAndArchive("nse_fiidii_trade_react", "/api/fiidiiTradeReact");
  return Array.isArray(json) ? json : [];
}

/** SEBI PIT (insider) + SAST disclosures, board-wide. */
export async function fetchInsiderDisclosures(kind: "pit" | "sast"): Promise<unknown[]> {
  const endpoint = kind === "pit" ? "corporates-pit" : "corporate-sast";
  const json = await fetchJsonAndArchive(`nse_${endpoint.replace(/-/g, "_")}`, `/api/${endpoint}?index=equities`);
  // NSE wraps some of these endpoints in { data: [...] } rather than a bare array.
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as unknown[];
  }
  return [];
}

/** ASM/GSM surveillance lists — used internally by ingest/securities.service.ts to populate this
 * service's own `securities.surveillance`, not exposed as a standalone route (consumers read
 * current surveillance status back via GET /securities). */
export async function fetchSurveillanceLists(): Promise<{ asm: unknown; gsm: unknown } | null> {
  try {
    const [asm, gsm] = await Promise.all([
      fetchJsonAndArchive("nse_asm_list", "/api/reportASM"),
      fetchJsonAndArchive("nse_gsm_list", "/api/reportGSM"),
    ]);
    return { asm, gsm };
  } catch (err) {
    warningLog("nse surveillance list fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Symbol-scoped corporate actions (splits/bonuses/dividends/rights/mergers), raw NSE subject
 * text — the caller (trading's corporate-action.service.ts) owns parsing the free-text `subject`
 * field into a structured ratio. */
export async function fetchCorporateActionsForSymbol(symbol: string): Promise<unknown[]> {
  try {
    const json = await fetchJsonAndArchive(
      "nse_corporate_actions",
      `/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(symbol)}`,
    );
    return Array.isArray(json) ? json : [];
  } catch (err) {
    infoLog("nse corporate actions fetch failed for symbol", {
      symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
