import AgentAPI from "apminsight";
AgentAPI.config();


import express from "express";
import http from 'http';
import { matchesRouter } from "./db/routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { commentaryRouter } from "./db/routes/commentary.js";
import { securityMiddleware } from "./arcjet.js";
import { connectRedis } from "./redis.js";

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

const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

await connectRedis();

server.listen(PORT, HOST, () => {
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running at ${baseUrl}`);
    console.log(`webSocket Server is running on ${baseUrl.replace('http', 'ws')}/ws`);
});
