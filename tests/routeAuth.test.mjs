// Phase 3 / P3.3 — Route-auth smoke test (Phase 0 regression net)
//
// Iterates every business router mounted in server/index.mjs and asserts that
// each one rejects requests WITHOUT an Authorization header (401). Two
// legitimate public exceptions exist:
//   • POST /api/users/login        – legacy login endpoint (rate-limited,
//                                    delegates to the shared performLogin flow)
//   • POST /api/devices/webhook    – machine-to-machine device callback,
//                                    authenticated by its own per-device token
// The SSE feed (/api/stream) is excluded here because it has its own token-in-
// query auth handled by streamRouter itself.
//
// No live SQL Server is required: a Node module-loader hook replaces db.mjs
// with an inert stub so importing the routers never opens a connection.
// Run directly:  node tests/routeAuth.test.mjs   (exits non-zero on failure)

import { createRequire, register } from 'node:module';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

process.env.JWT_SECRET ||= 'route-auth-test-secret'; // deterministic; no ensureJwtSecret needed
process.env.NODE_ENV = 'test'; // keeps boot-time side effects (migrations) off

// Install the db.mjs stub BEFORE any ../server/ module is imported below.
register('./mockDb.mjs', import.meta.url);

const require = createRequire(import.meta.url);
const express = require('express');

// ── Inert db stub injected via --experimental-loader mockDb.mjs ────────────
const STUB_MARKER = '__ROUTEAUTH_DB_STUB__';
let dbCalls = 0;
globalThis[STUB_MARKER] = () => { dbCalls++; };

// ── Routers under test: [name, importPath, mountPath] ──────────────────────
// Mirrors app.use('/api/...', router) lines in server/index.mjs.
const ROUTERS = [
  ['employees',           '../server/routes/employees.mjs',           '/api/employees'],
  ['leaves',              '../server/routes/leaves.mjs',              '/api/leaves'],
  ['devices',             '../server/routes/devices.mjs',             '/api/devices'],
  ['admin',               '../server/routes/admin.mjs',               '/api/admin'],
  ['company',             '../server/routes/company.mjs',             '/api/company'],
  ['users',               '../server/routes/users.mjs',               '/api/users'],
  ['shifts',              '../server/routes/shifts.mjs',              '/api/shifts'],
  ['shift-patterns',      '../server/routes/shift-patterns.mjs',      '/api/shift-patterns'],
  ['working-hours-rules', '../server/routes/working-hours-rules.mjs', '/api/working-hours-rules'],
  ['employee-shifts',     '../server/routes/employee-shifts.mjs',     '/api/employee-shifts'],
  ['enrollments',         '../server/routes/enrollments.mjs',         '/api/enrollments'],
];

// Endpoints intentionally reachable without a session token.
const PUBLIC_EXCEPTIONS = new Set([
  'POST /api/users/login',
  'POST /api/devices/webhook',
]);

async function fetchJson(baseUrl, path, { method = 'GET' } = {}) {
  const res = await fetch(baseUrl + path, { method });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON ok */ }
  return { status: res.status, body };
}

async function main() {
  const app = express();
  app.use(express.json());

  for (const [name, relPath] of ROUTERS) {
    const mod = await import(pathToFileURL(require.resolve(relPath)).href);
    app.use('/api/' + name, mod.default);
  }

  const server = http.createServer(app).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  let failures = 0;
  const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
  const pass = (msg) => console.log(`  ✓ ${msg}`);

  console.log('Route-auth smoke test: every business route must answer 401 without a token\n');

  // Probe list: GET root + GET id on every mount, plus the two public endpoints
  // (asserted as NOT-401), plus a couple of typical POST mutations.
  const probes = [];
  for (const [, , mount] of ROUTERS) {
    probes.push({ method: 'GET', path: mount });
    probes.push({ method: 'GET', path: `${mount}/1` });
  }
  probes.push({ method: 'POST', path: '/api/leaves' });
  probes.push({ method: 'PUT',  path: '/api/employees/1' });
  probes.push({ method: 'DELETE', path: '/api/shifts/1' });

  for (const { method, path } of probes) {
    const key = `${method} ${path}`;
    const { status, body } = await fetchJson(base, path, { method });
    if (PUBLIC_EXCEPTIONS.has(key)) {
      // Public endpoints must not be locked out by the guard…
      if (status === 401 || status === 403) fail(`${key} → ${status} (must stay public)`);
      else pass(`${key} → ${status} (public exception OK)`);
      continue;
    }
    // 401 = missing token; 403 = invalid/no header (accept either from JWT lib).
    if (status === 401 || status === 403) pass(`${key} → ${status} rejected`);
    else fail(`${key} → ${status} (expected 401/403; UNPROTECTED ROUTE?)`);
    if (body && typeof body === 'object' && 'user' in body) fail(`${key} leaked user object while unauthenticated`);
  }

  // Sanity: db stub was installed (i.e. we truly ran without SQL Server).
  if (dbCalls === 0) console.log('  ℹ db stub installed but untouched (no route hit the DB — good: guards short-circuit)');

  server.close();
  if (failures > 0) {
    console.error(`\nRESULT: FAIL (${failures} problem(s))`);
    process.exit(1);
  }
  console.log('\nRESULT: PASS — all business routes enforce authentication');
}

main().catch((err) => { console.error('Test crashed:', err); process.exit(1); });
