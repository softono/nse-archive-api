import type { Request, Response } from "express";
import { and, asc, eq, ilike, or, sql, count } from "drizzle-orm";
import db from "@/lib/db";
import { securities } from "@/db/schema";
import { cacheGet, cacheSet } from "@/lib/redis";
import { errorLog } from "@/lib/logger";

const CACHE_TTL_SECONDS = 300; // 5 minutes

export async function getSecurities(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const symbol = req.query.symbol
      ? String(req.query.symbol).trim().toUpperCase()
      : undefined;
    const sector = req.query.sector
      ? String(req.query.sector).trim()
      : undefined;
    const industry = req.query.industry
      ? String(req.query.industry).trim()
      : undefined;
    const series = req.query.series
      ? String(req.query.series).trim().toUpperCase()
      : undefined;
    const search = req.query.search
      ? String(req.query.search).trim()
      : undefined;
    const isActiveStr = req.query.is_active
      ? String(req.query.is_active).trim().toLowerCase()
      : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 2000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const cacheKey = `securities:${symbol || ""}:${sector || ""}:${industry || ""}:${series || ""}:${search || ""}:${isActiveStr || ""}:${limit}:${offset}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const conditions = [];

    if (symbol) {
      conditions.push(eq(securities.symbol, symbol));
    }
    if (sector) {
      conditions.push(ilike(securities.sector, `%${sector}%`));
    }
    if (industry) {
      conditions.push(ilike(securities.industry, `%${industry}%`));
    }
    if (series) {
      conditions.push(eq(securities.series, series));
    }
    if (isActiveStr !== undefined) {
      conditions.push(eq(securities.isActive, isActiveStr === "true"));
    }
    if (search) {
      conditions.push(
        or(
          ilike(securities.symbol, `%${search}%`),
          ilike(securities.name, `%${search}%`),
          ilike(securities.isin, `%${search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db
      .select({ total: count() })
      .from(securities)
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    const rows = await db
      .select()
      .from(securities)
      .where(whereClause)
      .orderBy(asc(securities.symbol))
      .limit(limit)
      .offset(offset);

    const payload = {
      total,
      limit,
      offset,
      securities: rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        exchange: r.exchange,
        isin: r.isin,
        providerToken: r.providerToken,
        series: r.series,
        name: r.name,
        sector: r.sector,
        industry: r.industry,
        lotSize: r.lotSize,
        priceBandPct: r.priceBandPct != null ? Number(r.priceBandPct) : null,
        surveillance: r.surveillance,
        listedOn: r.listedOn,
        delistedOn: r.delistedOn,
        isActive: r.isActive,
        isPrimary: r.isPrimary,
        updatedAt: r.updatedAt,
        isQuarantined: r.isQuarantined,
        quarantineReason: r.quarantineReason,
        quarantinedAt: r.quarantinedAt,
      })),
    };

    await cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    errorLog("error fetching securities list", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "failed to retrieve securities" });
  }
}
