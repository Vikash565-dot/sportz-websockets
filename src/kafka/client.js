import "dotenv/config";
import { Kafka, logLevel } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS || "")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

export const kafkaEnabled = process.env.KAFKA_ENABLED !== "false" && brokers.length > 0;

export const kafka = kafkaEnabled
  ? new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || "sportz-api",
      brokers,
      logLevel: logLevel.NOTHING,
      connectionTimeout: 3_000,
      requestTimeout: 10_000,
      retry: { retries: 3, initialRetryTime: 300 },
    })
  : null;
