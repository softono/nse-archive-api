import { runBackfill } from "@/ingest/backfill.service";

runBackfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
