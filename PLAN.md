# MASTER ROADMAP / PLAN — Professional Attendance Software (Device & User Management)
<!-- FILE: PLAN.md (repo root) — canonical name; the old ROADMAP.md is superseded by this file. -->

> **READ ME FIRST (for future Qwen Coder sessions):**
> This file is the single source of truth for the upgrade plan. Its canonical name is `PLAN.md`
> (formerly `ROADMAP.md`). To resume work, open this file,
> find the **STATUS BOARD** below, and start implementing the first phase marked `NOT STARTED`
> (or `IN PROGRESS`). Each phase lists concrete tasks and **verification markers** — before
> writing any code, check whether the markers already exist in the repo (grep/file read).
> If they do, mark that phase `DONE` here first, then move on. Always update the STATUS BOARD
> and the per-phase checkbox list as you complete items. Commit after each phase with message:
> `roadmap: Phase X complete`.

---

## 1. STATUS BOARD (update this table — it is the pointer to where work stands)

> **RESUME PROTOCOL (follow exactly when starting a new session):**
> 1. Read this whole file, then §1b RECONCILIATION LOG for corrections discovered after audits.
> 2. Run the *marker commands* in each phase's "Verification" block — **trust the code, not the table**.
>    A phase counts as `DONE` only when ALL its marker commands hit AND its DoD (§7) passes.
> 3. Update the Status column + Started/Completed dates below, append a line to §1b, then start
>    the first `NOT STARTED` phase. Never skip phases out of order unless the user asks.
> 4. Commit after each completed task checkbox (`feat(...)`), and after each phase: `roadmap: Phase X complete`.

| Phase | Name | Status | Started | Completed | Primary marker command |
|-------|------|--------|---------|-----------|-------------------------|
| 0 | Route-Level Auth Enforcement & RBAC Repair | `PARTIAL` (auth exists on 13/23 routers; 10 unprotected; requirePermission broken) | — | — | `grep -L authenticateToken server/routes/*.mjs` returns empty |
| 1 | User Security Hardening | `PARTIAL` (refresh rotation ✅; lockout/password-policy/audit ❌) | — | — | `grep -rn lockedUntil server/ database/migrations/` hits |
| 2 | Device Operations & Monitor | `NOT STARTED` | — | — | `grep -rn device_commands server/ database/migrations/` hits + unlock endpoint exists |
| 3 | Schema Sync & Migration Runner | `NOT STARTED` | — | — | `ls database/migrations/_runner*` exists; schema.sql contains migration-007 tables |
| 4 | Missing UI Modules (Payroll/Missions/Corrections/Balances/Exports) | `NOT STARTED` | — | — | `ls src/components \| grep -iE "payroll\|mission"` non-empty |

Status values: `NOT STARTED` → `IN PROGRESS` → `PARTIAL` → `DONE` → `VERIFIED` (tests pass).
When resuming, also run: `git log --oneline | grep -iE "roadmap|plan:"` to see committed phase completions.

### 1b. RECONCILIATION LOG (append one line per audit/session)
- `2026-10-14` — First audit (pre-code) claimed 9 unauthenticated routers + legacy plaintext login backdoor + no refresh tokens. **WRONG**: repo was later refactored to `.mjs`; auth.mjs now has bcrypt-only login with refresh-token rotation.
- `2026-10-14` — Second verification audit (this session) against actual HEAD: findings recorded in §2 below. Table statuses set from real greps. No code changed yet.
- `2026-10-14` — **RESUME POINTER (latest)**: Re-ran every phase marker command at commit `8d64c69`. Result: NO phase implementation code exists yet. P0: all 10 routers still lack `authenticateToken`, no migration ≥009, users.mjs has no `ensureJwtSecret`. P1–P4 markers all empty. The `PARTIAL` labels above reflect pre-existing platform features (§2a), not phase task progress. **Next action for a new session: start Phase 0, task P0.1.**

---

## 2. BASELINE FINDINGS — VERIFIED 2026-10-14 against HEAD (re-run marker commands before acting)

Repo layout (current truth): Express ESM backend `server/index.mjs` + `server/routes/*.mjs` (23 routers),
services in `server/services/` (auth.mjs has `authenticateToken`, `requireRole`, `requirePermission`,
refresh-token issue/consume/revoke), React+Vite+TS frontend `src/` (RTL Persian), ZK bridge `enrollment-bridge/`,
SQL Server `database/` (schema.sql + migrations 001–008), tests `tests/*.test.mjs` (node:test).

