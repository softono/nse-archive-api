import config from "@/config";
import { warningLog } from "@/lib/logger";

// Static archive files on nsearchives.nseindia.com don't need the cookie warm-up dance
// admin_backend's nse-scrape.provider.ts needs for www.nseindia.com's JSON API — a plain
// User-Agent header is enough (per this project's PRD, confirmed live).
let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const wait = lastRequestAt + config.NSE_RATE_LIMIT_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export class NseNotFoundError extends Error {
  constructor(url: string) {
    super(`NSE archive file not found (404): ${url}`);
    this.name = "NseNotFoundError";
  }
}

export async function fetchNseArchive(
  url: string,
  maxRetries = 3,
): Promise<Buffer> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < maxRetries) {
    await rateLimit();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      config.NSE_FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": config.NSE_USER_AGENT },
      });
      clearTimeout(timer);

      if (res.status === 404) throw new NseNotFoundError(url);
      if (!res.ok)
        throw new Error(`NSE fetch failed: HTTP ${res.status} for ${url}`);

      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof NseNotFoundError) throw err;
      lastErr = err;
      attempt += 1;
      if (attempt < maxRetries) {
        const backoffMs = 1000 * 2 ** attempt;
        warningLog("nse archive fetch failed, retrying", {
          url,
          attempt,
          backoffMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`NSE fetch failed for ${url}`);
}
