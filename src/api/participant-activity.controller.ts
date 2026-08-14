import type { Request, Response } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import db from "@/lib/db";
import { participantActivity } from "@/db/schema";

export async function getParticipantActivity(req: Request, res: Response): Promise<void> {
  const metric = String(req.query.metric ?? "");
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const clientType = req.query.clientType ? String(req.query.clientType) : undefined;

  if (!metric || (metric !== "oi" && metric !== "volume") || !from || !to) {
    res.status(400).json({ error: "metric ('oi' or 'volume'), from, and to are required" });
    return;
  }

  const conditions = [
    eq(participantActivity.metric, metric),
    gte(participantActivity.tradeDate, from),
    lte(participantActivity.tradeDate, to),
  ];
  if (clientType) conditions.push(eq(participantActivity.clientType, clientType));

  const rows = await db
    .select()
    .from(participantActivity)
    .where(and(...conditions))
    .orderBy(asc(participantActivity.tradeDate), asc(participantActivity.clientType));

  res.json({
    metric,
    activity: rows.map((r) => ({
      date: r.tradeDate,
      clientType: r.clientType,
      futureIndexLong: r.futureIndexLong,
      futureIndexShort: r.futureIndexShort,
      futureStockLong: r.futureStockLong,
      futureStockShort: r.futureStockShort,
      optionIndexCallLong: r.optionIndexCallLong,
      optionIndexPutLong: r.optionIndexPutLong,
      optionIndexCallShort: r.optionIndexCallShort,
      optionIndexPutShort: r.optionIndexPutShort,
      optionStockCallLong: r.optionStockCallLong,
      optionStockPutLong: r.optionStockPutLong,
      optionStockCallShort: r.optionStockCallShort,
      optionStockPutShort: r.optionStockPutShort,
      totalLong: r.totalLong,
      totalShort: r.totalShort,
    })),
  });
}
