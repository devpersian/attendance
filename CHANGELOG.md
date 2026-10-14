# Changelog

## v11.0 — Hardening, Realtime & Reporting (2026-10)

### Added
- **Iranian holidays calendar** (`server/services/holidays.mjs`): Jalali religious/national
  holidays + Fridays, holiday-aware `workingDaysInMonth()` used by reports.
- **Realtime SSE stream**: `GET /api/stream` (auth via header or `?token=` for EventSource);
  Dashboard subscribes via `useRealtimeStream` with live/offline indicator and punch toasts.
- **Reports API** (`/api/reports/monthly|violations|overtime|holidays`) with correct
  working-day denominators; new Reports UI with Excel (SpreadsheetML), CSV (BOM) and print export.
- **Refresh-token rotation**: `POST /api/auth/refresh` (single-use tokens, 7-day TTL) and
  `POST /api/auth/logout`; frontend http client auto-refreshes on 401 (single-flight).
- **Security middleware**: fail-fast `JWT_SECRET` in production, protective headers,
  IP rate limiting (global + auth), `trust proxy`, CORS origin allow-list.
- **Deployment**: multi-stage `Dockerfile` (SPA served by the Node server),
  `docker-compose.yml` (SQL Server + API + nginx option), `deploy/nginx.conf`, `.dockerignore`.
- **CI**: `.github/workflows/ci.yml` — typecheck, unit tests, build, server boot smoke test.
- **Tests** (`node:test`): holidays math, security middleware, token rotation (17 tests).

### Merged — device soft-delete lineage (`fix-device-delete-button` branch)
- **Device soft-delete**: `DELETE /api/devices/:id` now flags `isDeleted=1` (history preserved);
  `POST /api/devices/:id/restore` endpoint; `GET /api/devices` hides deleted by default.
- **Migration** `database/migrations/003-device-soft-delete.sql` + schema.sql updated.
- **deviceService** polling excludes soft-deleted devices.
- **ConfirmDialog fix**: removed nested overlay that swallowed clicks (explicit
  preventDefault/stopPropagation) — the delete button works again.
- Devices UI: restore button for deleted devices; `devicesAPI.restore` in api.ts.

### Changed
- Removed legacy localStorage dual-write layer (`src/utils/storage.ts` is now a pure API client).
- `verifyToken()` returns `null` on invalid tokens instead of throwing.
- Fixed `jalaali-js` ESM import crash blocking server startup.
- Renamed package to `attendance-system`; dropped unused deps (@supabase, nodemon).

### Docs
- 45 historical markdown notes moved to `docs-archive/`; README rewritten as the single entry point.
