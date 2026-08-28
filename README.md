# F.O.B

A minimal [Express](https://expressjs.com/) web application that serves as the
starter codebase and the Cloud Agent development-environment demo.

## Requirements

- Node.js >= 20 (the repo is developed against Node 22)
- npm

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server with auto-reload on http://localhost:3000
npm start        # start the server without watch mode
npm test         # run the test suite (node:test)
```

The server listens on `PORT` (default `3000`) and `HOST` (default `0.0.0.0`).

## API

| Method | Path          | Description                              |
| ------ | ------------- | ---------------------------------------- |
| GET    | `/api/health` | Liveness/readiness probe with uptime.    |
| POST   | `/api/echo`   | Returns the request `text` reversed.     |
| GET    | `/`           | Serves the single-page frontend.         |

Example:

```bash
curl -s http://localhost:3000/api/health
curl -s -X POST http://localhost:3000/api/echo \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, F.O.B"}'
```

## Project layout

```
src/app.js        Express app factory (routes + static serving)
src/server.js     Server bootstrap (binds to PORT/HOST)
public/           Static frontend (HTML/CSS/JS)
test/app.test.js  Integration tests against the app
```

## Cloud Agent environment

The Cloud Agent environment is defined in
[`.cursor/environment.json`](.cursor/environment.json):

- `install`: `npm install`
- `terminals`: runs `npm run dev` so the app is always available on port 3000
- `ports`: exposes `3000`
