import config from "@/config";
import { infoLog, warningLog } from "@/lib/logger";

// Unlike nse-client.ts's static archive files (nsearchives.nseindia.com — plain User-Agent is
// enough), www.nseindia.com's JSON APIs (holidays, corporate calendar/announcements, insider
// PIT/SAST, ASM/GSM surveillance, corporate actions, FII/DII flows) are bot-mitigation-fronted
// and need a warmed-up session cookie. Ported from admin_backend's nse-scrape.provider.ts, which
// used to own this client before those endpoints moved here — see that project's
// docs/plan/nsearchives.md for the migration history.
//
// Do NOT attempt fingerprint spoofing or headless-browser automation to defeat NSE's bot
// mitigation. If an endpoint is unreachable/blocked in a given environment, that is an
// acceptable, expected "known limitation" — log clearly and move on.
const NSE_ROOT = "https://www.nseindia.com";

// Minimal in-memory cookie jar — fetch has no built-in one. Good enough for the
// warm-up-then-reuse pattern; refreshed on 401/403.
let cookieJar = "";

function mergeSetCookie(setCookieHeader: string | null): void {
  if (!setCookieHeader) return;
  const pairs = setCookieHeader
    .split(/,(?=[^;]+?=[^;]*;)/) // best-effort split of a combined Set-Cookie header
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);
  const existing = new Map<string, string>();
  for (const c of cookieJar.split("; ").filter(Boolean)) {
    const [k, ...rest] = c.split("=");
    existing.set(k, rest.join("="));
  }
  for (const p of pairs) {
    const [k, ...rest] = p.split("=");
    if (k) existing.set(k, rest.join("="));
  }
  cookieJar = Array.from(existing.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.NSE_FETCH_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": config.NSE_USER_AGENT,
        ...(cookieJar ? { Cookie: cookieJar } : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hit the NSE root with a browser-like user-agent to obtain session cookies, then reuse the jar
 * for subsequent JSON API calls.
 */
export async function warmUpCookies(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(NSE_ROOT);
    mergeSetCookie(res.headers.get("set-cookie"));
    infoLog("nse cookie warm-up done", {
      status: res.status,
      gotCookies: Boolean(cookieJar),
    });
    return res.ok;
  } catch (err) {
    warningLog(
      "nse cookie warm-up failed — known blocker, continuing without it",
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
    return false;
  }
}

/** Fetch a `www.nseindia.com` JSON API path (e.g. "/api/holiday-master?type=trading"), warming up
 * and refreshing the cookie jar on 401/403 automatically. */
export async function fetchNseJson(
  path: string,
  retriedAfterRefresh = false,
): Promise<Response> {
  if (!cookieJar) await warmUpCookies();
  const url = path.startsWith("http") ? path : `${NSE_ROOT}${path}`;
  const res = await fetchWithTimeout(url);
  if ((res.status === 401 || res.status === 403) && !retriedAfterRefresh) {
    cookieJar = "";
    await warmUpCookies();
    return fetchNseJson(path, true);
  }
  return res;
}
