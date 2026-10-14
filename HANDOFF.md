# HANDOFF — Spersia Attendance System (Iran)

> Give this file to the next chat/agent working on the repo. It tells them exactly
> where the project stands, what was done, known pitfalls, and what to build next.

**Project:** Spersia Attendance System — biometric attendance + Iranian labor-law HR suite
**Stack:** Node.js 22 (ESM) + Express + SQL Server (`mssql`) backend · React 18 + Vite + TypeScript frontend (RTL, Persian UI)
**Version:** 11.0.0 · **Branch HEAD:** `9550e9c3`
**Verified state (at handoff time):** `node --test tests/` → **all pass, 0 failures** · server modules load cleanly · `npm run typecheck` → **0 errors** (fixed at commit 9550e9c3: added missing `enrollmentsAPI` + enrollment types to `src/utils/api.ts`).

---

## 1. Repository map (what matters)

server/
  index.mjs              # Express app; mounts all routes; SSE stream; SPA fallback
  routes/                # auth, users, roles, permissions, user-roles, employees,
                         # records, devices, enrollments, shifts, employee-shifts,
                         # shift-patterns, working-hours-rules, units, company, admin,
                         # holidays, leaves, missions, payroll, notifications, reports, stream
  services/
    holidays.mjs         # ★ Iranian Jalali holiday engine (single source of truth)
    payrollEngine.mjs    # overtime × multiplier, night %, Friday/holiday %, payslip math
    notifications.mjs    # SMS (Kavenegar-style)/email logging abstraction
    realtimeBus.mjs      # SSE pub/sub (device events → dashboards)
    auth.mjs             # JWT sign/verify (verifyToken returns null on bad token)
    deviceService.mjs    # device log → attendance record conversion
    permissionTree.mjs   # RBAC tree
  middleware/
    rateLimit.mjs        # login/API rate limiting
    security.mjs         # headers, CORS hardening
database/migrations/     # 001..007 SQL files (006 = Iran holidays, 007 = Iran labor law:
                         #   leave types/balances, missions, corrections, payroll runs/payslips)
src/                     # React frontend (App.tsx, components/, contexts/, utils/jalali.ts)
enrollment-bridge/       # local bridge service for biometric enrollment devices
tests/                   # node:test suites: auth.test.mjs, holidays.test.mjs, security.test.mjs
docs-archive/            # 45 historical .md docs (do not treat as current)
Dockerfile / docker-compose.yml / .github/workflows/ci.yml

## 2. What's already implemented ✅

- **Full auth**: JWT + refresh-token rotation, RBAC with permission tree, rate limiting, security headers, auth enforced on every API route.
- **Devices**: 10 biometric protocol drivers (ZK, Controlianz, ToSan, BioStar2, …), soft-delete, webhook ingest, enrollment bridge, SSE realtime stream.
- **Scheduling**: shifts, patterns, periodic shifts, working-hours rules.
- **Iran features**:
  - Jalali calendar frontend (`src/utils/jalali.ts`, Vazir font RTL UI)
  - Holiday engine `server/services/holidays.mjs` (Nowruz incl. last-Friday rule, religious/national, Fridays) wired into `/api/holidays` route and into device→record conversion (`isNonWorkingDay` tags records as `holiday`).
  - Labor law: extended leave types (استعلاجی/بدون حقوق/ازدواج/سوگ/حج/تکلیف), statutory balances (۲۶+۲ روز), multi-level approval chain, missions (مأموریت), clock corrections (اصلاح تردد), payroll runs with payslips (اضافه‌کاری×ضریب، شب‌کاری ۳۵٪، جمعه‌کاری ۴۰٪، حق غذا/ایاب و ذهاب), notification logging table.
- **Infra**: CI (typecheck+tests+build+smoke), Docker/compose, CHANGELOG, README rewrite.

## 3. Known pitfalls — READ BEFORE EDITING ⚠️

1. **`server/services/holidays.mjs` exports are contractual.** Two other files import from it; if you rewrite it, keep ALL of these exports:
   `JALALI_MONTH_NAMES, IRAN_HOLIDAYS, FRIDAY_INDEX, getHolidaysForYear, isHoliday, holidayName, isIranHoliday, isWeeklyRestDay, isNonWorkingDay, workingDaysInMonth, holidaysInMonth`
   - `routes/devices.mjs` needs `isNonWorkingDay`; `routes/holidays.mjs` needs `holidayName/isIranHoliday/isWeeklyRestDay`. Past crashes were exactly missing exports here.
