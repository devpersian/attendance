import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { execute } from '../db.mjs';
import { Logger } from './logger.mjs';
import { writeAudit } from './auditLog.mjs';
import { validatePassword } from './passwordPolicy.mjs';
import {
  getUserRoleAssignments,
  getEffectivePermissionIds,
  getAllPermissions,
} from './permissionTree.mjs';

// ── Phase 1 / P1.1 — shared login credential flow ──────────────────────────
// Both /api/auth/login and the legacy /api/users/login delegate here so that
// lockout, password-expiry checks and audit events are enforced identically
// (the old finding of two diverging login paths must never come back).
// Env-tunable: MAX_FAILED_LOGINS (default 5), LOCKOUT_MINUTES (default 15),
// PASSWORD_EXPIRY_DAYS (default 0 = never expires).

export const LOCKOUT_MAX_ATTEMPTS = parseInt(process.env.MAX_FAILED_LOGINS || '5', 10);
export const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES || '15', 10);

async function registerFailedLogin(userId) {
  // Increment counter; lock the account when the threshold is crossed.
  await execute(
    `UPDATE attendance.Users
     SET FailedLoginAttempts = FailedLoginAttempts + 1,
         LockedUntil = CASE WHEN FailedLoginAttempts + 1 >= @max THEN DATEADD(MINUTE, @minutes, GETDATE()) ELSE LockedUntil END
     WHERE Id = @id`,
    { id: userId, max: LOCKOUT_MAX_ATTEMPTS, minutes: LOCKOUT_MINUTES },
  );
}

