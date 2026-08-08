import "dotenv/config";
import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: false,
      },
    })
  : null;

if (redis) {
  redis.on("error", (error) => {
    console.error("Redis error:", error.message);
  });
}

export async function connectRedis() {
  if (!redis || redis.isOpen) return false;

  try {
    await redis.connect();
    console.log("Redis cache connected");
    return true;
  } catch (error) {
    console.error("Redis cache disabled:", error.message);
    return false;
  }
}

export async function getCacheVersion(scope) {
  if (!redis?.isOpen) return "1";

  try {
    return (await redis.get(`cache-version:${scope}`)) ?? "1";
  } catch (error) {
    console.error("Failed to read cache version:", error.message);
    return "1";
  }
}

export async function bumpCacheVersion(scope) {
  if (!redis?.isOpen) return;

  try {
    await redis.incr(`cache-version:${scope}`);
  } catch (error) {
    console.error("Failed to invalidate cache:", error.message);
  }
}

// Redis is an optimization only. A cache failure always falls back to Postgres.
export async function getOrSetJson(key, ttlSeconds, fetchData) {
  if (redis?.isOpen) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return { data: JSON.parse(cached), cacheStatus: "HIT" };
      }
    } catch (error) {
      console.error("Failed to read cache:", error.message);
    }
  }

  const data = await fetchData();
  const ttl = typeof ttlSeconds === "function" ? ttlSeconds(data) : ttlSeconds;

  if (redis?.isOpen) {
    try {
      await redis.set(key, JSON.stringify(data), { EX: ttl });
    } catch (error) {
      console.error("Failed to populate cache:", error.message);
    }
  }

  return { data, cacheStatus: "MISS" };
}
