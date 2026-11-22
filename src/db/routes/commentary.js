import { Router } from "express";
import { db } from "../db.js";
import { commentary, matches } from "../schema.js";
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
import { getMatchStatus } from "../../utils/match-status.js";
import { createCommentaryInStore, listCommentary } from "../fallback-store.js";
import { commentaryCreatedEvent, matchUpdatedEvent } from "../../kafka/events.js";
import { enqueueOutboxEvent, flushOutboxEvents } from "../../kafka/outbox.js";

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
        const { data, cacheStatus } = await getOrSetJson(cacheKey, commentaryCacheTtl, async () => {
            try {
                return await db
                    .select()
                    .from(commentary)
                    .where(eq(commentary.matchId, matchId))
                    .orderBy(desc(commentary.createdAt))
                    .limit(limit);
            } catch (dbError) {
                console.warn("Database unavailable for commentary, using fallback store", dbError.message);
                return listCommentary(matchId, limit);
            }
        });

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
        let entry;
        let updatedMatch = null;
        let persistedInPostgres = true;

        try {
            ({ entry, updatedMatch } = await db.transaction(async (tx) => {
                const [createdCommentary] = await tx
                    .insert(commentary)
                    .values({
                        matchId,
                        minute,
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

                const scoreUpdates = {};
                const homeScore = Number(metadata?.homeScore);
                const awayScore = Number(metadata?.awayScore);

                if (Number.isFinite(homeScore)) scoreUpdates.homeScore = homeScore;
                if (Number.isFinite(awayScore)) scoreUpdates.awayScore = awayScore;

                const [currentMatch] = await tx
                    .select()
                    .from(matches)
                    .where(eq(matches.id, matchId))
                    .limit(1);

                if (currentMatch) {
                    const nextStatus = getMatchStatus(currentMatch.startTime, currentMatch.endTime);
                    if (nextStatus && nextStatus !== currentMatch.status) scoreUpdates.status = nextStatus;
                }

                let changedMatch = null;
                if (Object.keys(scoreUpdates).length > 0) {
                    [changedMatch] = await tx
                        .update(matches)
                        .set(scoreUpdates)
                        .where(eq(matches.id, matchId))
                        .returning();
                }

                const eventMatch = changedMatch ?? currentMatch ?? { id: matchId, sport: "unknown" };
                await enqueueOutboxEvent(tx, commentaryCreatedEvent(eventMatch, createdCommentary));
                if (changedMatch) await enqueueOutboxEvent(tx, matchUpdatedEvent(changedMatch));

                return { entry: createdCommentary, updatedMatch: changedMatch };
            }));
        } catch (dbError) {
            console.warn("Database unavailable for commentary insert, using fallback store", dbError.message);
            persistedInPostgres = false;
            ({ entry } = await createCommentaryInStore(matchId, {
                minute,
                sequence,
                period,
                eventType,
                actor,
                team,
                message,
                metadata,
                tags,
            }));
        }

        if (persistedInPostgres) {
            void flushOutboxEvents().catch((error) => console.error("Outbox flush failed:", error.message));
        } else if (res.app.locals.broadcastCommentary) {
            await res.app.locals.broadcastCommentary(entry.matchId, entry);
            if (updatedMatch && res.app.locals.broadcastMatchUpdated) {
                await res.app.locals.broadcastMatchUpdated(updatedMatch);
            }
        }

        // Cache invalidation must not add latency to the live WebSocket event path.
        void bumpCacheVersion(`commentary:match:${matchId}`);
        void bumpCacheVersion("matches:list");

        return res.status(201).json({ data: entry });
    } catch (e) {
        console.error("Failed to create commentary", e);
        return res.status(500).json({ error: "Failed to create commentary." });
    }
});
