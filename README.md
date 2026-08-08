# Sportz — Real-Time Sports Events API

A production-oriented backend for **real-time sports broadcasting**, built with Node.js, Express, WebSockets, PostgreSQL, Drizzle ORM, Redis, and Arcjet.

The system provides REST APIs for managing matches and play-by-play commentary while using **match-scoped WebSocket broadcasting** to stream live events to concurrent clients. It also implements dynamic Redis caching, API protection, rate limiting, and performance monitoring.

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

### 5. Start the API

```bash
npm run dev
```

Expected output:

```text
Redis cache connected
Server is running at http://localhost:8000
WebSocket Server is running on ws://localhost:8000/ws
```

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
```

## Production Considerations

* Keep credentials in `.env`; use `.env.example` only for safe placeholders.
* Configure `ARCJET_KEY` and enable API protection before deployment.
* Redis failures fall back to PostgreSQL so cache availability does not make the API unavailable.
* The WebSocket subscription map is currently process-local.
* For multiple Node.js instances, introduce **Redis Pub/Sub or a dedicated message broker** to fan out events between instances.
* Configure Redis `maxmemory` based on available deployment resources.
* Run load tests under realistic network conditions before defining production latency SLOs.
* Monitor p95/p99 API and WebSocket latency in production.
* Scale WebSocket connections horizontally only after introducing shared event distribution between instances.

## Project Description

> Designed and developed a real-time sports broadcasting backend using Node.js and WebSockets, enabling match-scoped event streaming for concurrent clients. Built RESTful match and commentary APIs with PostgreSQL, Drizzle ORM, Redis caching, Arcjet API protection, and Site24x7 APM. Stress-tested the WebSocket backend with 1,000 concurrent users and validated sub-10 ms local event delivery latency. Implemented dynamic cache-aside reads with 5–60 second TTLs, O(1) versioned invalidation, LFU eviction, and isolated cache operations from the live broadcast path.

## License

This project is currently licensed under the ISC license. See `package.json`.
