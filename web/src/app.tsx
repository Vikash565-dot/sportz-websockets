import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { BroadcastFlow } from "../components/broadcast-flow";
import { MatchComposer } from "../components/match-composer";
import { MatchLiveDashboard } from "../components/match-live-dashboard";
import { MatchSubscriptionBoard } from "../components/match-subscription-board";
import { fetchApi, getBackendUrl, getWsUrl } from "../lib/config";
import { formatDateTime, formatMatchTiming } from "../lib/format";
import type { Commentary, Match } from "../lib/types";

type ApiResponse<T> = { data: T };
const limit = 100;

function MatchCard({ match }: { match: Match }) {
  return (
    <article className="panel panel-pad grid gap-4 bg-white">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="tag uppercase">{match.sport}</span>
            <span className={`status ${match.status}`}>{match.status}</span>
          </div>
          <h3 className="font-display text-[1.45rem] font-black tracking-tight text-[#202020]">
            {match.homeTeam}<br />{match.awayTeam}
          </h3>
        </div>
        <span className="tag bg-[#111] text-white">#{match.id}</span>
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-dashed border-[#e5e5e5] pt-4">
        <div className="space-y-2"><div className="score">{match.homeScore ?? 0}</div><div className="tiny">Home</div></div>
        <div className="text-center text-sm text-[#666]"><div className="font-semibold uppercase tracking-[0.14em]">Starts</div><div className="text-[#202020]">{formatDateTime(match.startTime)}</div><div>{formatMatchTiming(match.startTime, match.status)}</div></div>
        <div className="justify-self-end space-y-2 text-right"><div className="score">{match.awayScore ?? 0}</div><div className="tiny">Away</div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#555]">Live score and commentary are broadcast to subscribed clients.</span>
        <Link className="btn-secondary" to={`/matches/${match.id}`}>Open live console</Link>
      </div>
    </article>
  );
}

function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [focusMatchId, setFocusMatchId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshMatches = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetchApi<ApiResponse<Match[]>>(`/matches?limit=${limit}`);
      setMatches(Array.isArray(response?.data) ? response.data : []);
      setLastUpdated(new Date());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load matches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refreshMatches(); }, [refreshMatches]);

  const upsertMatch = useCallback((next: Match) => {
    setMatches((current) => {
      const existing = current.some((match) => match.id === next.id);
      const updated = existing ? current.map((match) => match.id === next.id ? { ...match, ...next } : match) : [next, ...current];
      return updated.sort((a, b) => new Date(b.createdAt ?? b.startTime).getTime() - new Date(a.createdAt ?? a.startTime).getTime());
    });
  }, []);

  const handleMatchCreated = useCallback((match: Match) => {
    upsertMatch(match);
    setFocusMatchId(match.id);
    setLastUpdated(new Date());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [upsertMatch]);

  const liveMatches = matches.filter((match) => match.status === "live").length;
  const connectionLabel = loading ? "Checking API" : error ? "API unavailable" : "API reachable";

  return (
    <>
      <header className="panel flex flex-wrap items-center justify-between gap-5 bg-[#f5d447] p-5 sm:p-6">
        <div className="flex items-center gap-4"><div className="brand-mark">S</div><div>
          <p className="tiny">REAL-TIME SPORTS DATA</p><h1 className="font-display text-3xl font-black tracking-tight text-[#202020]">SportZ Broadcast Engine</h1>
          <p className="max-w-2xl text-sm font-medium text-[#202020]">A live view of event ingestion, durable delivery, and match-room fan-out.</p>
        </div></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`status ${loading ? "scheduled" : error ? "ended" : "live"}`}>{connectionLabel}</span>
          <button className="toolbar-button" onClick={() => void refreshMatches(true)} disabled={refreshing} type="button">{refreshing ? "Refreshing…" : "Refresh matches"}</button>
        </div>
      </header>

      <BroadcastFlow />

      <MatchSubscriptionBoard initialMatches={matches} wsUrl={getWsUrl()} onMatchEvent={upsertMatch} focusMatchId={focusMatchId} />

      <section id="matches" className="mt-8">
        <div className="section-header"><div><h2 className="section-title">Match registry</h2><p className="section-subtitle">Fixtures currently available through the REST API. Select one above to observe its WebSocket room.</p></div>
          <div className="flex flex-wrap items-center gap-2"><span className="tag">{matches.length} matches</span><span className="tag">{liveMatches} live</span>{lastUpdated && <span className="tag">Synced {lastUpdated.toLocaleTimeString()}</span>}</div>
        </div>
        {error && <div className="message-error mb-4" role="alert">Could not reach the match API: {error}. Check that the backend is running and reachable from this app.</div>}
        <div className="grid gap-4 lg:grid-cols-2">
          {loading ? <div className="empty-state lg:col-span-2">Loading matches from the API…</div>
            : matches.length ? matches.map((match) => <MatchCard key={match.id} match={match} />)
              : <div className="empty-state lg:col-span-2">{error ? "The registry is unavailable until the backend reconnects." : "No matches yet. Create a fixture below to start a broadcast."}</div>}
        </div>
      </section>

      <section id="create-match" className="mt-8">
        <div className="section-header"><div><h2 className="section-title">Start a broadcast</h2><p className="section-subtitle">Create a fixture, subscribe to its room, then post commentary to watch the score and feed update live.</p></div><span className="tag">REST · POST /matches</span></div>
        <MatchComposer onCreated={handleMatchCreated} />
      </section>

      <footer className="mt-8 border-t-2 border-[#202020] py-5 text-xs font-medium text-[#666]">
        REST API <code>{getBackendUrl()}</code><span className="mx-2">·</span>WebSocket <code>{getWsUrl()}</code><span className="mx-2">·</span>Last sync {lastUpdated ? lastUpdated.toLocaleTimeString() : "not yet"}
      </footer>
    </>
  );
}

function MatchPage() {
  const { id = "" } = useParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [commentary, setCommentary] = useState<Commentary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchApi<ApiResponse<Match[]>>(`/matches?limit=${limit}`),
      fetchApi<ApiResponse<Commentary[]>>(`/matches/${id}/commentary?limit=100`),
    ]).then(([matchResponse, commentaryResponse]) => {
      if (!active) return;
      const found = (matchResponse.data || []).find((item) => String(item.id) === id) || null;
      setMatch(found);
      setCommentary(Array.isArray(commentaryResponse.data) ? commentaryResponse.data : []);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Could not load match");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <><BackToHome /><div className="empty-state">Loading match and event history…</div></>;
  if (error) return <><BackToHome /><div className="message-error" role="alert">{error}</div></>;
  if (!match) return <><BackToHome /><div className="empty-state">Match #{id} was not found in the latest {limit} fixtures.</div></>;
  return <>
    <header className="panel mb-6 flex flex-wrap items-center justify-between gap-4 bg-[#f5d447] p-5"><BackToHome /><div className="text-right"><p className="tiny">SPORTZ BROADCAST ENGINE</p><p className="font-display text-xl font-black">Match room · #{match.id}</p></div></header>
    <MatchLiveDashboard initialMatch={match} initialCommentary={commentary} wsUrl={getWsUrl()} />
  </>;
}

function BackToHome() { return <Link className="backlink mb-0" to="/">← Broadcast overview</Link>; }

export default function App() {
  return <main className="app-shell"><Routes><Route path="/" element={<HomePage />} /><Route path="/matches/:id" element={<MatchPage />} /><Route path="*" element={<HomePage />} /></Routes></main>;
}
