import cron from "node-cron";
import { ingestYesterday } from "@/ingest/daily.service";
import { ingestSurveillance } from "@/ingest/surveillance.service";
import { infoLog, errorLog } from "@/lib/logger";

/** node-cron, in-process — per the PRD's decision, no BullMQ/Redis queue for scheduling (Redis is
 * used only as a cache elsewhere in this service, not for job orchestration). Fires daily at
 * 19:00 IST, after NSE's typical ~18:30 IST publish time. */
export function startScheduler(): void {
  cron.schedule(
    "0 19 * * 1-5",
    () => {
      infoLog("daily ingest cron fired");
      ingestYesterday().catch((err) =>
        errorLog("daily ingest cron run failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  // ASM/GSM changes daily and is bot-mitigation-fronted (unlike the static archive files the
  // 19:00 job above pulls) — run it separately so its cookie-jar/warm-up failures never block the
  // static-file ingest.
  cron.schedule(
    "0 7 * * 1-5",
    () => {
      infoLog("surveillance ingest cron fired");
      ingestSurveillance().catch((err) =>
        errorLog("surveillance ingest cron run failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  infoLog("scheduler started", {
    dailyIngest: "0 19 * * 1-5 Asia/Kolkata",
    surveillanceIngest: "0 7 * * 1-5 Asia/Kolkata",
  });

  // Catch-up on boot. node-cron arms an in-process timer against the wall clock, and this box has
  // no RTC — at boot the clock starts wrong and NTP jumps it afterwards, which can leave an
  // already-armed timer that never fires. That is not hypothetical: after the 2026-08-20 reboot
  // neither the 19:00 nor the 07:00 tick fired again, and 2026-08-19/20 were lost until they were
  // ingested by hand. `ingestYesterday` is now gap-filling and idempotent (upserts), so simply
  // running it shortly after start makes any missed tick self-heal instead of becoming a
  // permanent hole. Delayed a little so it doesn't compete with app start-up, and deliberately
  // fire-and-forget: a catch-up failure must never prevent the API from serving.
  setTimeout(() => {
    infoLog("boot catch-up ingest starting");
    ingestYesterday().catch((err) =>
      errorLog("boot catch-up ingest failed", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 60_000).unref();
}
