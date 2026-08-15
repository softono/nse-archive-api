import type { Request, Response } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import db from "@/lib/db";
import { dailyCandles, indexDailyClose, foDailyCandles } from "@/db/schema";
import { cacheGet, cacheSet } from "@/lib/redis";

const CACHE_TTL_SECONDS = 3600;

export async function getCandles(req: Request, res: Response): Promise<void> {
  const symbol = String(req.query.symbol ?? "").toUpperCase();
  const series = String(req.query.series ?? "EQ").toUpperCase();
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");

  if (!symbol || !from || !to) {
    res.status(400).json({ error: "symbol, from, and to are required" });
    return;
  }

  const cacheKey = `candles:${symbol}:${series}:${from}:${to}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const rows = await db
    .select()
    .from(dailyCandles)
    .where(
      and(
        eq(dailyCandles.symbol, symbol),
        eq(dailyCandles.series, series),
        gte(dailyCandles.tradeDate, from),
        lte(dailyCandles.tradeDate, to),
      ),
    )
    .orderBy(asc(dailyCandles.tradeDate));

  const payload = {
    symbol,
    series,
    candles: rows.map((r) => ({
      date: r.tradeDate,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume,
      deliveryPct: r.deliveryPct != null ? Number(r.deliveryPct) : null,
    })),
  };

  await cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
  res.json(payload);
}

export async function getIndexCandles(
  req: Request,
  res: Response,
): Promise<void> {
  const indexName = String(req.query.index ?? "");
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");

  if (!indexName || !from || !to) {
    res.status(400).json({ error: "index, from, and to are required" });
    return;
  }

  const rows = await db
    .select()
    .from(indexDailyClose)
    .where(
      and(
        eq(indexDailyClose.indexName, indexName),
        gte(indexDailyClose.tradeDate, from),
        lte(indexDailyClose.tradeDate, to),
      ),
    )
    .orderBy(asc(indexDailyClose.tradeDate));

  res.json({
    index: indexName,
    candles: rows.map((r) => ({
      date: r.tradeDate,
      open: r.open != null ? Number(r.open) : null,
      high: r.high != null ? Number(r.high) : null,
      low: r.low != null ? Number(r.low) : null,
      close: Number(r.close),
      volume: r.volume,
      pointsChange: r.pointsChange != null ? Number(r.pointsChange) : null,
      pctChange: r.pctChange != null ? Number(r.pctChange) : null,
    })),
  });
}

export async function getFoCandles(req: Request, res: Response): Promise<void> {
  const symbol = String(req.query.symbol ?? "").toUpperCase();
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const instrumentType = req.query.instrumentType
    ? String(req.query.instrumentType)
    : undefined;
  const expiry = req.query.expiry ? String(req.query.expiry) : undefined;
  const strike = req.query.strike ? String(req.query.strike) : undefined;
  const optionType = req.query.optionType
    ? String(req.query.optionType).toUpperCase()
    : undefined;

  if (!symbol || !from || !to) {
    res.status(400).json({ error: "symbol, from, and to are required" });
    return;
  }

  const conditions = [
    eq(foDailyCandles.symbol, symbol),
    gte(foDailyCandles.tradeDate, from),
    lte(foDailyCandles.tradeDate, to),
  ];
  if (instrumentType)
    conditions.push(eq(foDailyCandles.instrumentType, instrumentType));
  if (expiry) conditions.push(eq(foDailyCandles.expiryDate, expiry));
  if (strike) conditions.push(eq(foDailyCandles.strikePrice, strike));
  if (optionType) conditions.push(eq(foDailyCandles.optionType, optionType));

  const rows = await db
    .select()
    .from(foDailyCandles)
    .where(and(...conditions))
    .orderBy(asc(foDailyCandles.tradeDate));

  res.json({
    symbol,
    candles: rows.map((r) => ({
      date: r.tradeDate,
      instrumentType: r.instrumentType,
      expiry: r.expiryDate,
      strike: r.strikePrice != null ? Number(r.strikePrice) : null,
      optionType: r.optionType || null,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      settlePrice: r.settlePrice != null ? Number(r.settlePrice) : null,
      openInterest: r.openInterest,
      changeInOi: r.changeInOi,
      volume: r.volume,
      lotSize: r.lotSize,
    })),
  });
}
