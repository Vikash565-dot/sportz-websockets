import test from "node:test";
import assert from "node:assert/strict";
import { matchCreatedEvent } from "../src/kafka/events.js";
import { createOutboxRecord, enqueueOutboxEvent } from "../src/kafka/outbox.js";

test("transactional outbox stores the Kafka event id and match key", async () => {
  const event = matchCreatedEvent({ id: 44, sport: "Tennis" });
  const record = createOutboxRecord(event);
  const inserted = [];
  const tx = {
    insert: () => ({
      values: async (value) => inserted.push(value),
    }),
  };

  await enqueueOutboxEvent(tx, event);

  assert.equal(record.id, event.eventId);
  assert.equal(record.messageKey, "44");
  assert.equal(record.payload.sport, "tennis");
  assert.deepEqual(inserted, [record]);
});
