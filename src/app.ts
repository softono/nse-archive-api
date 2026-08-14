import express from "express";
import config from "@/config";
import routes from "@/api/routes";
import { infoLog, warningLog } from "@/lib/logger";

const app = express();

app.use(express.json());

// Single static API-key header per the PRD's "read-only data service, not an admin surface"
// stance — only enforced when API_KEY is actually set, so it stays optional for a private
// internal deployment.
if (config.API_KEY) {
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (req.header("x-api-key") !== config.API_KEY) {
      warningLog("rejected request with missing/invalid API key", { path: req.path });
      res.status(401).json({ error: "invalid or missing x-api-key" });
      return;
    }
    next();
  });
} else {
  infoLog("API_KEY not set — running without auth (fine for a private/internal network only)");
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/", routes);

export default app;
