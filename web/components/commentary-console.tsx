import { useEffect, useMemo, useState, useTransition } from "react";
import { formatDateTime } from "../lib/format";
import { getBackendUrl } from "../lib/config";
import type { Commentary, Match } from "../lib/types";

type CommentaryConsoleProps = {
  matchId: number;
  initialCommentary: Commentary[];
  wsUrl: string;
  onConnectionChange?: (connected: boolean) => void;
  onLiveEvent?: (event: { type: "commentary"; commentary: Commentary } | { type: "match_updated"; match: Match }) => void;
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
  minute: "12",
  sequence: "1",
  period: "1st half",
  eventType: "goal",
  actor: "Home striker",
  team: "Home",
  message: "Goal! The home side takes the lead.",
  metadata: JSON.stringify({ homeScore: 1, awayScore: 0 }, null, 2),
  tags: "goal,score,live",
};

export function CommentaryConsole({ matchId, initialCommentary, wsUrl, onConnectionChange, onLiveEvent }: CommentaryConsoleProps) {
  const initialItems = useMemo(() => normalizeCommentary(initialCommentary || []), [initialCommentary]);
  const [items, setItems] = useState<Commentary[]>(initialItems);
  const [delivery, setDelivery] = useState<Record<number, "stored" | "broadcast">>({});
  const [socketStatus, setSocketStatus] = useState<"connecting" | "subscribed" | "reconnecting">("connecting");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setSocketStatus("connecting");
    setDelivery({});
    let disposed = false;
    let retries = 0;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(wsUrl);
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ type: "subscribe", matchId }));
      });
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data as string) as { type?: string; data?: Commentary | Match; matchId?: number };
          if (payload.type === "subscribed" && payload.matchId === matchId) {
            setSocketStatus("subscribed");
            onConnectionChange?.(true);
          }
          if (payload.type === "commentary" && payload.matchId === matchId && payload.data) {
            const item = payload.data as Commentary;
            setItems((current) => normalizeCommentary([item, ...current.filter((entry) => entry.id !== item.id)]));
            setDelivery((current) => ({ ...current, [item.id]: "broadcast" }));
            onLiveEvent?.({ type: "commentary", commentary: item });
          }
          if (payload.type === "match_updated" && payload.data) onLiveEvent?.({ type: "match_updated", match: payload.data as Match });
        } catch {
          // Ignore malformed websocket frames from the browser client.
        }
      });
      socket.addEventListener("close", () => {
        setSocketStatus("reconnecting");
        onConnectionChange?.(false);
        if (!disposed) {
          retries += 1;
          retryTimer = setTimeout(connect, Math.min(1000 * 2 ** Math.min(retries - 1, 4), 15000));
        }
      });
      socket.addEventListener("error", () => { setSocketStatus("reconnecting"); onConnectionChange?.(false); });
    };
    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "unsubscribe", matchId }));
      socket?.close();
    };
  }, [matchId, wsUrl]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function parseMetadata(value: string) {
    try {
      const parsed = value.trim() ? JSON.parse(value) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
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

        const response = await fetch(`${getBackendUrl()}/matches/${matchId}/commentary`, {
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
          setItems((current) => normalizeCommentary([body.data as Commentary, ...current.filter((item) => item.id !== body.data?.id)]));
          setDelivery((current) => current[body.data!.id] === "broadcast" ? current : { ...current, [body.data!.id]: "stored" });
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
          <span className={`status ${socketStatus === "subscribed" ? "live" : "scheduled"}`}>
            {socketStatus}
          </span>
          <span className="tiny">WebSocket updates automatically append to the feed.</span>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Minute</span>
              <input className="field-input" required type="number" min="0" value={form.minute} onChange={(event) => updateField("minute", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Sequence</span>
              <input className="field-input" required type="number" min="1" value={form.sequence} onChange={(event) => updateField("sequence", event.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Period</span>
              <input className="field-input" required value={form.period} onChange={(event) => updateField("period", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Event type</span>
              <input className="field-input" required value={form.eventType} onChange={(event) => updateField("eventType", event.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Actor</span>
              <input className="field-input" required value={form.actor} onChange={(event) => updateField("actor", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Team</span>
              <input className="field-input" required value={form.team} onChange={(event) => updateField("team", event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Message</span>
            <textarea className="field-textarea" required value={form.message} onChange={(event) => updateField("message", event.target.value)} />
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
            <span className="tiny">POST /matches/{matchId}/commentary sends this update to the backend.</span>
            <button className="btn-primary" type="submit" disabled={isPending}>
              {isPending ? "Posting..." : "Post commentary"}
            </button>
          </div>

          {message ? <div className={isError ? "message-error" : "message-success"} role={isError ? "alert" : "status"}>{message}</div> : null}
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
                <span className="flex items-center gap-2">
                  {delivery[item.id] === "broadcast" && <span className="tag bg-[#dff3e5]">broadcast</span>}
                  {delivery[item.id] === "stored" && <span className="tag bg-[#fff0c2]">saved · waiting for broadcast</span>}
                  {item.minute != null ? `${item.minute}'` : ""}
                  {item.sequence != null ? ` #${item.sequence}` : ""}
                </span>
              </header>
              <p>{item.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="tag">{item.actor}</span>
                <span className="tag">{item.team}</span>
                <span className="tag">{formatDateTime(item.createdAt)}</span>
                {item.tags?.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                {(Number.isFinite(Number(item.metadata?.homeScore)) || Number.isFinite(Number(item.metadata?.awayScore))) && (
                  <span className="tag bg-[#f5d447]">Score metadata · {item.metadata?.homeScore == null ? "–" : String(item.metadata.homeScore)} : {item.metadata?.awayScore == null ? "–" : String(item.metadata.awayScore)}</span>
                )}
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
