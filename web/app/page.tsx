import Link from "next/link";
import { MatchSubscriptionBoard } from "../components/match-subscription-board";
import { fetchApi, getBackendUrl, getWsUrl } from "../lib/config";
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

type ApiResponse<T> = { data: T };

const DEFAULT_LIMIT = 12;

const sampleMatchJson = `{
  "sport": "Football",
  "homeTeam": "Mumbai City FC",
  "awayTeam": "Bengaluru FC",
  "startTime": "2026-12-25T14:00:00.000Z",
  "endTime": "2026-12-25T16:00:00.000Z",
  "homeScore": 0,
  "awayScore": 0
}`;

const sampleCommentaryJson = `{
  "minute": 35,
  "sequence": 1,
  "period": "First Half",
  "eventType": "goal",
  "actor": "Jorge Pereyra Diaz",
  "team": "Mumbai City FC",
  "message": "hi",
  "metadata": {
    "homeScore": 2,
    "awayScore": 0
  },
  "tags": ["goal", "score"]
}`;

const postmanSteps = [
  {
    title: "Create match",
    method: "POST",
    path: "/matches",
    note: "Use this first. The response gives you the match id.",
    body: sampleMatchJson,
  },
  {
    title: "Add commentary and score",
    method: "POST",
    path: "/matches/:id/commentary",
    note: "Replace :id with the match id. Scores update from metadata.",
    body: sampleCommentaryJson,
  },
  {
    title: "Read data",
    method: "GET",
    path: "/matches and /matches/:id/commentary",
    note: "Use these to confirm the match, commentary, and scores were saved.",
    body: null,
  },
];

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#555]">Updated through REST and WebSocket broadcasts.</span>
        <Link className="btn-secondary" href={`/matches/${match.id}`}>
          Open match
        </Link>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const response = await fetchApi<ApiResponse<Match[]>>(`/matches?limit=${DEFAULT_LIMIT}`);
  const matches = Array.isArray(response?.data) ? response.data : [];
  const backendUrl = getBackendUrl();

  return (
    <>
      <header className="panel flex flex-wrap items-center justify-between gap-5 bg-[#f5d447] p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="brand-mark">S</div>
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-[#202020]">SportZ</h1>
            <p className="max-w-2xl text-sm font-medium text-[#202020]">
              Real-time match data demo. API: {backendUrl}.
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          <span className="chip bg-white">Live connected</span>
        </nav>
      </header>

      <MatchSubscriptionBoard initialMatches={matches} wsUrl={getWsUrl()} />

      <section id="matches" className="mt-6">
        <div className="section-header">
          <div>
            <h2 className="section-title">Latest fixtures</h2>
            <p className="section-subtitle">Most recent matches returned by the backend.</p>
          </div>
          <span className="tag">Limit {DEFAULT_LIMIT}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {matches.length > 0 ? (
            matches.map((match) => <MatchCard key={match.id} match={match} />)
          ) : (
            <div className="empty-state">No matches yet. Create matches via API (e.g., Postman to POST /matches).</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="section-header">
          <div>
            <h2 className="section-title">Postman Backend Guide</h2>
            <p className="section-subtitle">
              Set Postman to raw JSON with this base URL: <span className="font-black text-[#202020]">{backendUrl}</span>
            </p>
          </div>
          <span className="tag">Postman</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {postmanSteps.map((step) => (
            <article key={step.title} className="panel panel-pad bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="tag bg-[#111] text-white">{step.method}</span>
                <span className="tag">{step.path}</span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-black text-[#202020]">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#575757]">{step.note}</p>
              {step.body ? (
                <pre className="mt-4 overflow-x-auto rounded-2xl border-[2px] border-[#202020] bg-[#202020] p-4 text-xs leading-5 text-white">
                  <code>{step.body}</code>
                </pre>
              ) : (
                <div className="mt-4 rounded-2xl border-[2px] border-dashed border-[#202020] bg-[#faf8f1] p-4 text-sm font-semibold text-[#555]">
                  No request body needed for GET requests.
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 rounded-[24px] border-[3px] border-[#202020] bg-[#f5d447] p-5 shadow-[4px_5px_0_0_rgba(0,0,0,0.9)]">
          <h3 className="font-display text-xl font-black text-[#202020]">Tiny score example</h3>
          <pre className="mt-3 overflow-x-auto rounded-2xl border-[2px] border-[#202020] bg-white p-4 text-xs leading-5 text-[#202020]">
            <code>{`{
  "message": "hi",
  "metadata": {
    "homeScore": 2,
    "awayScore": 0
  }
}`}</code>
          </pre>
        </div>
      </section>
    </>
  );
}
