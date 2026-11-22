import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { outboxEvents } from "../db/schema.js";
import { matchEventSchema } from "./schemas.js";
import { MATCH_EVENTS_TOPIC } from "./topics.js";
import { publishMatchEvent } from "./producer.js";

const RETRY_DELAY_MS = 5_000;
const STALE_LOCK_MS = 5 * 60 * 1_000;
const relayId = `sportz-api-${process.pid}-${randomUUID()}`;
let relayTimer;
let isFlushing = false;

export function createOutboxRecord(event) {
  const parsed = matchEventSchema.parse(event);
  return {
    id: parsed.eventId,
    topic: MATCH_EVENTS_TOPIC,
    messageKey: parsed.matchId,
    payload: parsed,
  };
}

export async function enqueueOutboxEvent(tx, event) {
  const record = createOutboxRecord(event);
  await tx.insert(outboxEvents).values(record);
  return record;
}

async function claimPendingEvents(limit) {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT id
      FROM outbox_events
      WHERE published_at IS NULL
        AND next_attempt_at <= NOW()
        AND (locked_at IS NULL OR locked_at < ${staleBefore})
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events
    SET locked_at = NOW(), locked_by = ${relayId}, attempts = attempts + 1
    WHERE id IN (SELECT id FROM candidates)
    RETURNING id, payload
  `);

  return result.rows;
}

async function markPublished(id) {
  await db
    .update(outboxEvents)
    .set({ publishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null })
    .where(and(eq(outboxEvents.id, id), eq(outboxEvents.lockedBy, relayId)));
}

async function reschedule(id, error) {
  await db
    .update(outboxEvents)
    .set({
      lockedAt: null,
      lockedBy: null,
      lastError: error.message,
      nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
    })
    .where(and(eq(outboxEvents.id, id), eq(outboxEvents.lockedBy, relayId)));
}

export async function flushOutboxEvents(limit = 50) {
  if (isFlushing) return 0;
  isFlushing = true;

  try {
    const pending = await claimPendingEvents(limit);
    let published = 0;

    for (const row of pending) {
      try {
        const sent = await publishMatchEvent(row.payload);
        if (!sent) throw new Error("Kafka producer is unavailable");
        await markPublished(row.id);
        published += 1;
      } catch (error) {
        console.error(`Outbox event ${row.id} was not published:`, error.message);
        await reschedule(row.id, error);
      }
    }

    return published;
  } finally {
    isFlushing = false;
  }
}

export function startOutboxRelay(intervalMs = 1_000) {
  if (relayTimer) return;
  relayTimer = setInterval(() => {
    void flushOutboxEvents().catch((error) => console.error("Outbox relay failed:", error.message));
  }, intervalMs);
  relayTimer.unref();
  void flushOutboxEvents().catch((error) => console.error("Initial outbox relay failed:", error.message));
}

export function stopOutboxRelay() {
  if (relayTimer) clearInterval(relayTimer);
  relayTimer = undefined;
}
