import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import db from "@/lib/db";
import { dailyCandles } from "@/db/schema";

export async function getSymbols(_req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      symbol: dailyCandles.symbol,
      series: dailyCandles.series,
      minDate: sql<string>`min(${dailyCandles.tradeDate})`,
      maxDate: sql<string>`max(${dailyCandles.tradeDate})`,
    })
    .from(dailyCandles)
    .groupBy(dailyCandles.symbol, dailyCandles.series)
    .orderBy(dailyCandles.symbol);

  res.json({ symbols: rows });
}
