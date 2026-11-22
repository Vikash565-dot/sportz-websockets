import test from "node:test";
import assert from "node:assert/strict";
import { matchCreatedEvent } from "../src/kafka/events.js";
import { processMatchEventMessage } from "../src/kafka/consumer.js";
import { createMatchSubscriptionRegistry } from "../src/ws/server.js";

test("a consumed match event is delivered only to that match's subscribers", async () => {
  const registry = createMatchSubscriptionRegistry();
  const receivedBy101 = [];
  const receivedBy202 = [];
  const socket101 = { readyState: 1, subscriptions: new Set(), send: (value) => receivedBy101.push(JSON.parse(value)) };
  const socket202 = { readyState: 1, subscriptions: new Set(), send: (value) => receivedBy202.push(JSON.parse(value)) };
  registry.subscribe(101, socket101);
  registry.subscribe(202, socket202);

  const event = matchCreatedEvent({ id: 101, sport: "Football" });
  const consumed = await processMatchEventMessage(Buffer.from(JSON.stringify(event)), async (message) => {
    registry.broadcast(Number(message.matchId), message);
  });

  assert.equal(consumed, true);
  assert.equal(receivedBy101.length, 1);
  assert.equal(receivedBy202.length, 0);
  assert.equal(receivedBy101[0].sport, "football");
});
