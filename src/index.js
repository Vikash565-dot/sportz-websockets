import AgentAPI from "apminsight";
AgentAPI.config();


import express from "express";
import http from 'http';
import { matchesRouter } from "./db/routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { commentaryRouter } from "./db/routes/commentary.js";
import { securityMiddleware } from "./arcjet.js";
import { connectRedis, disconnectRedis } from "./redis.js";
import { startMatchEventConsumer, disconnectKafkaConsumer } from "./kafka/consumer.js";
import { disconnectKafkaProducer, initializeKafkaProducer } from "./kafka/producer.js";
import { startOutboxRelay, stopOutboxRelay } from "./kafka/outbox.js";
import { pool } from "./db/db.js";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to a free port.`);
        return;
    }

    console.error("HTTP server error:", error);
});

app.use(express.json());

app.get('/', (req,res) => {
    res.send('Hello from Express server!');
});

//app.use(securityMiddleware());

app.use('/matches', matchesRouter);

app.use('/matches/:id/commentary', commentaryRouter)

const { broadcastMatchCreated, broadcastMatchUpdated, broadcastCommentary, closeWebSocketServer } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastMatchUpdated = broadcastMatchUpdated;
app.locals.broadcastCommentary = broadcastCommentary;

void connectRedis();
void (async () => {
    const producerReady = await initializeKafkaProducer();
    if (!producerReady) return;

    startOutboxRelay();

    await startMatchEventConsumer(async (event) => {
        if (event.eventType === "MATCH_CREATED" && event.payload.match) {
            await broadcastMatchCreated(event.payload.match);
            return;
        }

        if (event.eventType === "COMMENTARY_CREATED" && event.payload.commentary) {
            await broadcastCommentary(Number(event.matchId), event.payload.commentary);
            return;
        }

        if (event.eventType === "MATCH_UPDATED" && event.payload.match) {
            await broadcastMatchUpdated(event.payload.match);
            return;
        }

        console.error(`Ignoring Kafka match event with unsupported payload: ${event.eventType}`);
    });
})();

server.listen(PORT, HOST, () => {
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running at ${baseUrl}`);
    console.log(`webSocket Server is running on ${baseUrl.replace('http', 'ws')}/ws`);
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down gracefully.`);
    await closeWebSocketServer();
    await new Promise((resolve) => server.close(resolve));
    stopOutboxRelay();
    await Promise.allSettled([disconnectKafkaConsumer(), disconnectKafkaProducer(), disconnectRedis(), pool.end()]);
    process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
