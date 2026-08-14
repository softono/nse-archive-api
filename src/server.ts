import app from "@/app";
import config from "@/config";
import { startScheduler } from "@/ingest/scheduler";
import { infoLog } from "@/lib/logger";

app.listen(config.PORT, () => {
  infoLog(`nse-archive API listening on http://localhost:${config.PORT}`);
  startScheduler();
});