### 2a. ALREADY DONE ✅ (do NOT rebuild; extend instead)
- bcrypt-only logins on BOTH `/api/auth/login` and `/api/users/login` (no plaintext fallback — old finding #2 was stale).
- Refresh tokens with rotation + revoke-on-logout (in-memory store in `server/services/auth.mjs`).
- Login/API rate limiting (`server/middleware/rateLimit.mjs`), security headers/CORS (`security.mjs`).
- RBAC tables exist in DB & code: `attendance.Permissions`, `RolePermissions`, `UserRoles` (migrations + roles/permissions/user-roles routers).
- Device webhook ingest with per-device registration + in-memory IP throttle (`devices.mjs:19-29`).
- SSE realtime stream gated by `devices.realtime` permission (migration 008); dashboard uses `useHasPermission`.
- Iranian labor law backend: holidays engine, leave types/balances, missions, corrections, payroll runs/payslips (migrations 006–007, routes exist).
- 13 routers already import `authenticateToken`: auth, devices, holidays, missions, notifications, payroll, permissions, records, reports, roles, stream, units, user-roles.

### 2b. OPEN GAPS ❌ (the actual work items)
1. **10 unprotected routers** (no `authenticateToken` import): admin, company, employees, employee-shifts,
   enrollments, leaves, shift-patterns, shifts, working-hours-rules, users. Marker: `grep -L authenticateToken server/routes/*.mjs`.
2. **`users.mjs` issues**: its own login duplicates auth.mjs (shorter flow, no refresh), hardcodes fallback
   `JWT_SECRET || 'your-secret-key-change-in-production'` (line 8), and its permission endpoints read/write
   `attendance.UserPermissions` which is NOT created by any migration (only listed in `update-schema.mjs`) → runtime errors.
3. **`requirePermission()` broken** (`server/services/auth.mjs:101`): queries non-existent `attendance.UserPermissions`
   joined on `PermissionId`; real model is RolePermissions(UserRoles→RoleId, PermissionId). Admin bypass checks
   `req.user.role === 'admin'` string — verify actual role names ('SuperAdmin'? per-role rows?). Currently unused by routes.
4. **Refresh tokens are in-memory** → lost on restart; no DB `RefreshTokens`/sessions table; no admin force-logout-all.
5. **No lockout** (`FailedLoginAttempts`/`LockedUntil` greps empty), **no password policy/history/expiry**,
   **no self-service reset flow**, **no audit_log table** (Logger writes request logs only).
6. **No device operations**: no `device_commands` table anywhere, no unlock/sync-time/push-user endpoints,
   no poll/backfill scheduler (comment at `devices.mjs:390` references a poller that doesn't exist in-repo),
   webhook secrets returned via `SELECT *` (masking grep empty), no Monitor UI page, no offline alerts.
7. **Frontend**: Sidebar.tsx not permission-filtered (no catalog import); no Payroll/Missions/Corrections/Balances/Holidays-Calendar/Monitor components.
8. **schema.sql lags migrations 003–008**; no migration runner (manual apply order per HANDOFF §5).
9. **Tests**: only unit tests (auth/holidays/security); no route-auth smoke tests proving gap #1 stays fixed.

---

## 3. PHASE 0 — Route Auth Enforcement & RBAC Repair (foundation; do first)

Goal: every business endpoint requires a valid JWT; role+permission checks actually work against the real schema.

Tasks:
- [ ] **P0.1** Apply `authenticateToken` per-router (or via mount in `server/index.mjs`) on the 10 unprotected routers:
      admin, company, employees, employee-shifts, enrollments, leaves, shift-patterns, shifts,
      working-hours-rules, users. Keep public: `/api/auth/login|refresh`, `/api/users/login`, `/api/health`,
      static SPA fallback, and `POST /api/devices/webhook` (device-secret auth + existing IP throttle).
- [ ] **P0.2** Consolidate duplicate logins: make `/api/users/login` delegate to the auth.mjs flow (issue refresh token too); delete its local `JWT_SECRET || 'hardcoded'` constant (reuse `ensureJwtSecret`).
- [ ] **P0.3** Fix `requirePermission()` in `server/services/auth.mjs`: resolve user → `UserRoles` → `RolePermissions` → `Permissions` (add migration `009-permissions-catalog.sql` seeding the Permissions table from `server/services/permissionTree.mjs` keys if not seeded). Superadmin bypass — first check actual role name values in DB (`SELECT Name FROM attendance.Roles`) before hardcoding.
- [ ] **P0.4** Migrate `users.mjs` per-user permission endpoints (lines ~208–227) off the non-existent `attendance.UserPermissions` table onto UserRoles/RolePermissions, OR create that table properly in migration 009 — pick one, document choice here.
- [ ] **P0.5** Mask `WebhookURL` token in GET device list/detail responses; add `POST /api/devices/:id/rotate-secret` (admin-gated).
- [ ] **P0.6** Frontend: verify central API client attaches access token to ALL calls incl. the 10 newly-guarded routers; on 401 try refresh once then redirect to login.
- [ ] **P0.7** Add granular `requirePermission('...')` guards on mutating routes of each router using catalog keys (pattern already used by roles/units routers).

Verification (run ALL; phase DONE only when every command hits):
```bash
grep -L authenticateToken server/routes/*.mjs            # must print nothing
grep -n "UserPermissions" server/services/auth.mjs       # old broken query gone (0 hits)
ls database/migrations/ | grep permissions-catalog       # 009 exists
node --test tests/ && npm run typecheck                  # DoD gate
# server up: curl -s -o /dev/null -w '%{http_code}' localhost:PORT/api/employees  → 401
```
Commit: `roadmap: Phase 0 complete`

## 4. PHASE 1 — User Security Hardening

Goal: enterprise account lifecycle. (Refresh-token rotation already exists in-memory — extend, don't rebuild.)

- [ ] **P1.1** Migration `010-login-lockout.sql`: `FailedLoginAttempts INT`, `LockedUntil DATETIME` on `attendance.Users`; enforce in BOTH login paths; configurable max attempts/minutes via env; reset counter on success.
- [ ] **P1.2** Password policy util (`server/services/passwordPolicy.mjs`): min length + complexity on create/change/reset; Persian error messages.
- [ ] **P1.3** Migration `011-password-history.sql`: `PasswordHistory(UserId, PasswordHash, CreatedAt)`; block reuse of last N hashes; optional `PasswordExpiresAt`.
- [ ] **P1.4** Admin reset-password endpoint (v1: admin-only; single-use self-service token table `012-password-resets.sql` later if asked).
- [ ] **P1.5** Persist refresh tokens: migration `013-refresh-tokens.sql` (`TokenHash, UserId, ExpiresAt, RevokedAt, DeviceInfo`); replace in-memory Map in auth.mjs; logout revokes row; admin endpoint `POST /api/users/:id/revoke-sessions`.
- [ ] **P1.6** Audit trail: migration `014-audit-log.sql` (`AuditLog(ActorUserId, Action, Entity, EntityId, Detail JSON, IpAddress, At)`); write from auth events, user CRUD, role/permission changes, device CRUD, payroll runs. Read-only admin UI tab.
- [ ] **P1.7** Frontend: permission-filtered Sidebar.tsx (reuse existing `useHasPermission`); route guards in App.tsx; UserManagement page gains Unlock / Reset-password / Revoke-sessions buttons.

Verification:
```bash
grep -rn LockedUntil server/ database/migrations/        # hits
grep -rln RefreshTokens database/migrations/             # 013
grep -rn "useHasPermission\|hasPermission" src/components/Sidebar.tsx   # filter wired
node --test tests/ && npm run typecheck
```
Commit: `roadmap: Phase 1 complete`

## 5. PHASE 2 — Device Operations & Monitor

Goal: professional ZKTeco-style fleet management over the existing webhook (ADMS-like) + bridge.

- [ ] **P2.1** Auto-provisioning: on device create, generate unique WebhookURL token server-side (replaces manual entry); registration ping binds serial.
- [ ] **P2.2** Migration `015-device-commands.sql`: `DeviceCommands(Id, DeviceId, Type, Payload, Status pending/delivered/acked/failed, CreatedAt, DeliveredAt)`. Types: unlock, sync_time, push_user, delete_user, get_user, refresh_data.
- [ ] **P2.3** Deliver queued commands in the webhook ACK response body (ZK protocol pattern) — modify `deviceWebhookHandler` in devices.mjs; mark delivered/acked.
- [ ] **P2.4** Endpoints (permission `devices.control`): `POST /api/devices/:id/unlock`, `/sync-time`, `/push-user/:employeeId`, `/delete-user/:employeeId`, `/refresh-data`; `GET /api/devices/:id/status` (queue depth + last seen).
- [ ] **P2.5** Poll/backfill scheduler in `enrollment-bridge` (new `services/poller.mjs` exporting `startPollLoop(deviceRow)` / `backfill(deviceRow)`): boot-time start for online devices at their `PollingInterval`; store `LastPulledAt` per device (migration `016-device-last-pull.sql`); the stop hook referenced at devices.mjs:390 must call into it.
- [ ] **P2.6** Offline detection: sweeper marks device offline after 3×interval without ping; emits on realtimeBus; alert via notifications service (in-app + log).
- [ ] **P2.7** Frontend Monitor page `src/components/DeviceMonitor.tsx`: live punch feed (existing SSE `/api/stream`), per-device online/offline/last-seen/queue-depth cards, action buttons calling P2.4 endpoints. Register in App.tsx nav gated by `devices.realtime`/`devices.manage`.

Verification:
```bash
grep -rn DeviceCommands database/migrations/ server/routes/devices.mjs   # hits
grep -rn "startPollLoop" enrollment-bridge/                               # module exists
ls src/components/DeviceMonitor.tsx
node --test tests/ && npm run typecheck
```
Commit: `roadmap: Phase 2 complete`

## 6. PHASE 3 — Schema Sync & Migration Runner

- [ ] **P3.1** Boot-time runner `server/services/migrate.mjs`: `_migrations(Name, AppliedAt)` table; apply `database/migrations/*.sql` in filename order; idempotent; called from index.mjs bootstrap behind `RUN_MIGRATIONS` env flag (default ON, OFF in tests).
- [ ] **P3.2** Regenerate `database/schema.sql` to include everything through the newest migration (fresh install == prod). Update HANDOFF §5 instructions accordingly.
- [ ] **P3.3** Route-auth smoke test `tests/routeAuth.test.mjs`: iterate all `/api/*` business routes → assert 401 without token (Phase 0 regression net). Stub db layer so no live SQL Server needed.

Verification: `ls server/services/migrate.mjs tests/routeAuth.test.mjs` both exist; spot-check schema.sql contains newest tables; node --test green.
Commit: `roadmap: Phase 3 complete`

## 7. PHASE 4 — Missing UI Modules (backend routes already exist!)

Per HANDOFF backlog #1/#2 — build frontend for existing APIs:
- [ ] **P4.1** PayrollRuns.tsx — run list, create run, payslip view/print (RTL, Vazir embedded).
- [ ] **P4.2** Missions.tsx — mission request/approval list (mirrors Leaves.tsx pattern).
- [ ] **P4.3** Corrections.tsx — clock-correction request/approve workflow (اصلاح تردد).
- [ ] **P4.4** LeaveBalances panel inside Employees or Leaves (۲۶+۲ statutory balances).
- [ ] **P4.5** HolidayCalendar overlay (Jalali month grid via /api/holidays + src/utils/jalali.ts).
- [ ] **P4.6** Excel/PDF export: xlsx endpoint in reports.mjs + Persian-faithful PDF (self-hosted font — NO Google Fonts CDN, blocked in Iran).
- [ ] **P4.7** Wire all pages into App.tsx PageView + permission-filtered sidebar entries.

Verification: `ls src/components | grep -iE "payroll|mission|correction"` non-empty; each page reachable with correct permission; typecheck+tests green.
Commit: `roadmap: Phase 4 complete`

## 7b. OPTIONAL PHASE 5 (stretch — only if user explicitly asks)
Real SMS gateway adapter (Kavenegar), approver delegation, late-tolerance bands, insurance/tax monthly lists,
holidays year-refresh admin tool, E2E harness, backup/ops docs. See HANDOFF §4 backlog rows 3–8, 12.

## 8. EXECUTION RULES FOR QWEN CODER

1. **Never trust this file blindly** — verify markers in the actual repo state first (context between sessions may be lost).
2. One phase at a time; finish verification markers → update STATUS BOARD → commit → next phase.
3. Every DB change ships as a numbered migration file AND gets reflected in schema.sql (Phase 3 makes this automatic; until then do both by hand).
4. Backend changes must include a curl/smoke-test step; frontend changes must build (`npm run build`) without errors.
5. If a task contradicts existing code discovered later, prefer the existing architecture and note the deviation in the phase's checkbox line.