export async function performLogin({ username, password, req }) {
  const users = await execute(
    `SELECT Id, Username, PasswordHash, Email, Role, EmployeeId, IsActive, LockedUntil, FailedLoginAttempts, PasswordExpiresAt
     FROM attendance.Users WHERE Username = @username`,
    { username },
  );

  if (users.length === 0) {
    await Logger.log('warning', 'LOGIN_FAILED', 'auth', null, `User not found: ${username}`, { username });
    await writeAudit({ action: 'LOGIN_FAILED', entity: 'user', entityId: null, detail: { username, reason: 'not-found' }, req });
    return { status: 401, body: { error: 'نام کاربری یا رمز عبور اشتباه است' } };
  }

  const user = users[0];

  if (user.LockedUntil && new Date(user.LockedUntil) > new Date()) {
    const remaining = Math.max(1, Math.ceil((new Date(user.LockedUntil) - Date.now()) / 60_000));
    await writeAudit({ action: 'LOGIN_LOCKED_REJECTED', entity: 'user', entityId: user.Id, detail: { username, remainingMinutes: remaining }, req });
    return { status: 423, body: { error: `حساب کاربری به دلیل تلاش‌های ناموفق مکرر قفل شده است. حدود ${remaining} دقیقه دیگر دوباره تلاش کنید.` } };
  }

  if (!user.IsActive) {
    await writeAudit({ actorUserId: user.Id, action: 'LOGIN_INACTIVE_REJECTED', entity: 'user', entityId: user.Id, detail: { username }, req });
    return { status: 403, body: { error: 'حساب کاربری غیرفعال است' } };
  }

  // Lazy import avoids a static cycle auth.mjs <-> routes/users.mjs.
  const bcrypt = (await import('bcryptjs')).default;
  const isValidPassword = await bcrypt.compare(password, user.PasswordHash);

  if (!isValidPassword) {
    await registerFailedLogin(user.Id);
    let lockedNow = false;
    try {
      const after = await execute('SELECT FailedLoginAttempts, LockedUntil FROM attendance.Users WHERE Id = @id', { id: user.Id });
      lockedNow = !!(after[0]?.LockedUntil && new Date(after[0].LockedUntil) > new Date());
    } catch { /* status probe is best-effort */ }
    await writeAudit({ actorUserId: user.Id, action: lockedNow ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', entity: 'user', entityId: user.Id, detail: { username, reason: 'bad-password' }, req });
    return { status: 401, body: { error: 'نام کاربری یا رمز عبور اشتباه است' } };
  }

  if (user.PasswordExpiresAt && new Date(user.PasswordExpiresAt) < new Date()) {
    await writeAudit({ actorUserId: user.Id, action: 'LOGIN_PASSWORD_EXPIRED', entity: 'user', entityId: user.Id, detail: { username }, req });
    return { status: 403, body: { error: 'رمز عبور شما منقضی شده است. با پشتیبانی یا مدیر سیستم تماس بگیرید.', code: 'PASSWORD_EXPIRED' } };
  }

  // Success: reset counters, stamp last login.
  await execute(
    'UPDATE attendance.Users SET FailedLoginAttempts = 0, LockedUntil = NULL, LastLogin = GETDATE() WHERE Id = @id',
    { id: user.Id },
  );

  const token = generateToken({ id: user.Id, username: user.Username, role: user.Role });
  const refreshToken = await issueRefreshToken(user.Id, req?.headers?.['user-agent'] || null);

  let assignments = [];
  try {
    assignments = await getUserRoleAssignments(user.Id);
  } catch {
    // never break login because of the assignment lookup
  }

  await Logger.log('success', 'LOGIN_SUCCESS', 'auth', user.Id, `User logged in: ${username}`, { username, role: user.Role }, user.Id);
  await writeAudit({ actorUserId: user.Id, action: 'LOGIN_SUCCESS', entity: 'user', entityId: user.Id, detail: { username }, req });

  return {
    status: 200,
    body: {
      token,
      refreshToken,
      user: {
        id: user.Id,
        username: user.Username,
        email: user.Email,
        role: user.Role,
        employeeId: user.EmployeeId,
        roles: [...new Set(assignments.map(a => a.roleName))],
        roleAssignments: assignments,
      },
    },
  };
}

// ── Phase 1 / P1.3 — password history ──────────────────────────────────────
export async function assertPasswordNotReused(userId, newPassword, bcrypt) {
  const size = parseInt(process.env.PASSWORD_HISTORY_SIZE || '5', 10);
  if (size <= 0) return;
  const rows = await execute(
    'SELECT TOP (@size) PasswordHash FROM attendance.PasswordHistory WHERE UserId = @userId ORDER BY CreatedAt DESC',
    { userId, size },
  ).catch(() => []); // table missing before migration applied → don't block changes
  for (const row of rows) {
    if (await bcrypt.compare(newPassword, row.PasswordHash)) {
      throw Object.assign(new Error('رمز عبور جدید قبلاً استفاده شده است. از رمز تازه‌ای استفاده کنید.'), { status: 400 });
    }
  }
}

export async function recordPasswordHash(userId, passwordHash) {
  await execute(
    'INSERT INTO attendance.PasswordHistory (UserId, PasswordHash, CreatedAt) VALUES (@userId, @hash, GETDATE())',
    { userId, hash: passwordHash },
  ).catch(() => {}); // best-effort until migration 011 is applied
}

// Central "set a new password" used by change-password and admin resets:
// policy → history → hash → store (+history row) → revoke sessions → audit.
export async function setPassword({ userId, newPassword, currentHash, actorUserId, req, bypassPolicy = false }) {
  const bcrypt = (await import('bcryptjs')).default;

  if (!bypassPolicy) {
    const check = validatePassword(newPassword);
    if (!check.ok) {
      throw Object.assign(new Error(check.errors.join(' — ')), { status: 400 });
    }
  } else if (!newPassword || String(newPassword).length < 6) {
    throw Object.assign(new Error('رمز عبور جدید باید حداقل ۶ کاراکتر باشد'), { status: 400 });
  }

  await assertPasswordNotReused(userId, newPassword, bcrypt);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await execute(
    'UPDATE attendance.Users SET PasswordHash = @passwordHash, UpdatedAt = GETDATE() WHERE Id = @id',
    { passwordHash, id: userId },
  );
  await recordPasswordHash(userId, passwordHash);

  // A password change always invalidates every existing session.
  await revokeAllRefreshTokens(userId);

  await writeAudit({
    actorUserId: actorUserId ?? userId,
    action: actorUserId && Number(actorUserId) !== Number(userId) ? 'ADMIN_PASSWORD_RESET' : 'PASSWORD_CHANGED',
    entity: 'user',
    entityId: userId,
    detail: { selfChange: !actorUserId || Number(actorUserId) === Number(userId) },
    req,
  });
}

// Secret is validated/generated at startup by ensureJwtSecret() in server/index.mjs
// (called BEFORE any router is loaded). Read lazily via a getter so this module
// never embeds the hardcoded fallback secret itself — that was a Phase 0 finding
// (P0.2: duplicate login paths signing with 'your-secret-key-change-in-production').
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. ensureJwtSecret() must run at startup (see server/middleware/security.mjs).');
  }
  return secret;
}
const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '24h';

