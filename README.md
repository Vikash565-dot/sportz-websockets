# Sportz — Real-Time Sports Events API

A production-oriented backend for **real-time sports broadcasting**, built with Node.js, Express, WebSockets, PostgreSQL, Drizzle ORM, Redis, and Arcjet.

The system provides REST APIs for managing matches and play-by-play commentary while using **match-scoped WebSocket broadcasting** to stream live events to concurrent clients. It also implements dynamic Redis caching, Redis pub/sub fan-out for multi-instance websocket delivery, API protection, rate limiting, and performance monitoring.

> Redis optimizes read-heavy API requests only. PostgreSQL remains the source of truth, while WebSocket broadcasts stay outside the cache delivery path.

## Highlights

* Designed and developed a **real-time sports broadcasting backend** using Node.js and WebSockets.
* Match-scoped WebSocket broadcasting for concurrent clients.
* Validated **sub-10 ms local WebSocket event delivery latency** during development testing.
* Stress-tested the WebSocket backend with **1,000 concurrent users**.
* RESTful APIs for match creation and play-by-play commentary.
* PostgreSQL persistence using Drizzle ORM.
* Dynamic Redis **cache-aside** strategy for read-heavy endpoints.
* Short cache TTLs for live activity and longer TTLs for quieter data.
* Versioned cache invalidation after writes without expensive Redis key scans.
* LFU eviction configuration for bounded Redis memory usage.
* Arcjet-based API protection and rate limiting.
* Site24x7 APM integration for backend monitoring and performance visibility.
* Cache operations are isolated from the live WebSocket broadcast path so Redis failures do not block event delivery.

## Architecture

```text
                         ┌──────────────────────────┐
                         │     REST / WS Clients    │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │       Node.js Server     │
                         │                          │
                         │  ┌────────────────────┐  │
                         │  │   Express REST API │  │
                         │  └─────────┬──────────┘  │
                         │            │             │
                         │  ┌─────────▼──────────┐  │
                         │  │ WebSocket Server   │  │
                         │  │ Match Subscriptions│  │
                         │  └─────────┬──────────┘  │
                         └────────────┼─────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
                │                     │                     │
        ┌───────▼────────┐    ┌───────▼────────┐   ┌──────▼───────┐
        │     Redis      │    │   PostgreSQL    │   │   Arcjet     │
        │                │    │                 │   │              │
        │ Cache + LFU    │    │ Source of Truth │   │ Rate Limit + │
        │                │    │                 │   │ API Security │
        └───────┬────────┘    └───────┬─────────┘   └──────────────┘
                │                     │
                │                     │
                │              ┌──────▼─────────┐
                │              │   Drizzle ORM  │
                │              └────────────────┘
                │
                │
                │       Live Event Flow
                │
                └───────────────┐
                                │
                         ┌──────▼──────────────┐
                         │ Match-Scoped        │
                         │ WebSocket Broadcast │
                         └──────────┬───────────┘
                                    │
                                    ▼
                           Connected Clients
```

### Live Event Flow

```text
POST Commentary
      │
      ▼
Validate Request
      │
      ▼
Persist to PostgreSQL
      │
      ▼
Broadcast to subscribed clients
      │
      ▼
Invalidate Redis version
      │
      ▼
Connected clients receive event
```

Redis invalidation is deliberately performed asynchronously after broadcasting so that cache operations cannot block the real-time delivery path.

## Tech Stack

| Area             | Technology                          |
| ---------------- | ----------------------------------- |
| Runtime          | Node.js 22+                         |
| HTTP API         | Express 5                           |
| Real-time events | `ws` WebSocket library              |
| Database         | PostgreSQL / Neon                   |
| ORM              | Drizzle ORM                         |
| Cache            | Redis-compatible server             |
| Validation       | Zod                                 |
| Security         | Arcjet                              |
| Monitoring / APM | Site24x7                            |
| Load testing     | Concurrent WebSocket stress testing |

## Apache Kafka Architecture

Kafka is the event-streaming backbone for persisted sports events. PostgreSQL remains the source of truth and Redis remains the cache; neither is replaced by Kafka.

```text
Client
  ↓
Express API + Zod validation
  ↓
PostgreSQL (source of truth)
  ↓
Kafka producer → match-events
  ↓
Kafka consumer group: sportz-websocket
  ↓
Existing WebSocket server → subscribers for that match
```