2. **jalaali-js v2 ESM quirk:** no default export. Use `import * as jalali from 'jalaali-js'`. The function is **`toJalaali`** (not `toJalali`) and returns an **object `{ jy, jm, jd }`**, not an array.
3. **Date keys:** internal holiday-map keys are strings `jy/mm/dd` zero-padded. Gregorian↔Jalali conversion goes through `toGregorian/toJalaali`.
4. **SQL Server, not Postgres.** `mssql` package, migrations are raw T-SQL. `database/schema.sql` is now fully synced through the latest migration (Phase 3) and the boot-time runner `server/services/migrate.mjs` applies any pending `database/migrations/*.sql` automatically (track table: `attendance._migrations`; disable with `RUN_MIGRATIONS=false`). Note: schema.sql contains a `USE AttendanceDB;` batch — run it via SSMS/sqlcmd, not through the app pool.
5. **Windows dev machine** (`E:\Projects\NodeJS\attendance`): `npm run start` = concurrently(server+vite). Server still requires reachable DB via `.env` (see `.env.example`).
6. Don't delete `dist/` tracking assumptions without checking; don't re-add Google Fonts CDN (blocked in Iran — fonts must stay self-hosted).
7. Religious lunar dates in `IRAN_HOLIDAYS` are approximations keyed by Jalali month/day — they drift ~11 days/year; annual refresh flow is a TODO, not a bug.

## 4. Feature backlog — what to build next (priority order)

| # | Feature | Where | Notes |
|---|---------|-------|-------|
| 1 | Frontend pages for new APIs | `src/components/` | Payroll runs & payslip view, missions, corrections workflow, leave balances panel, holiday calendar overlay. Backend routes exist; UI mostly missing. |
| 2 | Excel/PDF export | `reports.mjs` + frontend | xlsx/exceljs + Persian-faithful PDF (embedded Vazir, RTL). Monthly کارکرد sheets, فیش حقوقی printable. No xlsx/pdf lib installed yet. |
| 3 | Real SMS gateway | `services/notifications.mjs` | Currently logs only. Implement Kavenegar/SMS.ir adapter + per-user prefs + retry/delivery log. |
| 4 | Approver delegation | `leaves.mjs` chain | Delegate approvals when approver is on leave; audit trail per step. |
| 5 | Late-tolerance bands | `working-hours-rules` | Configurable بخورد/بخودنوردی thresholds per org; tag records `late_tolerance`. |
| 6 | Insurance & tax lists | new `payroll` sub-route | لیست بیمه تأمین اجتماعی + مالیات حقوق (پایه معافیت) monthly exports in required formats. |
| 7 | Holidays year-refresh tooling | `holidays.mjs` + admin UI | Seed script/admin editor for movable lunar dates per official announcement; store overrides in DB table instead of code constants. |
| 8 | Night-shift & hard-work rules | `payrollEngine.mjs` | Verify نوبت‌کاری rotating calendars, سختی کار classifications. |
| 9 | ~~Fix Enrollments.tsx TS errors~~ ✅ DONE | `src/utils/api.ts` | Added `enrollmentsAPI`, `EnrollmentMeta/Template/Payload`, `TransferOutcome/Result`; wired `'enrollments'` into `PageView`. |
| 10 | ~~Sync `schema.sql`~~ ✅ DONE (Phase 3) | `database/` + `server/services/migrate.mjs` | Base schema folded through migration 017; boot-time idempotent runner added. |
| 11 | E2E smoke | `tests/` | supertest against key routes with a mocked/`mssql` stub; currently only unit tests exist. |
| 12 | Backup/ops docs | `README.md` | SQL Agent job examples, restore drill. |
| — | Realtime attendance feed permission ✅ DONE | `stream.mjs`, `devices.mjs` | New permission `devices.realtime` (مشاهده زنده تردد دستگاه‌ها, migration 008) gates both SSE endpoints (`/api/stream`, `/api/devices/stream`); admins bypass, others fail closed. Dashboard opens the EventSource only when the user holds it (`useHasPermission`). Device webhook input is validated/normalized before insert/publish. |

## 5. How to get running quickly

cp .env.example .env      # fill DB_* + JWT_SECRET (openssl rand -hex 32)
npm install
# fresh DB: run database/schema.sql once (SSMS/sqlcmd), then just start the server —
# the boot-time migrate runner applies any missing database/migrations/*.sql automatically
npm run seed && npm run seed:admin
npm test                  # must be green before/after changes
npm run start             # server :PORT + vite client

**Definition of done for any new work:** `node --test tests/` passes, `npm run typecheck` introduces no new errors, server boots without ESM import errors, and the change is committed with a conventional-commit message.

---
*Generated 2026-10-10. If HEAD differs, re-run tests and apply the same changes to your local copy.*
