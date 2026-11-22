export type Match = {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  startTime: string;
  createdAt?: string;
  homeScore?: number;
  awayScore?: number;
};

export type Commentary = {
  id: number;
  matchId: number;
  minute?: number;
  sequence?: number;
  period?: string;
  eventType?: string;
  actor?: string;
  team?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt?: string;
};
