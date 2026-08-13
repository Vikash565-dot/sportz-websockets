import { notFound } from "next/navigation";
import { MatchLiveDashboard } from "../../../components/match-live-dashboard";
import { fetchApi, getBackendUrl, getWsUrl } from "../../../lib/config";

type Match = {
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

type Commentary = {
  id: number;
  matchId: number;
  minute?: number;
  sequence?: number;
  period?: string;
  eventType?: string;
  actor?: string;
  team?: string;
  message?: string;
  createdAt?: string;
};

type ApiResponse<T> = { data: T };

async function getMatch(id: string) {
  const response = await fetchApi<ApiResponse<Match[]>>(`/matches?limit=100`);
  const matches = Array.isArray(response?.data) ? response.data : [];
  return matches.find((match) => String(match.id) === String(id)) || null;
}

async function getCommentary(id: string) {
  const response = await fetchApi<ApiResponse<Commentary[]>>(`/matches/${id}/commentary?limit=100`);
  return Array.isArray(response?.data) ? response.data : [];
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match, commentary] = await Promise.all([getMatch(id), getCommentary(id)]);

  if (!match) {
    notFound();
  }

  return <MatchLiveDashboard initialMatch={match} initialCommentary={commentary} wsUrl={getWsUrl()} />;
}