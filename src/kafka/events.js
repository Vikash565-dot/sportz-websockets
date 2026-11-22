import { randomUUID } from "node:crypto";

function envelope(match, eventType, payload) {
  return {
    eventId: randomUUID(),
    eventType,
    sport: String(match.sport || "unknown").trim().toLowerCase(),
    matchId: String(match.id),
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function matchCreatedEvent(match) {
  return envelope(match, "MATCH_CREATED", { type: "MATCH_CREATED", match });
}

export function commentaryCreatedEvent(match, commentary) {
  return envelope(match, "COMMENTARY_CREATED", { type: "COMMENTARY_CREATED", commentary });
}

export function matchUpdatedEvent(match) {
  return envelope(match, "MATCH_UPDATED", { type: "MATCH_UPDATED", match });
}
