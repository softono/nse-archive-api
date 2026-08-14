import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import db from "@/lib/db";
import { ingestionLog } from "@/db/schema";

export async function getStatus(_req: Request, res: Response): Promise<void> {
  const perSource = await db
    .select({
      source: ingestionLog.source,
      minDate: sql<string>`min(${ingestionLog.tradeDate})`,
      maxDate: sql<string>`max(${ingestionLog.tradeDate})`,
      okCount: sql<number>`count(*) filter (where ${ingestionLog.status} = 'ok')`,
      failedCount: sql<number>`count(*) filter (where ${ingestionLog.status} = 'failed')`,
    })
    .from(ingestionLog)
    .groupBy(ingestionLog.source);

  const recentFailures = await db
    .select()
    .from(ingestionLog)
    .where(eq(ingestionLog.status, "failed"))
    .orderBy(sql`${ingestionLog.fetchedAt} desc`)
    .limit(20);

  res.json({ sources: perSource, recentFailures });
}