// ── Phase 1 / P1.5 — persistent refresh tokens (attendance.RefreshTokens) ──
// DB-backed store so sessions survive restarts and admins can force-logout a
// user. Only SHA-256 hashes are stored. The in-memory Map below is now just a
// best-effort mirror: if the DB layer is unreachable (tests, migration not yet
// applied) issue/consume transparently fall back to it, so login NEVER breaks
// because of the session table.

const refreshTokens = new Map(); // token -> { userId, expiresAt }
const REFRESH_TTL_MS = 7 * 24 * 60 * 60_000; // 7 days

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of refreshTokens) if (entry.expiresAt <= now) refreshTokens.delete(token);
}, 60 * 60_000).unref();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId, deviceInfo = null) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  refreshTokens.set(token, { userId, expiresAt: expiresAt.getTime() });
  try {
    await execute(
      `INSERT INTO attendance.RefreshTokens (TokenHash, UserId, ExpiresAt, DeviceInfo, CreatedAt)
       VALUES (@tokenHash, @userId, @expiresAt, @deviceInfo, GETDATE())`,
      { tokenHash: hashToken(token), userId, expiresAt, deviceInfo: deviceInfo ? String(deviceInfo).slice(0, 300) : null },
    );
  } catch {
    // DB unavailable or migration 013 not applied yet → memory-only session
  }
  return token;
}

export async function consumeRefreshToken(token) {
  const tokenHash = hashToken(token);

  // Preferred path: single-use rotation enforced in the DB.
  try {
    const rows = await execute(
      `SELECT UserId, ExpiresAt FROM attendance.RefreshTokens
       WHERE TokenHash = @tokenHash AND RevokedAt IS NULL AND ExpiresAt > GETDATE()`,
      { tokenHash },
    );
    if (rows.length === 0) {
      // Not valid per DB. If the DB is actually reachable we treat the store as
      // authoritative ONLY when the table has rows; an empty/absent table means
      // persistence is not set up → fall through to the memory map.
      const anyRows = await execute('SELECT COUNT(*) AS Cnt FROM attendance.RefreshTokens', {}).catch(() => null);
      if (anyRows && Number(anyRows[0].Cnt) > 0) {
        refreshTokens.delete(token);
        return null;
      }
    } else {
      await execute('UPDATE attendance.RefreshTokens SET RevokedAt = GETDATE() WHERE TokenHash = @tokenHash', { tokenHash });
      refreshTokens.delete(token);
      return rows[0].UserId;
    }
  } catch {
    // DB error → memory fallback below
  }

  const entry = refreshTokens.get(token);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  // rotation: a refresh token is single-use
  refreshTokens.delete(token);
  return entry.userId;
}

export async function revokeRefreshToken(token) {
  refreshTokens.delete(token);
  await execute(
    'UPDATE attendance.RefreshTokens SET RevokedAt = GETDATE() WHERE TokenHash = @tokenHash',
    { tokenHash: hashToken(token) },
  ).catch(() => {});
}

// Force-logout: revoke every persisted + mirrored session of a user.
export async function revokeAllRefreshTokens(userId) {
  await execute(
    'UPDATE attendance.RefreshTokens SET RevokedAt = GETDATE() WHERE UserId = @userId AND RevokedAt IS NULL',
    { userId },
  ).catch(() => {});
  for (const [token, entry] of refreshTokens) if (entry.userId === userId) refreshTokens.delete(token);
}

