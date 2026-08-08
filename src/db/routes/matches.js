import { Router } from "express";
import { createMatchSchema } from "../../validation/matches.js";
import { matches } from "../schema.js";
import { db } from "../db.js";
import { getMatchStatus } from "../../utils/match-status.js";
import { listMatchesQuerySchema } from "../../validation/matches.js";
import { desc } from "drizzle-orm";
import {
  bumpCacheVersion,
  getCacheVersion,
  getOrSetJson,
} from "../../redis.js";

export const matchesRouter = Router();

const MAX_LIMIT = 100; 

function matchesCacheTtl(matchesList) {
  // A live or soon-to-start match changes often; historical fixtures do not.
  if (matchesList.some((match) => match.status === "live")) return 5;
  if (matchesList.some((match) => new Date(match.startTime).getTime() - Date.now() < 15 * 60 * 1000)) return 15;
  return 60;
}

matchesRouter.get("/", async  (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if(!parsed.success){
    return res.status(400).json({error: 'Invalid query.', details: parsed.error.issues});
  }
 const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const version = await getCacheVersion("matches:list");
    const cacheKey = `matches:list:v${version}:limit:${limit}`;
    const { data, cacheStatus } = await getOrSetJson(cacheKey, matchesCacheTtl, async () => {
      const matchesList = await db
        .select()
        .from(matches)
        .orderBy(desc(matches.createdAt))
        .limit(limit);

      return matchesList;
    });

    res.set("X-Cache", cacheStatus);
    res.json({ data });
  } catch(e){
    console.error("Failed to list matches", e);
    res.status(500).json({error: 'Failed to list matches.'})
  }

});

matchesRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload.", details: parsed.error.issues });
  }

  const { startTime, endTime, homeScore, awayScore } = parsed.data;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime),
      })
      .returning();

      if(res.app.locals.broadcastMatchCreated){
        res.app.locals.broadcastMatchCreated(event);
      }

      // Cache invalidation must not add latency to the live WebSocket event path.
      void bumpCacheVersion("matches:list");
    return res.status(201).json({ data: event });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create match.", details: JSON.stringify(e)});
  }
});
