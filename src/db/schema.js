import {
	pgEnum,
	pgTable,
	serial,
	text,
	integer,
	timestamp,
	jsonb,
} from "drizzle-orm/pg-core";

// Enum for match lifecycle
export const matchStatusEnum = pgEnum("match_status", [
	"scheduled",
	"live",
	"finished",
]);

export const matches = pgTable("matches", {
	id: serial("id").primaryKey(),
	sport: text("sport").notNull(),
	homeTeam: text("home_team").notNull(),
	awayTeam: text("away_team").notNull(),
	status: matchStatusEnum("status").notNull().default("scheduled"),
	startTime: timestamp("start_time", { withTimezone: true }).notNull(),
	endTime: timestamp("end_time", { withTimezone: true }),
	homeScore: integer("home_score").notNull().default(0),
	awayScore: integer("away_score").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const commentary = pgTable("commentary", {
	id: serial("id").primaryKey(),
	matchId: integer("match_id")
		.references(() => matches.id, { onDelete: "cascade" })
		.notNull(),
	minute: integer("minute"),
	sequence: integer("sequence"),
	period: text("period"),
	eventType: text("event_type"),
	actor: text("actor"),
	team: text("team"),
	message: text("message"),
	metadata: jsonb("metadata"),
	tags: text("tags").array(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// The outbox is committed with a domain write, then relayed to Kafka separately.
export const outboxEvents = pgTable("outbox_events", {
	id: text("id").primaryKey(),
	topic: text("topic").notNull(),
	messageKey: text("message_key").notNull(),
	payload: jsonb("payload").notNull(),
	attempts: integer("attempts").notNull().default(0),
	nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
	lockedAt: timestamp("locked_at", { withTimezone: true }),
	lockedBy: text("locked_by"),
	publishedAt: timestamp("published_at", { withTimezone: true }),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