The API publishes generic, validated event envelopes, so the same topic supports football goals, cricket fours, basketball points, and other sports without introducing sport-specific database fields:

```json
{
  "eventId": "uuid",
  "eventType": "COMMENTARY_CREATED",
  "sport": "football",
  "matchId": "123",
  "timestamp": "2026-08-13T12:00:00.000Z",
  "payload": { "type": "COMMENTARY_CREATED", "commentary": {} }
}
```

### Why Kafka?

Kafka decouples the API from downstream processing. Today `sportz-websocket` consumes `match-events` to deliver WebSocket updates. Later, independent `sportz-analytics` or `sportz-notifications` consumer groups can consume the same durable stream without changing the API.

Apache Kafka is the event-streaming platform; KafkaJS is the Node.js client used by this application to communicate with it.

### Why Redis and Kafka?

Redis answers “give me cached data quickly.” The existing cache-aside reads, TTLs, versioned cache keys, invalidation, fallback behavior, and Redis Pub/Sub WebSocket fan-out are unchanged.

Kafka answers “an event happened; let independent consumers process it.” It provides topics, partitions, consumer groups, and a durable log that can be replayed by a consumer group. Redis Pub/Sub is retained for the application's current cross-process WebSocket fan-out, but it is not the durable event stream.

### Kafka topic, key, and consumer group

The generic topic is `match-events`. Each event uses `String(matchId)` as its Kafka key, which consistently maps events for the same match to the same partition and preserves their order within that partition. Kafka does not provide global ordering across all matches.

`sportz-websocket` is the WebSocket delivery consumer group. Other groups can consume the same topic independently. The consumer validates every JSON message with Zod; malformed messages are logged and skipped without crashing the consumer.

### Local Kafka (Docker only)

Only Kafka runs in Docker; the API, frontend, PostgreSQL, and Redis remain on the host.

```powershell
docker compose -f docker-compose.kafka.yml up -d
docker compose -f docker-compose.kafka.yml ps
Test-NetConnection localhost -Port 9092
```

Stop Kafka with:

```powershell
docker compose -f docker-compose.kafka.yml down
```

Set the Kafka variables in `.env` from `.env.example`, then start the backend and frontend as usual:

```powershell
npm run dev:api
npm --prefix web run dev
npm test
```

### Current limitations and production path

The application uses the Transactional Outbox Pattern: the domain write and its `outbox_events` row are committed in one PostgreSQL transaction. A relay claims pending rows with `FOR UPDATE SKIP LOCKED`, publishes them to Kafka, and marks them delivered only after Kafka acknowledges the send. A broker outage therefore leaves the event pending for retry rather than losing it. Delivery is at-least-once: a process crash after Kafka acknowledges but before `published_at` is recorded can produce a duplicate, so downstream consumers must remain idempotent using `eventId`.

WebSocket subscriptions are process-local. Kafka consumer groups distribute partitions, but they do not synchronize in-memory socket subscriptions between Node processes. The existing Redis Pub/Sub fan-out still forwards consumer-generated WebSocket messages to each process. For larger-scale deployments, use a dedicated distributed connection/subscription gateway or shared subscription registry, and size consumer instances relative to topic partitions.

## Performance & Scalability

The backend was designed around the requirements of a live sports broadcasting system where event delivery should remain independent of cache performance.

### WebSocket Performance

* Match-scoped subscriptions prevent unrelated clients from receiving irrelevant events.
* Tested the WebSocket backend with **1,000 concurrent users**.
* Local browser-console measurements repeatedly showed **sub-10 ms event delivery**.
* The sub-10 ms figure represents a **local development measurement**, not an internet-wide production latency guarantee.

```text
Client A ─────┐
Client B ─────┤
Client C ─────┤
Client D ─────┤
              ▼
       Match Subscription
              │
              ▼
       Match Event
              │
       ┌──────┴──────┐
       ▼             ▼
  Client A        Client B
  subscribed      subscribed
```

Only clients subscribed to the relevant match receive its events.

### Load Testing

The WebSocket layer was stress-tested with:

```text
Concurrent WebSocket users: 1,000
```

The purpose of the test was to validate that match-scoped broadcasting could handle a large number of simultaneous connections while maintaining responsive event delivery.

> Production deployments should repeat load testing with realistic network conditions and report metrics such as p50/p95/p99 latency, throughput, connection stability, and resource utilization.

## API Reference

