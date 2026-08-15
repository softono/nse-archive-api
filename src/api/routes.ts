import { Router } from "express";
import {
  getCandles,
  getIndexCandles,
  getFoCandles,
} from "@/api/candles.controller";
import { getSymbols } from "@/api/symbols.controller";
import { getStatus } from "@/api/status.controller";
import { getParticipantActivity } from "@/api/participant-activity.controller";
import { getDeals } from "@/api/deals.controller";
import { getSecurities } from "@/api/securities.controller";
import { runBackfill } from "@/ingest/backfill.service";
import { ingestSecurities } from "@/ingest/securities.service";
import { infoLog, errorLog } from "@/lib/logger";

const router = Router();

router.get("/candles", getCandles);
router.get("/index-candles", getIndexCandles);
router.get("/fo-candles", getFoCandles);
router.get("/participant-activity", getParticipantActivity);
router.get("/deals", getDeals);
router.get("/symbols", getSymbols);
router.get("/securities", getSecurities);
router.get("/status", getStatus);

router.post("/securities/sync", (_req, res) => {
  ingestSecurities().catch((err) =>
    errorLog("securities sync failed", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  infoLog("securities sync triggered via API");
  res.status(202).json({ status: "started" });
});

// Operator-only, no auth model in v1 per the PRD (assumes private/internal network) — fires the
// resumable backfill in the background and returns immediately rather than holding the request
// open for what can be an hours-long run.
router.post("/backfill/trigger", (_req, res) => {
  runBackfill().catch((err) =>
    errorLog("backfill run failed", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  infoLog("backfill triggered via API");
  res.status(202).json({ status: "started" });
});

export default router;
