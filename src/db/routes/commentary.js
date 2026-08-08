import { Router } from "express";
import { db } from "../db.js";
import { commentary } from "../schema.js";
import { matchIdParamSchema as matchParamSchema } from "../../validation/matches.js";
import {
    createCommentarySchema,
    listCommentaryQuerySchema,
} from "../../validation/commentary.js";
import { desc, eq } from "drizzle-orm";
import {
    bumpCacheVersion,
    getCacheVersion,
    getOrSetJson,
} from "../../redis.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

function commentaryCacheTtl(commentaryList) {
    const newest = commentaryList[0]?.createdAt;
    if (newest && Date.now() - new Date(newest).getTime() < 2 * 60 * 1000) return 5;
    return 30;
}

commentaryRouter.get("/", async (req, res) => {
    const paramsResult = matchParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
        return res
            .status(400)
            .json({ error: "Invalid params.", details: paramsResult.error.issues });
    }

    const queryResult = listCommentaryQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
        return res
            .status(400)
            .json({ error: "Invalid query.", details: queryResult.error.issues });
    }

    const { id: matchId } = paramsResult.data;
    const limit = Math.min(queryResult.data.limit ?? 100, MAX_LIMIT);

    try {
        const version = await getCacheVersion(`commentary:match:${matchId}`);
        const cacheKey = `commentary:match:${matchId}:v${version}:limit:${limit}`;
        const { data, cacheStatus } = await getOrSetJson(cacheKey, commentaryCacheTtl, () =>
            db
                .select()
                .from(commentary)
                .where(eq(commentary.matchId, matchId))
                .orderBy(desc(commentary.createdAt))
                .limit(limit)
        );

        res.set("X-Cache", cacheStatus);
        return res.json({ data });
    } catch (e) {
        console.error("Failed to list commentary", e);
        return res.status(500).json({ error: "Failed to list commentary." });
    }
});

commentaryRouter.post("/", async (req, res) => {
    const paramsResult = matchParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
        return res
            .status(400)
            .json({ error: "Invalid params.", details: paramsResult.error.issues });
    }

    const bodyResult = createCommentarySchema.safeParse(req.body);
    if (!bodyResult.success) {
        return res
            .status(400)
            .json({ error: "Invalid payload.", details: bodyResult.error.issues });
    }

    const { id: matchId } = paramsResult.data;
    const {
        minute,
        sequence,
        period,
        eventType,
        actor,
        team,
        message,
        metadata,
        tags,
    } = bodyResult.data;

    try {
        const [entry] = await db
            .insert(commentary)
            .values({
                matchId,
                minute: minute,
                sequence,
                period,
                eventType,
                actor,
                team,
                message,
                metadata,
                tags,
            })
            .returning();

        if (res.app.locals.broadcastCommentary) {
            res.app.locals.broadcastCommentary(entry.matchId, entry);
        }

        // Cache invalidation must not add latency to the live WebSocket event path.
        void bumpCacheVersion(`commentary:match:${matchId}`);

        return res.status(201).json({ data: entry });
    } catch (e) {
        console.error("Failed to create commentary", e);
        return res.status(500).json({ error: "Failed to create commentary." });
    }
});
