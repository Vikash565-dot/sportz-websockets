import { kafka, kafkaEnabled } from "./client.js";
import { matchEventSchema } from "./schemas.js";
import { MATCH_EVENTS_TOPIC } from "./topics.js";

let producer;
let topicReady = false;

async function ensureMatchEventsTopic() {
  if (topicReady || !kafka) return;

  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: MATCH_EVENTS_TOPIC, numPartitions: 3, replicationFactor: 1 }],
    });
    topicReady = true;
  } finally {
    await admin.disconnect().catch((error) => console.error("Kafka admin disconnect failed:", error.message));
  }
}

async function getProducer() {
  if (!kafka) return null;
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

export async function publishMatchEvent(event, send = null) {
  const parsed = matchEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new Error(`Refusing to publish invalid match event: ${parsed.error.message}`);
  }

  const request = createMatchEventPublishRequest(parsed.data);
  if (!kafkaEnabled) return false;

  try {
    const activeProducer = send ? null : await getProducer();
    const publish = send || activeProducer.send.bind(activeProducer);
    await publish(request);
    return true;
  } catch (error) {
    console.error("Kafka publish failed after database persistence:", error.message);
    return false;
  }
}

export function createMatchEventPublishRequest(event) {
  const parsed = matchEventSchema.parse(event);
  return {
    topic: MATCH_EVENTS_TOPIC,
    // A match id is the key, so Kafka keeps a match's event order within one partition.
    messages: [{ key: parsed.matchId, value: JSON.stringify(parsed) }],
  };
}

export async function initializeKafkaProducer() {
  if (!kafkaEnabled) {
    console.warn("Kafka is disabled: set KAFKA_BROKERS to enable event streaming.");
    return false;
  }

  try {
    await ensureMatchEventsTopic();
    await getProducer();
    console.log(`Kafka producer connected to ${MATCH_EVENTS_TOPIC}`);
    return true;
  } catch (error) {
    console.error("Kafka producer unavailable; WebSocket fallback remains active:", error.message);
    return false;
  }
}

export async function disconnectKafkaProducer() {
  if (producer) {
    await producer.disconnect().catch((error) => console.error("Kafka producer disconnect failed:", error.message));
    producer = undefined;
  }
}
