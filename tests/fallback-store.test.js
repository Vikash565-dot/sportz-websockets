import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatchInStore,
  createCommentaryInStore,
  listCommentary,
  listMatches,
  resetFallbackStore,
} from "../src/db/fallback-store.js";

test("fallback store keeps matches and commentary available in memory", async () => {
  resetFallbackStore();

  const match = await createMatchInStore({
    sport: "Football",
    homeTeam: "Alpha",
    awayTeam: "Beta",
    startTime: "2026-08-11T10:00:00.000Z",
    endTime: "2026-08-11T12:00:00.000Z",
    homeScore: 0,
    awayScore: 0,
  });

  assert.equal(match.homeTeam, "Alpha");

  const matches = await listMatches(10);
  assert.ok(matches.some((item) => item.id === match.id));

  const commentary = await createCommentaryInStore(match.id, {
    minute: 10,
    sequence: 1,
    period: "First Half",
    eventType: "goal",
    actor: "Player",
    team: "Alpha",
    message: "Goal!",
    metadata: { homeScore: 1, awayScore: 0 },
    tags: ["goal"],
  });

  assert.equal(commentary.entry.message, "Goal!");

  const commentaryList = await listCommentary(match.id, 10);
  assert.ok(commentaryList.some((item) => item.id === commentary.entry.id));
});
