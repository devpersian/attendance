# سامانه حضور و غیاب و مدیریت شیفت (Attendance & Shift Management System)

A Persian-language (RTL) attendance and shift-management system for Iranian organizations:
React + Vite + Tailwind frontend, Express + SQL Server backend, Jalali calendar support,
and ZKTeco-class biometric device integration with a realtime (SSE) punch feed.

> Historical development notes (45 docs) live in [`docs-archive/`](docs-archive).
> Release history is in [CHANGELOG.md](CHANGELOG.md).

## Features

- **Dashboard** — today's stats, charts, and a live punch feed (Server-Sent Events).
- **Clock In/Out**, **History**, **Employees**, **Leaves**, **Units**.
- **Shifts & Patterns** — shift definitions, periodic shift assignment, working-hours rules.
- **Reports** — monthly attendance (holiday-aware working-day denominators), violations,
  overtime; export to Excel (.xls / SpreadsheetML), CSV, and print view.
- **Devices** — 8 protocol drivers for ZKTeco-class terminals; realtime event bus.
- **Admin** — users, roles, granular permissions, audit logs.
- **Iranian holidays** — official Jalali religious/national holidays + Fridays baked into
  absence/violation math (`server/services/holidays.mjs`).

## Tech stack

| Layer    | Tech                                                        |
|----------|-------------------------------------------------------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind 4, framer-motion     |
| Backend  | Node 22 (ESM), Express 5, mssql (SQL Server), jsonwebtoken  |
| Database | Microsoft SQL Server (`database/` has schema + migration scripts) |
| Realtime | SSE (`GET /api/stream`)                                     |

## Quick start (development)

```bash
npm ci
cp .env.example .env      # fill DB_* credentials and set JWT_SECRET
npm run seed              # optional: demo data (requires DB)
npm run seed:admin        # optional: admin user
npm run start             # server (:3001) + vite dev server (:3000) concurrently
```

Open http://localhost:3000. The Vite dev server proxies `/api` to the backend.

Useful scripts: `npm run typecheck`, `npm test` (node:test unit tests), `npm run build`.

## Authentication

- Access tokens: short-lived JWT (`JWT_EXPIRES_IN`, default 15m).
- Refresh tokens: single-use, rotating, 7-day TTL (`POST /api/auth/refresh`, logout via
  `POST /api/auth/logout`). The frontend client refreshes automatically on 401.
- **Production requires `JWT_SECRET` ≥ 32 chars** — the server refuses to boot without it.
  Generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Deployment (Docker)

Single container (Node serves API + built SPA):

```bash
cp .env.example .env   # set DB_PASSWORD and JWT_SECRET
docker compose up -d --build
# app: http://localhost:3001
```

Or with nginx in front (static assets + proxied API/SSE):

```bash
npm run build
docker compose up -d --build
# web (nginx): http://localhost:8080  →  proxies /api to the app container
```

`deploy/nginx.conf` disables proxy buffering so SSE streams correctly.

## Project layout

```
server/           Express API (ESM): routes/, services/, middleware/, devices/
src/              React SPA: components/, utils/ (jalali, realtime, http, storage API client)
database/         SQL schema & migrations
tests/            node:test unit tests (holidays, security, auth rotation)
deploy/           nginx.conf
docs-archive/     historical markdown notes
```
