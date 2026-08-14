import Redis from "ioredis";
import config from "@/config";
import { warningLog } from "@/lib/logger";

// Mirrors admin_backend's lib/redis.ts convention: CACHE_DRIVER gates whether a real client is
// constructed at all — anything other than "redis" silently no-ops so this service still runs
// (just uncached) if Redis isn't reachable.
const redis: Redis | null =
  config.CACHE_DRIVER?.toLowerCase() === "redis" && config.REDIS_URL
    ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 })
    : null;

redis?.on("error", (err) => warningLog("redis connection error", { error: err.message }));

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export default redis;
