import { eq, and } from "drizzle-orm";
import db from "@/lib/db";
import { ingestionLog } from "@/db/schema";

export async function getLoggedStatus(source: string, tradeDate: string): Promise<string | null> {
  const [row] = await db
    .select({ status: ingestionLog.status })
    .from(ingestionLog)
    .where(and(eq(ingestionLog.source, source), eq(ingestionLog.tradeDate, tradeDate)))
    .limit(1);
  return row?.status ?? null;
}

export async function logIngestion(params: {
  source: string;
  tradeDate: string;
  status: "ok" | "no_trading_day" | "failed";
  rowsWritten?: number;
  error?: string;
}): Promise<void> {
  await db
    .insert(ingestionLog)
    .values({
      source: params.source,
      tradeDate: params.tradeDate,
      status: params.status,
      rowsWritten: params.rowsWritten,
      error: params.error,
    })
    .onConflictDoUpdate({
      target: [ingestionLog.source, ingestionLog.tradeDate],
      set: {
        status: params.status,
        rowsWritten: params.rowsWritten,
        error: params.error,
        fetchedAt: new Date(),
      },
    });
}
