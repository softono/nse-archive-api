import { ingestSecurities } from "@/ingest/securities.service";
import { infoLog, errorLog } from "@/lib/logger";

ingestSecurities()
  .then((res) => {
    infoLog("securities seed complete", res);
    console.log("Successfully ingested securities:", res);
    process.exit(0);
  })
  .catch((err) => {
    errorLog("securities seed failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error("Failed to seed securities:", err);
    process.exit(1);
  });
