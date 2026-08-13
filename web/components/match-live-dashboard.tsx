'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { CommentaryConsole } from "./commentary-console";
import { formatDateTime } from "../lib/format";

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

type LiveEvent =
  | { type: "commentary"; commentary: Commentary }
  | { type: "match_updated"; match: Match };

function extractScores(commentary: Commentary) {
  const metadata = commentary.metadata ?? {};
  const homeScore = Number(metadata.homeScore);
  const awayScore = Number(metadata.awayScore);

  return {
    homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
    awayScore: Number.isFinite(awayScore) ? awayScore : undefined,
  };
}

export function MatchLiveDashboard({
  initialMatch,
  initialCommentary,
  wsUrl,
}: {
  initialMatch: Match;
  initialCommentary: Commentary[];
  wsUrl: string;
}) {
  const [match, setMatch] = useState(initialMatch);

  useEffect(() => {
    setMatch(initialMatch);
  }, [initialMatch]);

  function handleLiveEvent(event: LiveEvent) {
    if (event.type === "match_updated") {
      setMatch(event.match);
      return;
    }

    const nextScores = extractScores(event.commentary);

    if (nextScores.homeScore === undefined && nextScores.awayScore === undefined) {
      return;
    }

    setMatch((current) => ({
      ...current,
      ...(nextScores.homeScore !== undefined ? { homeScore: nextScores.homeScore } : null),
      ...(nextScores.awayScore !== undefined ? { awayScore: nextScores.awayScore } : null),
    }));
  }

  return (
    <>
      <Link className="backlink" href="/">
        ← Back to fixtures
      </Link>

      <section className="mt-0 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="section-title">Match Details</h2>
            </div>
            <span className="tag bg-[#111] text-white">API: {match.id}</span>
          </div>

          <div className="panel panel-pad bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="tag uppercase">{match.sport}</span>
                <span className={`status ${match.status}`}>{match.status}</span>
              </div>
              <span className="tag bg-[#111] text-white">#{match.id}</span>
            </div>

            <h2 className="mt-4 font-display text-4xl font-black tracking-tight text-[#202020] sm:text-5xl">
              {match.homeTeam}
              <br />
              {match.awayTeam}
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#575757]">
              Scheduled for {formatDateTime(match.startTime)}. Created {formatDateTime(match.createdAt)}.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="tag">Live updates enabled</span>
              <span className="tag">WS: {wsUrl}</span>
              <span className="tag">Commentary metadata drives scores</span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="panel panel-pad bg-white">
              <div className="tiny">Home score</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <strong className="font-display text-4xl font-black text-[#202020]">{match.homeScore ?? 0}</strong>
                <span className="score">{match.homeScore ?? 0}</span>
              </div>
            </div>
            <div className="panel panel-pad bg-white">
              <div className="tiny">Match</div>
              <div className="mt-2 font-display text-2xl font-black text-[#202020]">{match.id}</div>
              <p className="mt-2 text-sm text-[#666]">Broadcast ready</p>
            </div>
            <div className="panel panel-pad bg-white">
              <div className="tiny">Away score</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <strong className="font-display text-4xl font-black text-[#202020]">{match.awayScore ?? 0}</strong>
                <span className="score">{match.awayScore ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-[28px] border-[3px] border-dashed border-[#202020] bg-[#f7f7f5] p-6">
          <div className="flex h-full min-h-[620px] flex-col items-center justify-center text-center">
            <div className="mb-5 grid h-20 w-20 place-items-center rounded-full border-[3px] border-[#202020] bg-[#f5d447] text-3xl shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              ●
            </div>
            <h3 className="font-display text-2xl font-black text-[#202020]">Live Commentary</h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-[#666]">
              Subscribed clients receive commentary updates as soon as the backend broadcasts them.
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-6">
        <div className="section-header">
          <div>
            <h2 className="section-title">Live commentary</h2>
            <p className="section-subtitle">
              Server-rendered history with a websocket subscription layered on top for fresh events.
            </p>
          </div>
        </div>

        <CommentaryConsole
          matchId={match.id}
          initialCommentary={initialCommentary}
          wsUrl={wsUrl}
          onLiveEvent={handleLiveEvent}
        />
      </section>
    </>
  );
}