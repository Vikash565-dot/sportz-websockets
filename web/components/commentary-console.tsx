'use client';

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatDateTime } from "../lib/format";

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

type CommentaryConsoleProps = {
  matchId: number;
  initialCommentary: Commentary[];
  wsUrl: string;
  onLiveEvent?: (event: { type: "commentary"; commentary: Commentary } | { type: "match_updated"; match: { id: number; sport: string; homeTeam: string; awayTeam: string; status: string; startTime: string; createdAt?: string; homeScore?: number; awayScore?: number } }) => void;
};

type FormState = {
  minute: string;
  sequence: string;
  period: string;
  eventType: string;
  actor: string;
  team: string;
  message: string;
  metadata: string;
  tags: string;
};

function normalizeCommentary(items: Commentary[]) {
  return [...items].sort((left, right) => {
    const leftSequence = Number(left.sequence ?? 0);
    const rightSequence = Number(right.sequence ?? 0);
    if (leftSequence !== rightSequence) return rightSequence - leftSequence;
    return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime();
  });
}

const initialForm: FormState = {
  minute: "0",
  sequence: "1",
  period: "1st half",
  eventType: "update",
  actor: "Broadcast Desk",
  team: "Home",
  message: "Kickoff sequence is underway.",
  metadata: "{}",
  tags: "live,feed",
};

export function CommentaryConsole({ matchId, initialCommentary, wsUrl, onLiveEvent }: CommentaryConsoleProps) {
  const initialItems = useMemo(() => normalizeCommentary(initialCommentary || []), [initialCommentary]);
  const [items, setItems] = useState<Commentary[]>(initialItems);
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      setIsConnected(true);
      socket.send(JSON.stringify({ type: "subscribe", matchId }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type?: string; data?: Commentary; matchId?: number };
        if (payload.type === "commentary" && payload.matchId === matchId && payload.data) {
          setItems((current) => normalizeCommentary([payload.data as Commentary, ...current]));
          onLiveEvent?.({ type: "commentary", commentary: payload.data as Commentary });
        }

        if (payload.type === "match_updated" && payload.data) {
          onLiveEvent?.({ type: "match_updated", match: payload.data as never });
        }
      } catch {
        // Ignore malformed websocket frames from the browser client.
      }
    });

    socket.addEventListener("close", () => setIsConnected(false));
    socket.addEventListener("error", () => setIsConnected(false));

    return () => socket.close();
  }, [matchId, wsUrl]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function parseMetadata(value: string) {
    try {
      return value.trim() ? JSON.parse(value) : {};
    } catch {
      return null;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    const metadata = parseMetadata(form.metadata);
    if (!metadata) {
      setIsError(true);
      setMessage("Metadata must be valid JSON.");
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          minute: Number(form.minute),
          sequence: Number(form.sequence),
          period: form.period,
          eventType: form.eventType,
          actor: form.actor,
          team: form.team,
          message: form.message,
          metadata,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        };

        const response = await fetch(`/api/matches/${matchId}/commentary`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const body = (await response.json()) as { data?: Commentary; error?: string };

        if (!response.ok) {
          throw new Error(body?.error || "Failed to create commentary");
        }

        if (body.data) {
          setItems((current) => normalizeCommentary([body.data as Commentary, ...current]));
          onLiveEvent?.({ type: "commentary", commentary: body.data as Commentary });
        }
        setMessage("Commentary entry posted.");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to create commentary";
        setIsError(true);
        setMessage(errorMessage);
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="panel panel-pad">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className={`status ${isConnected ? "live" : "scheduled"}`}>
            {isConnected ? "connected" : "connecting"}
          </span>
          <span className="tiny">WebSocket updates automatically append to the feed.</span>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Minute</span>
              <input className="field-input" type="number" min="0" value={form.minute} onChange={(event) => updateField("minute", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Sequence</span>
              <input className="field-input" type="number" min="1" value={form.sequence} onChange={(event) => updateField("sequence", event.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Period</span>
              <input className="field-input" value={form.period} onChange={(event) => updateField("period", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Event type</span>
              <input className="field-input" value={form.eventType} onChange={(event) => updateField("eventType", event.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Actor</span>
              <input className="field-input" value={form.actor} onChange={(event) => updateField("actor", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Team</span>
              <input className="field-input" value={form.team} onChange={(event) => updateField("team", event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Message</span>
            <textarea className="field-textarea" value={form.message} onChange={(event) => updateField("message", event.target.value)} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Metadata JSON</span>
              <textarea className="field-textarea" value={form.metadata} onChange={(event) => updateField("metadata", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Tags</span>
              <textarea className="field-textarea" value={form.tags} onChange={(event) => updateField("tags", event.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="tiny">POST /api/matches/{matchId}/commentary proxies to the backend.</span>
            <button className="btn-primary" type="submit" disabled={isPending}>
              {isPending ? "Posting..." : "Post commentary"}
            </button>
          </div>

          {message ? <div className={isError ? "message-error" : "message-success"}>{message}</div> : null}
        </form>
      </div>

      <div className="grid gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={item.id} className="feed-item">
              <header>
                <span>
                  {item.period} · {item.eventType}
                </span>
                <span>
                  {item.minute != null ? `${item.minute}'` : ""}
                  {item.sequence != null ? ` #${item.sequence}` : ""}
                </span>
              </header>
              <p>{item.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="tag">{item.actor}</span>
                <span className="tag">{item.team}</span>
                <span className="tag">{formatDateTime(item.createdAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">No commentary has been posted for this match yet.</div>
        )}
      </div>
    </div>
  );
}