import { kafka, kafkaEnabled } from "./client.js";
import { parseMatchEvent } from "./schemas.js";
import { MATCH_EVENTS_TOPIC, WEBSOCKET_CONSUMER_GROUP } from "./topics.js";

let consumer;

export async function startMatchEventConsumer(onEvent) {
  if (!kafkaEnabled) return false;

  try {
    consumer = kafka.consumer({ groupId: WEBSOCKET_CONSUMER_GROUP });
    consumer.on(consumer.events.CRASH, (event) => {
      console.error("Kafka consumer crashed:", event.payload.error.message);
    });
    await consumer.connect();
    await consumer.subscribe({ topic: MATCH_EVENTS_TOPIC, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = parseMatchEvent(message.value);
        if (!event) return;

        try {
          await onEvent(event);
        } catch (error) {
          console.error("Kafka match event processing failed:", error.message);
        }
      },
    });
    console.log(`Kafka consumer group ${WEBSOCKET_CONSUMER_GROUP} subscribed to ${MATCH_EVENTS_TOPIC}`);
    return true;
  } catch (error) {
    console.error("Kafka consumer unavailable; continuing without Kafka delivery:", error.message);
    await disconnectKafkaConsumer();
    return false;
  }
}

export async function processMatchEventMessage(value, onEvent) {
  const event = parseMatchEvent(value);
  if (!event) return false;
  await onEvent(event);
  return true;
}

export async function disconnectKafkaConsumer() {
  if (consumer) {
    await consumer.disconnect().catch((error) => console.error("Kafka consumer disconnect failed:", error.message));
    consumer = undefined;
  }
}
