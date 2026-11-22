const fallbackState = {
  matches: [],
  commentary: [],
  nextMatchId: 1,
  nextCommentaryId: 1,
};

function normalizeMatch(input) {
  const startTime = input.startTime instanceof Date ? input.startTime.toISOString() : input.startTime;
  const endTime = input.endTime instanceof Date ? input.endTime.toISOString() : input.endTime;

  return {
    id: fallbackState.nextMatchId++,
    sport: input.sport,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    status: input.status || "scheduled",
    startTime,
    endTime,
    homeScore: input.homeScore ?? 0,
    awayScore: input.awayScore ?? 0,
    createdAt: new Date().toISOString(),
  };
}

export function resetFallbackStore() {
  fallbackState.matches = [];
  fallbackState.commentary = [];
  fallbackState.nextMatchId = 1;
  fallbackState.nextCommentaryId = 1;
}

export async function listMatches(limit = 50) {
  return fallbackState.matches.slice(0, limit).reverse();
}

export async function createMatchInStore(input) {
  const match = normalizeMatch(input);
  fallbackState.matches.push(match);
  return match;
}

export async function listCommentary(matchId, limit = 100) {
  return fallbackState.commentary
    .filter((item) => item.matchId === matchId)
    .slice(0, limit)
    .reverse();
}

export async function createCommentaryInStore(matchId, input) {
  const entry = {
    id: fallbackState.nextCommentaryId++,
    matchId,
    minute: input.minute,
    sequence: input.sequence,
    period: input.period,
    eventType: input.eventType,
    actor: input.actor,
    team: input.team,
    message: input.message,
    metadata: input.metadata ?? null,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
  };

  fallbackState.commentary.push(entry);
  return { entry };
}
