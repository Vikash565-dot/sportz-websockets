# SportZ frontend

React, TypeScript, Vite, and Tailwind interface for the SportZ match and commentary API.

## Run locally

From the repository root, `npm run dev` starts the API and Vite frontend. To run the frontend on its own, start the API separately with `npm run dev:api`, then run:

```sh
npm --prefix web run dev
```

Open `http://127.0.0.1:3000`. The Vite server proxies `/api/*` to `http://localhost:8000/*` and proxies `/ws` as a WebSocket connection. Set `VITE_BACKEND_ORIGIN` before starting Vite if the API listens elsewhere.

To see durable live broadcasts, also configure PostgreSQL, Redis, and Kafka as described in the repository's root README and `.env.example`. The frontend shows API and match-room connection states; the API does not currently expose Kafka health to the browser.

## Production build

```sh
npm --prefix web run build
npm --prefix web run preview
```

The build output is `web/dist`. When serving it from a production web server, configure that server to:

- Serve `index.html` for application routes such as `/matches/123`.
- Proxy `/api/*` to the backend after removing the `/api` prefix.
- Proxy `/ws` to the backend with WebSocket upgrade support.

The Vite preview command is for local build review; deploy the static `dist` directory behind a web server or CDN configured with the routes above.
