'use client';

import { useState, useTransition } from "react";

type FormState = {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  endTime: string;
  homeScore: number;
  awayScore: number;
};

const initialState: FormState = {
  sport: "Cricket",
  homeTeam: "Mumbai Meteors",
  awayTeam: "Delhi Strikers",
  startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16),
  homeScore: 0,
  awayScore: 0,
};

export function MatchComposer() {
  const [form, setForm] = useState<FormState>(initialState);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    startTransition(async () => {
      try {
        const response = await fetch("/api/matches", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sport: form.sport,
            homeTeam: form.homeTeam,
            awayTeam: form.awayTeam,
            startTime: new Date(form.startTime).toISOString(),
            endTime: new Date(form.endTime).toISOString(),
            homeScore: Number(form.homeScore),
            awayScore: Number(form.awayScore),
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to create match");
        }

        setMessage(`Created match #${payload?.data?.id}. Refresh the page to see it in the list.`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to create match";
        setIsError(true);
        setMessage(errorMessage);
      }
    });
  }

  return (
    <div className="panel panel-pad">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Sport</span>
            <input className="field-input" value={form.sport} onChange={(event) => updateField("sport", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Home team</span>
            <input className="field-input" value={form.homeTeam} onChange={(event) => updateField("homeTeam", event.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Away team</span>
            <input className="field-input" value={form.awayTeam} onChange={(event) => updateField("awayTeam", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Start time</span>
            <input className="field-input" type="datetime-local" value={form.startTime} onChange={(event) => updateField("startTime", event.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">End time</span>
            <input className="field-input" type="datetime-local" value={form.endTime} onChange={(event) => updateField("endTime", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Home score</span>
            <input className="field-input" type="number" min="0" value={form.homeScore} onChange={(event) => updateField("homeScore", Number(event.target.value))} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Away score</span>
            <input className="field-input" type="number" min="0" value={form.awayScore} onChange={(event) => updateField("awayScore", Number(event.target.value))} />
          </label>
          <div className="field">
            <span className="field-label">Preview</span>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {form.homeTeam} vs {form.awayTeam} | {form.sport}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="tiny">POST /api/matches proxies to the backend match endpoint.</span>
          <button className="btn-primary" type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create match"}
          </button>
        </div>

        {message ? <div className={isError ? "message-error" : "message-success"}>{message}</div> : null}
      </form>
    </div>
  );
}