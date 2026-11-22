CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" text PRIMARY KEY NOT NULL,
  "topic" text NOT NULL,
  "message_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "published_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outbox_events_pending_idx"
  ON "outbox_events" ("next_attempt_at", "created_at")
  WHERE "published_at" IS NULL;
