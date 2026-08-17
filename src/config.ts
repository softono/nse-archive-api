import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4010),
  DATABASE_URL: z.string().min(1),
  CACHE_DRIVER: z.string().default("none"),
  REDIS_URL: z.string().optional(),
  ARCHIVE_DIR: z.string().default("./archive"),
  BACKFILL_START_DATE: z.string().default("2024-01-01"),
  NSE_FETCH_TIMEOUT_MS: z.coerce.number().default(15000),
  // The JSON APIs (corporate-announcements etc.) return heavier, unscoped payloads than the cheap
  // cookie warm-up hit against the NSE root page, and have been observed to occasionally take
  // longer than 15s to respond even with a warm cookie jar. Give the actual data fetch more
  // headway than the warm-up while staying under trading's 30s nse_archive_fetch_timeout_ms call
  // budget for the common (already-warm) case — see nse_archive_seed_settings.sql in trading.
  NSE_JSON_FETCH_TIMEOUT_MS: z.coerce.number().default(25000),
  NSE_RATE_LIMIT_MS: z.coerce.number().default(1000),
  API_KEY: z.string().optional(),
  NSE_USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ),
});

const config = schema.parse(process.env);

export default config;