| Method | Endpoint                            | Purpose                   |
| ------ | ----------------------------------- | ------------------------- |
| `GET`  | `/matches?limit=50`                 | List matches              |
| `POST` | `/matches`                          | Create a match            |
| `GET`  | `/matches/:id/commentary?limit=100` | List a match's commentary |
| `POST` | `/matches/:id/commentary`           | Add commentary            |
| `GET`  | `/`                                 | Health-style greeting     |

### Create a Match

```http
POST /matches
Content-Type: application/json
```

```json
{
  "sport": "Football",
  "homeTeam": "Mumbai City FC",
  "awayTeam": "Bengaluru FC",
  "startTime": "2026-12-25T14:00:00.000Z",
  "endTime": "2026-12-25T16:00:00.000Z",
  "homeScore": 0,
  "awayScore": 0
}
```

### Create Commentary

```http
POST /matches/1/commentary
Content-Type: application/json
```

```json
{
  "minute": 35,
  "sequence": 1,
  "period": "First Half",
  "eventType": "goal",
  "actor": "Jorge Pereyra Díaz",
  "team": "Mumbai City FC",
  "message": "Goal! Mumbai City FC take the lead.",
  "metadata": {
    "homeScore": 1,
    "awayScore": 0
  },
  "tags": ["goal", "live"]
}
```

## WebSocket Protocol

Connect to:

```text
ws://localhost:8000/ws
```

### Subscribe to a Match

```json
{
  "type": "subscribe",
  "matchId": 1
}
```

### Unsubscribe

```json
{
  "type": "unsubscribe",
  "matchId": 1
}
```

### Server Messages

```json
{
  "type": "welcome"
}
```

```json
{
  "type": "subscribed",
  "matchId": 1
}
```

```json
{
  "type": "match_created",
  "data": {}
}
```

```json
{
  "type": "commentary",
      "matchId": 1,
  "data": {}
}
```

## Redis Caching Strategy

The project uses the **cache-aside pattern** for read-heavy GET endpoints.

```text
                 GET Request
                     │
                     ▼
               ┌───────────┐
               │   Redis   │
               └─────┬─────┘
                     │
            ┌────────┴────────┐
            │                 │
          HIT               MISS
            │                 │
            ▼                 ▼
      Return cached      Query PostgreSQL
         response              │
                               ▼
                         Cache JSON data
                               │
                               ▼
                         Return response
```

### Cache Policy

| Resource        | Condition                        |        TTL |
| --------------- | -------------------------------- | ---------: |
| Match list      | Contains a live match            |  5 seconds |
| Match list      | Match starts within 15 minutes   | 15 seconds |
| Match list      | Otherwise                        | 60 seconds |
| Commentary list | Newest entry under 2 minutes old |  5 seconds |
| Commentary list | Otherwise                        | 30 seconds |

### Versioned Cache Invalidation

Cache keys include request parameters and a version:

```text
matches:list:v3:limit:50
commentary:match:12:v8:limit:100
```

Writes increment the relevant version.

Instead of scanning Redis for old keys, new requests simply use the latest version.

```text
Old:
matches:list:v2:limit:50

Write occurs
      │
      ▼
Version → v3

New:
matches:list:v3:limit:50
```

This avoids expensive `KEYS` scans and allows old cache entries to expire naturally.

### Broadcast and Cache Isolation

Cache invalidation is deliberately **fire-and-forget** and occurs after the WebSocket broadcast.

When the app runs on more than one Node.js process, Redis pub/sub carries websocket events to every process so each connected client receives the same match and commentary broadcasts.

```text
Database Write
      │
      ▼
WebSocket Broadcast
      │
      ▼
Connected Clients
      │
      │
      └──────────────► Redis Invalidation
```

This design ensures Redis does not become a dependency in the critical path of live event delivery.

## LFU Eviction

[`redis.conf`](./redis.conf) configures:

```conf
maxmemory 256mb
maxmemory-policy allkeys-lfu
```

When Redis reaches its configured memory limit, less frequently accessed keys are evicted first.

TTL expiration continues to remove stale data automatically.

## Verify Caching

Send the same request twice without writing new data:

```text
GET /matches?limit=50
```

Inspect the `X-Cache` response header:

```text
First request:  X-Cache: MISS
Second request: X-Cache: HIT
```

## Security & API Protection

Arcjet is integrated for API protection and rate limiting.

The middleware can be enabled before deploying HTTP endpoints:

