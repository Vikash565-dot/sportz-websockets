'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatRelativeTime } from "../lib/format";

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
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

type SocketStatus = "idle" | "connecting" | "subscribed" | "closed" | "error";

function sortMatches(matches: Match[]) {
  return [...matches].sort((left, right) => {
    return new Date(right.createdAt ?? right.startTime).getTime() - new Date(left.createdAt ?? left.startTime).getTime();
  });
}

function applyScoreFromCommentary(match: Match, commentary: Commentary) {
  const metadata = commentary.metadata ?? {};
  const homeScore = Number(metadata.homeScore);
  const awayScore = Number(metadata.awayScore);

  return {
    ...match,
    ...(Number.isFinite(homeScore) ? { homeScore } : null),
    ...(Number.isFinite(awayScore) ? { awayScore } : null),
  };
}

function upsertMatch(matches: Match[], nextMatch: Match) {
  const found = matches.some((match) => match.id === nextMatch.id);
  const nextMatches = found ? matches.map((match) => (match.id === nextMatch.id ? nextMatch : match)) : [nextMatch, ...matches];
  return sortMatches(nextMatches);
}

function statusLabel(status: SocketStatus) {
  if (status === "subscribed") return "subscribed";
  if (status === "connecting") return "connecting";
  if (status === "error") return "connection error";
  if (status === "closed") return "disconnected";
  return "select match";
}

