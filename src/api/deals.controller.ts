import type { Request, Response } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import db from "@/lib/db";
import { deals } from "@/db/schema";

export async function getDeals(req: Request, res: Response): Promise<void> {
  const dealType = req.query.dealType ? String(req.query.dealType) : undefined;
  const symbol = req.query.symbol
    ? String(req.query.symbol).toUpperCase()
    : undefined;
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required" });
    return;
  }
  if (dealType && dealType !== "bulk" && dealType !== "block") {
    res.status(400).json({ error: "dealType must be 'bulk' or 'block'" });
    return;
  }

  const conditions = [gte(deals.tradeDate, from), lte(deals.tradeDate, to)];
  if (dealType) conditions.push(eq(deals.dealType, dealType));
  if (symbol) conditions.push(eq(deals.symbol, symbol));

  const rows = await db
    .select()
    .from(deals)
    .where(and(...conditions))
    .orderBy(asc(deals.tradeDate));

  res.json({
    deals: rows.map((r) => ({
      date: r.tradeDate,
      dealType: r.dealType,
      symbol: r.symbol,
      securityName: r.securityName,
      clientName: r.clientName,
      buySell: r.buySell,
      quantity: r.quantity,
      price: Number(r.price),
      remarks: r.remarks,
    })),
  });
}
