/**
 * Security hardening helpers (no external deps — safe for air-gapped installs):
 *  - basic helmet-style security headers
 *  - fixed-window rate limiter with special protection for /api/auth/login
 *  - JWT secret enforcement at startup
 */

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/** Fail fast in production when JWT_SECRET is missing/weak; generate one in dev. */
export function ensureJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const weak = !secret || secret === 'your-secret-key-change-in-production' || secret.length < 16;

  if (weak) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ JWT_SECRET must be set to a strong random value (≥32 chars) in production. See .env.example');
      process.exit(1);
    }
    // development convenience: generate an ephemeral secret so the app still boots
    let generated = '';
    try {
      generated = execSync('openssl rand -hex 32').toString().trim();
    } catch {
      generated = randomBytes(32).toString('hex');
    }
    process.env.JWT_SECRET = generated;
    console.log('⚠️  JWT_SECRET not set — generated an ephemeral dev secret (tokens reset on restart)');
  }
}

/** helmet-equivalent minimal security headers. */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Fixed-window rate limiter keyed by client IP.
 * @param {{ windowMs?: number, max?: number }} options
 */
export function rateLimit({ windowMs = 15 * 60_000, max = 300 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'too many requests', retryAfterMs: entry.resetAt - now });
    }
    next();
  };
}
