import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

// Set secret before importing auth (it reads env at module load).
process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');

// Stub server/db.mjs BEFORE it is ever loaded. Without this, the async
// refresh-token helpers would call real `execute()` → mssql tries to open a
// TCP pool against the .env DB host and the test process hangs forever on
// connect retries. The in-memory fallback path is what we want to exercise.
const dbStubUrl = new URL('../server/db.mjs', import.meta.url).href;
Module._cache[dbStubUrl] = { id: dbStubUrl, filename: dbStubUrl, loaded: true, exports: {
  getPool: async () => { throw new Error('no db in tests'); },
  query: async () => { throw new Error('no db in tests'); },
  execute: async () => { throw new Error('no db in tests'); },
  executeInsert: async () => { throw new Error('no db in tests'); },
} };

const { issueRefreshToken, consumeRefreshToken, revokeRefreshToken, generateToken, verifyToken } =
  await import('../server/services/auth.mjs');

// Phase 1 / P1.5 made the refresh-token API async (DB-backed with in-memory
// fallback). Tests run without SQL Server, so they exercise the fallback path.

test('refresh tokens are single-use (rotation)', async () => {
  const t = await issueRefreshToken(42);
  assert.equal(await consumeRefreshToken(t), 42);
  assert.equal(await consumeRefreshToken(t), null, 'reuse must fail after rotation');
});

test('unknown/expired refresh token returns null', async () => {
  assert.equal(await consumeRefreshToken('no-such-token'), null);
});

test('revokeRefreshToken invalidates a live token', async () => {
  const t = await issueRefreshToken(7);
  await revokeRefreshToken(t);
  assert.equal(await consumeRefreshToken(t), null);
});

test('generateToken/verifyToken roundtrip', () => {
  const user = { id: 1, username: 'admin', role: 'admin' };
  const token = generateToken(user);
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.id ?? payload.userId ?? payload.sub, 1);
});

test('verifyToken rejects garbage', () => {
  assert.equal(verifyToken('not.a.jwt'), null);
});
