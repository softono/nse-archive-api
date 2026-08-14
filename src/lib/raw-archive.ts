import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import config from "@/config";

// PRD's "no bytea table" decision: raw files land on disk under ARCHIVE_DIR/{source}/{date}.ext,
// not in Postgres — the file itself is the canonical NSE-published artifact, and re-fetching a
// missed day is cheap.
export async function archiveRawFile(params: {
  source: string;
  tradeDate: string; // YYYY-MM-DD
  ext: string; // "csv" | "csv.zip"
  data: Buffer | string;
}): Promise<string> {
  const dir = path.resolve(config.ARCHIVE_DIR, params.source);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${params.tradeDate}.${params.ext}`);
  await writeFile(filePath, params.data);
  return filePath;
}
