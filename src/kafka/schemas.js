import { z } from "zod";

export const matchEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.string().trim().min(1),
    sport: z.string().trim().min(1),
    matchId: z.string().trim().min(1),
    timestamp: z.string().datetime(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export function parseMatchEvent(value) {
  try {
    const rawEvent = JSON.parse(value.toString());
    const parsed = matchEventSchema.safeParse(rawEvent);

    if (!parsed.success) {
      console.error("Ignoring invalid Kafka match event:", parsed.error.issues);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error("Ignoring malformed Kafka message:", error.message);
    return null;
  }
}
