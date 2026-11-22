import { useEffect, useState } from "react";
import { CommentaryConsole } from "./commentary-console";
import { formatDateTime } from "../lib/format";
import type { Commentary, Match } from "../lib/types";

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
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => setMatch(initialMatch), [initialMatch]);

  function handleLiveEvent(event: LiveEvent) {
    if (event.type === "match_updated") {
      setMatch(event.match);
      return;
    }
    const nextScores = extractScores(event.commentary);
    if (nextScores.homeScore === undefined && nextScores.awayScore === undefined) return;
    setMatch((current) => ({
      ...current,
      ...(nextScores.homeScore !== undefined ? { homeScore: nextScores.homeScore } : null),
      ...(nextScores.awayScore !== undefined ? { awayScore: nextScores.awayScore } : null),
    }));
  }

  return (
    <>
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="section-header"><div><p className="tiny">MATCH ROOM · {match.sport.toUpperCase()}</p><h2 className="section-title">{match.homeTeam} <span className="text-[#999]">vs</span> {match.awayTeam}</h2></div><span className={`status ${match.status === "live" ? "live" : "scheduled"}`}>{match.status}</span></div>
          <div className="panel panel-pad bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="tiny">LIVE SCOREBOARD</span><span className="tag bg-[#111] text-white">MATCH #{match.id}</span></div>
            <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-5 sm:gap-8">
              <div><p className="truncate text-sm font-bold text-[#555]">{match.homeTeam}</p><strong className="mt-2 block font-display text-7xl font-black leading-none text-[#202020] sm:text-8xl">{match.homeScore ?? 0}</strong><span className="tiny">HOME</span></div>
              <span className="font-display text-2xl font-black text-[#aaa]">–</span>
              <div className="text-right"><p className="truncate text-sm font-bold text-[#555]">{match.awayTeam}</p><strong className="mt-2 block font-display text-7xl font-black leading-none text-[#202020] sm:text-8xl">{match.awayScore ?? 0}</strong><span className="tiny">AWAY</span></div>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#ddd] pt-4"><span className="text-sm text-[#666]">Scheduled {formatDateTime(match.startTime)}</span><span className="text-sm text-[#666]">Created {formatDateTime(match.createdAt)}</span></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="panel panel-pad bg-white"><div className="tiny">Match status</div><strong className="mt-2 block text-lg font-black capitalize">{match.status}</strong><span className="text-xs text-[#666]">Calculated from start and end time</span></div>
            <div className="panel panel-pad bg-white"><div className="tiny">Event channel</div><strong className="mt-2 block text-lg font-black">match-events</strong><span className="text-xs text-[#666]">Kafka topic · per-match key</span></div>
            <div className="panel panel-pad bg-white"><div className="tiny">Browser transport</div><strong className="mt-2 block text-lg font-black">WebSocket</strong><span className="text-xs text-[#666]">Room subscription · /ws</span></div>
          </div>
        </div>

        <aside className="panel panel-pad flex flex-col bg-[#f5d447]">
          <div className="flex items-center justify-between gap-3"><span className="tiny text-[#202020]">ROOM CONNECTION</span><span className={`status ${isSubscribed ? "live" : "scheduled"}`}>{isSubscribed ? "subscribed" : "connecting"}</span></div>
          <h3 className="mt-6 font-display text-2xl font-black">Match-scoped delivery</h3>
          <p className="mt-3 text-sm leading-6 text-[#3e3a2b]">This browser joins room <b>#{match.id}</b>. Commentary for other match IDs is ignored by the client.</p>
          <div className="mt-5 rounded-2xl border-2 border-[#202020] bg-white p-4">
            <p className="tiny">SUBSCRIBE MESSAGE</p>
            <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[#202020]"><code>{JSON.stringify({ type: "subscribe", matchId: match.id }, null, 2)}</code></pre>
          </div>
          <div className="mt-4 rounded-2xl border-2 border-[#202020] bg-white p-4">
            <p className="tiny">COMMENTARY EVENT</p>
            <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[#202020]"><code>{JSON.stringify({ type: "commentary", matchId: match.id, data: { sequence: 12, eventType: "goal", metadata: { homeScore: 1, awayScore: 0 } } }, null, 2)}</code></pre>
          </div>
          <p className="mt-auto pt-5 text-xs leading-5 text-[#555]">Score changes are read from commentary metadata, persisted by the API, then broadcast to room subscribers.</p>
        </aside>
      </section>

      <section className="mt-8">
        <div className="section-header"><div><h2 className="section-title">Commentary console</h2><p className="section-subtitle">Post a play-by-play event. Other clients subscribed to this match receive it over the live channel.</p></div><span className="tag">REST write · WS delivery</span></div>
        <CommentaryConsole matchId={match.id} initialCommentary={initialCommentary} wsUrl={wsUrl} onConnectionChange={setIsSubscribed} onLiveEvent={handleLiveEvent} />
      </section>
    </>
  );
}
