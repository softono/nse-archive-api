import { Router } from "express";
import { getCandles, getIndexCandles } from "@/api/candles.controller";
import { getSymbols } from "@/api/symbols.controller";
import { getStatus } from "@/api/status.controller";
import { runBackfill } from "@/ingest/backfill.service";
import { infoLog, errorLog } from "@/lib/logger";

const router = Router();

router.get("/candles", getCandles);
router.get("/index-candles", getIndexCandles);
router.get("/symbols", getSymbols);
router.get("/status", getStatus);

// Operator-only, no auth model in v1 per the PRD (assumes private/internal network) — fires the
// resumable backfill in the background and returns immediately rather than holding the request
// open for what can be an hours-long run.
router.post("/backfill/trigger", (_req, res) => {
  runBackfill().catch((err) =>
    errorLog("backfill run failed", { error: err instanceof Error ? err.message : String(err) }),
  );
  infoLog("backfill triggered via API");
  res.status(202).json({ status: "started" });
});

export default router;