```text
Client Request
      │
      ▼
   Arcjet
      │
      ├── Rate limit exceeded ──► Reject
      │
      ▼
 Express API
      │
      ▼
 Application
```

Configure:

```env
ARCJET_KEY=your_arcjet_key
```

Then enable:

```js
app.use(securityMiddleware());
```

This helps protect the API from excessive request traffic and provides an additional security layer around public endpoints.

## Monitoring

Site24x7 APM is used to monitor backend performance and application behavior.

Monitoring can be used to observe:

* API response times
* Request throughput
* Error rates
* Backend resource utilization
* Application performance
* Production bottlenecks

This complements the local WebSocket load testing by providing visibility into application behavior during deployment.

## Quick Start

### Prerequisites

* Node.js 22+
* PostgreSQL database
* Redis server, or Memurai on Windows

A Neon PostgreSQL database can be used for development.

### 1. Install Dependencies

```bash
npm install
npm --prefix web install
```

### 2. Create Environment Variables

PowerShell:

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` in `.env`.

Never commit `.env`.

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
REDIS_URL=redis://127.0.0.1:6379
PORT=8000
HOST=0.0.0.0
ARCJET_KEY=your_arcjet_key
```

### 3. Start Redis

For native Redis:

```bash
redis-server redis.conf
```

On Windows, Memurai is Redis-protocol compatible and can run as a service on port `6379`.

Verify connectivity:

```powershell
Test-NetConnection 127.0.0.1 -Port 6379
```

Expected result:

```text
TcpTestSucceeded : True
```

### 4. Generate and Apply Database Migrations

```bash
npm run db:generate
npm run db:migrate
```

The migration creates the `outbox_events` table used for reliable PostgreSQL-to-Kafka publication.

### 5. Start the App

```bash
npm run dev
```

This starts both the backend and the Next.js frontend from the repository root.

To start only the API:

```bash
npm run dev:api
```

Expected output:

```text
Redis cache connected
Server is running at http://localhost:8000
WebSocket Server is running on ws://localhost:8000/ws
Next.js running at http://localhost:3000
```

### 6. Frontend Only

To run only the frontend:

```bash
npm --prefix web run dev
```

If you want the UI to point at a different backend, set `BACKEND_URL` before starting Next.js:

```env
BACKEND_URL=http://localhost:8000
```

The app will be available at `http://localhost:3000`.

The frontend is written in **TypeScript** and styled with **Tailwind CSS**.

## Project Structure

```text
src/
├── db/
│   ├── db.js                 # PostgreSQL pool and Drizzle client
│   ├── schema.js             # Match and commentary schema
│   └── routes/               # REST route handlers
├── validation/               # Zod request validation
├── ws/
│   └── server.js             # WebSocket subscriptions and broadcasts
├── redis.js                  # Cache connection, reads, and invalidation
├── arcjet.js                 # API security configuration
└── index.js                  # Application bootstrap

web/
├── app/                      # Next.js App Router pages and API proxies
├── components/               # Match and commentary UI
└── lib/                      # Backend URL and formatting helpers
```

## Production Considerations

* Keep credentials in `.env`; use `.env.example` only for safe placeholders.
* Configure `ARCJET_KEY` and enable API protection before deployment.
* Redis failures fall back to PostgreSQL so cache availability does not make the API unavailable.
* The WebSocket subscription map is process-local, while Redis pub/sub fans out events across processes.
* For multiple Node.js instances, Redis Pub/Sub keeps websocket broadcasts in sync without a separate broker.
* Configure Redis `maxmemory` based on available deployment resources.
* Run load tests under realistic network conditions before defining production latency SLOs.
* Monitor p95/p99 API and WebSocket latency in production.
* Scale WebSocket connections horizontally only after introducing shared event distribution between instances.

## Project Description

> Designed and developed a real-time sports broadcasting backend using Node.js and WebSockets, enabling match-scoped event streaming for concurrent clients. Built RESTful match and commentary APIs with PostgreSQL, Drizzle ORM, Redis caching, Arcjet API protection, and Site24x7 APM. Stress-tested the WebSocket backend with 1,000 concurrent users and validated sub-10 ms local event delivery latency. Implemented dynamic cache-aside reads with 5–60 second TTLs, O(1) versioned invalidation, LFU eviction, and isolated cache operations from the live broadcast path.

## License

This project is currently licensed under the ISC license. See `package.json`.
