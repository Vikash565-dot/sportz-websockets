import test from "node:test";
import assert from "node:assert/strict";
import { commentaryCreatedEvent, matchCreatedEvent } from "../src/kafka/events.js";
import { parseMatchEvent } from "../src/kafka/schemas.js";
import { createMatchEventPublishRequest } from "../src/kafka/producer.js";

const footballMatch = { id: 101, sport: "Football", homeTeam: "Alpha", awayTeam: "Beta" };

test("generic Kafka envelopes support multiple sports", () => {
  const cricket = matchCreatedEvent({ id: 102, sport: "Cricket" });
  const basketball = matchCreatedEvent({ id: 103, sport: "Basketball" });

  assert.equal(cricket.sport, "cricket");
  assert.equal(basketball.sport, "basketball");
  assert.equal(cricket.matchId, "102");
  assert.equal(basketball.payload.type, "MATCH_CREATED");
});

test("Kafka event parsing safely rejects malformed messages", () => {
  assert.equal(parseMatchEvent(Buffer.from("not-json")), null);
  assert.equal(parseMatchEvent(Buffer.from(JSON.stringify({ matchId: "101" }))), null);
});

test("Kafka event parsing accepts validated commentary events", () => {
  const event = commentaryCreatedEvent(footballMatch, { id: 1, matchId: 101, eventType: "GOAL" });
  const parsed = parseMatchEvent(Buffer.from(JSON.stringify(event)));

  assert.equal(parsed?.matchId, "101");
  assert.equal(parsed?.payload.type, "COMMENTARY_CREATED");
});

test("producer uses the match id as the Kafka message key", () => {
  const event = matchCreatedEvent(footballMatch);
  const request = createMatchEventPublishRequest(event);

  assert.equal(request.messages[0].key, "101");
  assert.deepEqual(JSON.parse(request.messages[0].value), event);
});
