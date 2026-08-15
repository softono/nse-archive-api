import type { Request, Response } from "express";
import {
  fetchHolidayCalendar,
  fetchCorporateCalendar,
  fetchCorporateAnnouncements,
  fetchFiiDiiFlows,
  fetchInsiderDisclosures,
  fetchCorporateActionsForSymbol,
} from "@/fetch/reference-data";
import { errorLog } from "@/lib/logger";

// These proxy live, bot-mitigation-fronted `www.nseindia.com` JSON endpoints on every request
// (no DB cache/table — the caller decides how often to poll) — a 502 here means NSE itself is
// unreachable/blocking, not a bug in this service. Logged, not retried indefinitely.
function upstreamFailed(res: Response, source: string, err: unknown): void {
  errorLog(`${source} proxy failed`, {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(502).json({ error: `${source} upstream fetch failed` });
}

export async function getHolidays(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await fetchHolidayCalendar());
  } catch (err) {
    upstreamFailed(res, "nse_holiday_calendar", err);
  }
}

export async function getCorporateCalendar(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ events: await fetchCorporateCalendar() });
  } catch (err) {
    upstreamFailed(res, "nse_corporate_calendar", err);
  }
}

export async function getAnnouncements(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ announcements: await fetchCorporateAnnouncements() });
  } catch (err) {
    upstreamFailed(res, "nse_corporate_announcements", err);
  }
}

export async function getFiiDiiFlows(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ flows: await fetchFiiDiiFlows() });
  } catch (err) {
    upstreamFailed(res, "nse_fiidii_trade_react", err);
  }
}

export async function getInsiderDisclosures(
  req: Request,
  res: Response,
): Promise<void> {
  const kind = String(req.query.kind ?? "");
  if (kind !== "pit" && kind !== "sast") {
    res.status(400).json({ error: "kind must be 'pit' or 'sast'" });
    return;
  }
  try {
    res.json({ kind, disclosures: await fetchInsiderDisclosures(kind) });
  } catch (err) {
    upstreamFailed(res, `nse_corporates_${kind}`, err);
  }
}

export async function getCorporateActions(
  req: Request,
  res: Response,
): Promise<void> {
  const symbol = String(req.query.symbol ?? "").toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  // Best-effort per fetchCorporateActionsForSymbol's own contract — returns [] rather than
  // throwing, so no upstreamFailed branch needed here.
  res.json({ symbol, actions: await fetchCorporateActionsForSymbol(symbol) });
}
