import { sql } from "drizzle-orm";
import db from "@/lib/db";
import { securities, type NewSecurity } from "@/db/schema";
import { fetchSecuritiesData } from "@/fetch/securities";
import { parseSecurities } from "@/parse/securities";
import { infoLog, errorLog } from "@/lib/logger";

export async function ingestSecurities(): Promise<{
  totalScraped: number;
  rowsUpserted: number;
}> {
  infoLog("starting securities scraping from NSE archive");

  const rawData = await fetchSecuritiesData();
  const parsedRows = parseSecurities(rawData.equityListCsv, rawData.indexCsvs);

  infoLog("parsed securities data", { count: parsedRows.length });

  let rowsUpserted = 0;
  const chunkSize = 200;

  for (let i = 0; i < parsedRows.length; i += chunkSize) {
    const chunk = parsedRows.slice(i, i + chunkSize);
    const values: NewSecurity[] = chunk.map((row) => ({
      symbol: row.symbol,
      exchange: row.exchange,
      isin: row.isin,
      providerToken: row.providerToken,
      series: row.series,
      name: row.name,
      sector: row.sector,
      industry: row.industry,
      lotSize: row.lotSize,
      priceBandPct: row.priceBandPct,
      surveillance: row.surveillance,
      listedOn: row.listedOn,
      delistedOn: row.delistedOn,
      isActive: row.isActive,
      isPrimary: row.isPrimary,
      updatedAt: new Date(),
      isQuarantined: row.isQuarantined,
      quarantineReason: row.quarantineReason,
      quarantinedAt: row.quarantinedAt,
    }));

    try {
      await db
        .insert(securities)
        .values(values)
        .onConflictDoUpdate({
          target: [securities.symbol, securities.exchange, securities.series],
          set: {
            name: sql`EXCLUDED.name`,
            isin: sql`EXCLUDED.isin`,
            sector: sql`EXCLUDED.sector`,
            industry: sql`EXCLUDED.industry`,
            lotSize: sql`EXCLUDED.lot_size`,
            listedOn: sql`EXCLUDED.listed_on`,
            isActive: sql`EXCLUDED.is_active`,
            isPrimary: sql`EXCLUDED.is_primary`,
            updatedAt: sql`now()`,
          },
        });
      rowsUpserted += chunk.length;
    } catch (err) {
      errorLog("failed to batch insert securities chunk, trying row-by-row", {
        startIndex: i,
        chunkSize: chunk.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback row-by-row insertion
      for (const rowVal of values) {
        try {
          await db
            .insert(securities)
            .values(rowVal)
            .onConflictDoUpdate({
              target: [
                securities.symbol,
                securities.exchange,
                securities.series,
              ],
              set: {
                name: rowVal.name,
                isin: rowVal.isin,
                sector: rowVal.sector,
                industry: rowVal.industry,
                lotSize: rowVal.lotSize,
                listedOn: rowVal.listedOn,
                isActive: rowVal.isActive,
                isPrimary: rowVal.isPrimary,
                updatedAt: new Date(),
              },
            });
          rowsUpserted++;
        } catch (innerErr) {
          errorLog("failed to insert individual security", {
            symbol: rowVal.symbol,
            error:
              innerErr instanceof Error ? innerErr.message : String(innerErr),
          });
        }
      }
    }
  }

  infoLog("completed securities ingestion", {
    totalScraped: parsedRows.length,
    rowsUpserted,
  });

  return {
    totalScraped: parsedRows.length,
    rowsUpserted,
  };
}