function MatchButton({
  match,
  isSelected,
  onSelect,
}: {
  match: Match;
  isSelected: boolean;
  onSelect: (match: Match) => void;
}) {
  return (
    <article className={`panel panel-pad grid gap-4 bg-white ${isSelected ? "ring-4 ring-[#f5d447]" : ""}`}>
      <button type="button" className="grid gap-4 text-left" onClick={() => onSelect(match)}>
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="tag uppercase">{match.sport}</span>
              <span className={`status ${match.status}`}>{match.status}</span>
            </div>
            <h3 className="font-display text-[1.45rem] font-black tracking-tight text-[#202020]">
              {match.homeTeam}
              <br />
              {match.awayTeam}
            </h3>
          </div>
          <span className="tag bg-[#111] text-white">#{match.id}</span>
        </header>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-dashed border-[#e5e5e5] pt-4">
          <div className="space-y-2">
            <div className="score">{match.homeScore ?? 0}</div>
            <div className="tiny">Home</div>
          </div>
          <div className="text-center text-sm text-[#666]">
            <div className="font-semibold uppercase tracking-[0.14em]">Starts</div>
            <div className="text-[#202020]">{formatDateTime(match.startTime)}</div>
            <div>{formatRelativeTime(match.startTime)} away</div>
          </div>
          <div className="justify-self-end space-y-2 text-right">
            <div className="score">{match.awayScore ?? 0}</div>
            <div className="tiny">Away</div>
          </div>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#555]">{isSelected ? "Subscribed on the right panel." : "Click to subscribe via pub/sub."}</span>
        <Link className="btn-secondary" href={`/matches/${match.id}`}>
          Open match
        </Link>
      </div>
    </article>
  );
}

export function MatchSubscriptionBoard({ initialMatches, wsUrl }: { initialMatches: Match[]; wsUrl: string }) {
  const [matches, setMatches] = useState(() => sortMatches(initialMatches));
  const [selectedId, setSelectedId] = useState<number | null>(initialMatches[0]?.id ?? null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>(initialMatches[0] ? "connecting" : "idle");
  const [liveCommentary, setLiveCommentary] = useState<Commentary[]>([]);

  const selectedMatch = useMemo(() => matches.find((match) => match.id === selectedId) ?? null, [matches, selectedId]);
  const liveCount = matches.filter((match) => match.status === "live").length;

  useEffect(() => {
    if (!selectedMatch) {
      setSocketStatus("idle");
      return;
    }

    setSocketStatus("connecting");
    setLiveCommentary([]);

    const socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", matchId: selectedMatch.id }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          matchId?: number;
          data?: Match | Commentary;
        };

        if (payload.type === "subscribed" && payload.matchId === selectedMatch.id) {
          setSocketStatus("subscribed");
          return;
        }

        if (payload.type === "match_created" && payload.data) {
          setMatches((current) => upsertMatch(current, payload.data as Match));
          return;
        }

        if (payload.type === "match_updated" && payload.data) {
          setMatches((current) => upsertMatch(current, payload.data as Match));
          return;
        }

        if (payload.type === "commentary" && payload.matchId === selectedMatch.id && payload.data) {
          const commentary = payload.data as Commentary;
          setLiveCommentary((current) => [commentary, ...current].slice(0, 8));
          setMatches((current) =>
            current.map((match) => (match.id === selectedMatch.id ? applyScoreFromCommentary(match, commentary) : match)),
          );
        }
      } catch {
        // Ignore malformed websocket frames from the browser client.
      }
    });

    socket.addEventListener("close", () => setSocketStatus("closed"));
    socket.addEventListener("error", () => setSocketStatus("error"));

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "unsubscribe", matchId: selectedMatch.id }));
      }
      socket.close();
    };
  }, [selectedMatch?.id, wsUrl]);

  return (
    <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="section-title">Current Matches</h2>
          </div>
          <span className="tag bg-[#111] text-white">API: {matches.length}</span>
        </div>

        <div className="mb-4 rounded-[24px] border-[3px] border-[#202020] bg-[#f5d447] px-4 py-3 shadow-[4px_5px_0_0_rgba(0,0,0,0.9)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-lg font-black text-[#202020]">{liveCount} live matches ready for subscription</div>
            <span className="tag bg-white">Redis pub/sub safe</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {matches.length > 0 ? (
            matches.map((match) => (
              <MatchButton
                key={match.id}
                match={match}
                isSelected={match.id === selectedId}
                onSelect={(nextMatch) => setSelectedId(nextMatch.id)}
              />
            ))
          ) : (
            <div className="empty-state md:col-span-2">No matches yet. Create matches via API, then click a match to subscribe.</div>
          )}
        </div>
      </div>

      <aside className="rounded-[28px] border-[3px] border-dashed border-[#202020] bg-[#f7f7f5] p-6">
        {selectedMatch ? (
          <div className="flex h-full min-h-[620px] flex-col">
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className={`status ${socketStatus === "subscribed" ? "live" : "scheduled"}`}>{statusLabel(socketStatus)}</span>
              <span className="tag bg-white">#{selectedMatch.id}</span>
            </div>

            <h3 className="font-display text-2xl font-black text-[#202020]">{selectedMatch.homeTeam}</h3>
            <p className="font-display text-2xl font-black text-[#202020]">{selectedMatch.awayTeam}</p>

            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <div className="score">{selectedMatch.homeScore ?? 0}</div>
                <div className="tiny mt-2">Home</div>
              </div>
              <span className="tiny text-center">live score</span>
              <div className="justify-self-end text-right">
                <div className="score">{selectedMatch.awayScore ?? 0}</div>
                <div className="tiny mt-2">Away</div>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-[#666]">
              The browser is subscribed to this match over WebSocket. Redis pub/sub fan-out stays in the backend broadcast path.
            </p>

            <div className="mt-5 grid gap-3">
              {liveCommentary.length > 0 ? (
                liveCommentary.map((item) => (
                  <article key={`${item.id}-${item.sequence ?? item.createdAt}`} className="feed-item shadow-none">
                    <header>
                      <span>{item.eventType ?? "update"}</span>
                      <span>{item.minute != null ? `${item.minute}'` : ""}</span>
                    </header>
                    <p>{item.message}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state">Subscribed. New commentary for this match will appear here.</div>
              )}
            </div>

            <Link className="btn-primary mt-5" href={`/matches/${selectedMatch.id}`}>
              Open full live console
            </Link>
          </div>
        ) : (
          <div className="flex h-full min-h-[620px] flex-col items-center justify-center text-center">
            <div className="mb-5 grid h-20 w-20 place-items-center rounded-full border-[3px] border-[#202020] bg-[#f5d447] text-3xl shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              ▶
            </div>
            <h3 className="font-display text-2xl font-black text-[#202020]">No Match Selected</h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-[#666]">Select a match to subscribe to its live updates.</p>
          </div>
        )}
      </aside>
    </section>
  );
}