// Authentication middleware
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Bearer TOKEN; SSE clients (EventSource) cannot set headers, so a
  // ?token= query parameter is accepted as a fallback (see /api/stream).
  const token = (authHeader && authHeader.split(' ')[1]) || req.query?.token;

  if (!token) {
    await Logger.logRequest(req.method, req.url, 401, 0, null, { reason: 'No token provided' });
    return res.status(401).json({ error: 'توکن احراز هویت ارسال نشده است' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret());
    
    // Fetch user from database
    const user = await execute(
      'SELECT Id, Username, Email, Role, IsActive FROM attendance.Users WHERE Id = @id',
      { id: decoded.userId }
    );

    if (user.length === 0) {
      await Logger.logRequest(req.method, req.url, 401, 0, null, { reason: 'User not found' });
      return res.status(401).json({ error: 'کاربر یافت نشد' });
    }

    if (!user[0].IsActive) {
      await Logger.logRequest(req.method, req.url, 403, 0, decoded.userId, { reason: 'User inactive' });
      return res.status(403).json({ error: 'حساب کاربری غیرفعال است' });
    }

    // Attach user to request. Roles are many-per-user and optionally scoped to
    // units (attendance.UserRoles); Users.Role stays as the primary role code.
    let assignments = [];
    try {
      assignments = await getUserRoleAssignments(user[0].Id);
    } catch {
      // assignment lookup must never break authentication itself
    }

    req.user = {
      id: user[0].Id,
      username: user[0].Username,
      email: user[0].Email,
      role: user[0].Role,
      roles: [...new Set(assignments.map(a => a.roleName))],
      roleAssignments: assignments,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      await Logger.logRequest(req.method, req.url, 401, 0, null, { reason: 'Token expired' });
      return res.status(401).json({ error: 'توکن منقضی شده است' });
    }
    
    await Logger.logError('AUTH', 'middleware', null, 'Token verification failed', error);
    return res.status(403).json({ error: 'توکن نامعتبر است' });
  }
}

/**
 * Does a session user (as attached by authenticateToken) effectively hold a
 * permission? Resolution order (Phase 0 / P0.3 rewrite):
 *   1. Legacy primary-role bypass: Users.Role = 'admin' (the seeded admin
 *      account predates the UserRoles model and holds no assignments).
 *   2. Real RBAC chain: UserRoles -> RolePermissions -> Permissions with BOTH
 *      tree inheritances applied (role ancestors grant down; a granted
 *      permission node implies all its descendants) - see permissionTree.mjs.
 */
export async function hasEffectivePermission(user, permissionName) {
  if (!user) return false;
  if (user.role === 'admin') return true; // legacy primary-role superadmin bypass

  const roleIds = (user.roleAssignments || []).map(a => a.roleId);
  if (roleIds.length === 0) return false;

  const effective = await getEffectivePermissionIds(roleIds);
  if (effective.size === 0) return false;

  const permissions = await getAllPermissions();
  return permissions.some(p => effective.has(Number(p.Id)) && p.Name === permissionName);
}

// Permission checking middleware
export function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'احراز هویت نشده است' });
    }

    try {
      // Phase 0 / P0.3: resolve through the REAL RBAC chain
      // (UserRoles -> RolePermissions -> Permissions with role-tree and
      // permission-tree inheritance). The previous implementation queried
      // attendance.UserPermissions, a table no migration ever created.
      const allowed = await hasEffectivePermission(req.user, permission);

      if (!allowed) {
        await Logger.log(
          'warning',
          'PERMISSION_DENIED',
          'api',
          null,
          `User ${req.user.username} attempted to access ${permission}`,
          { permission, url: req.url, method: req.method },
          req.user.id
        );
        return res.status(403).json({ error: 'شما دسترسی به این عملیات را ندارید' });
      }

      next();
    } catch (error) {
      await Logger.logError('AUTH', 'permission_check', null, 'Permission check failed', error, { userId: req.user.id });
      return res.status(500).json({ error: 'خطا در بررسی دسترسی' });
    }
  };
}

// Role checking middleware
export function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'احراز هویت نشده است' });
    }

    // A user may hold several roles across units; accept if ANY assignment
    // (or the primary Users.Role code) matches one of the required roles.
    const heldRoles = new Set([
      req.user.role,
      ...(req.user.roles || []),
    ]);
    if (roles.some(r => heldRoles.has(r))) {
      return next();
    }

    {
      await Logger.log(
        'warning',
        'ROLE_DENIED',
        'api',
        null,
        `User ${req.user.username} with role ${req.user.role} attempted to access restricted endpoint`,
        { requiredRoles: roles, url: req.url, method: req.method },
        req.user.id
      );
      return res.status(403).json({ error: 'شما دسترسی به این بخش را ندارید' });
    }

    next();
  };
}

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    jwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

// Verify JWT token. Returns the payload, or null if invalid/expired.
export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}
