import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureJwtSecret, securityHeaders, rateLimit } from '../server/middleware/security.mjs';

function mockRes() {
  const headers = {};
  return {
    headers,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
  };
}

test('ensureJwtSecret keeps a strong secret', () => {
  process.env.JWT_SECRET = 'a'.repeat(48);
  delete process.env.NODE_ENV; // dev mode
  ensureJwtSecret();
  assert.equal(process.env.JWT_SECRET, 'a'.repeat(48));
});

test('ensureJwtSecret generates one when missing (dev)', () => {
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;
  ensureJwtSecret();
  assert.ok(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
});

test('securityHeaders sets protective headers', () => {
  const res = mockRes();
  const next = () => {};
  securityHeaders({ path: '/api/x', get: () => undefined }, res, next);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.match(res.headers['referrer-policy'] || '', /no-referrer|same-origin/);
});

test('rateLimit blocks after max requests', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 3 });
  const ip = '10.9.9.' + Math.floor(Math.random() * 1000);
  const req = { ip, method: 'GET', originalUrl: '/api/test-' + ip };
  for (let i = 0; i < 3; i++) {
    const res = mockRes();
    let passed = false;
    limiter(req, res, () => { passed = true; });
    assert.ok(passed, `request ${i + 1} should pass`);
  }
  const res = mockRes();
  let passed = false;
  limiter(req, res, () => { passed = true; });
  assert.ok(!passed, '4th request should be blocked');
  assert.equal(res.statusCode, 429);
});
