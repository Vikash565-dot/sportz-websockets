import { useState } from "react";
import { getBackendUrl } from "../lib/config";
import type { Match } from "../lib/types";

type FormState = {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  endTime: string;
  homeScore: number;
  awayScore: number;
};

function toLocalDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function makeInitialState(): FormState {
  return {
    sport: "Football",
    homeTeam: "Mumbai City FC",
    awayTeam: "Bengaluru FC",
    startTime: toLocalDateTime(new Date(Date.now() - 10 * 60 * 1000)),
    endTime: toLocalDateTime(new Date(Date.now() + 90 * 60 * 1000)),
    homeScore: 0,
    awayScore: 0,
  };
}

export function MatchComposer({ onCreated }: { onCreated?: (match: Match) => void }) {
  const [form, setForm] = useState<FormState>(makeInitialState);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);

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
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      setIsError(true);
      setMessage("The end time must be after the start time.");
      return;
    }
    setIsPending(true);
    try {
        const response = await fetch(`${getBackendUrl()}/matches`, {
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

        const createdMatch = payload?.data as Match | undefined;
        if (createdMatch) onCreated?.(createdMatch);
        setMessage(createdMatch ? `Match #${createdMatch.id} created. Select it above to subscribe to its broadcast.` : "Match created.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create match";
      setIsError(true);
      setMessage(errorMessage);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="panel panel-pad">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Sport</span>
            <input className="field-input" required value={form.sport} onChange={(event) => updateField("sport", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Home team</span>
            <input className="field-input" required value={form.homeTeam} onChange={(event) => updateField("homeTeam", event.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Away team</span>
            <input className="field-input" required value={form.awayTeam} onChange={(event) => updateField("awayTeam", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Start time</span>
            <input className="field-input" required type="datetime-local" value={form.startTime} onChange={(event) => updateField("startTime", event.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="field-label">End time</span>
            <input className="field-input" required type="datetime-local" value={form.endTime} onChange={(event) => updateField("endTime", event.target.value)} />
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
            <div className="rounded-2xl border-[2px] border-[#202020] bg-[#f5d447] px-4 py-3 text-sm font-semibold text-[#202020]">
              {form.homeTeam} vs {form.awayTeam} | {form.sport}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="tiny">POST /matches sends this fixture to the backend.</span>
          <button className="btn-primary" type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create match"}
          </button>
        </div>

        {message ? <div className={isError ? "message-error" : "message-success"} role={isError ? "alert" : "status"}>{message}</div> : null}
      </form>
    </div>
  );
}
