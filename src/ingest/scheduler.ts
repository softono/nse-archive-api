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
}
