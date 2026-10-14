import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { authenticateToken, requireRole } from '../services/auth.mjs';
import { writeAudit } from '../services/auditLog.mjs';
import {
  getUserRoleAssignments,
  getEffectivePermissionsForAssignments,
} from '../services/permissionTree.mjs';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

/**
 * A user may hold MULTIPLE roles, each optionally scoped to an organizational
 * unit (attendance.Units). UnitId NULL = global assignment (valid in every
 * unit). Exactly one assignment per user is flagged IsPrimary.
 */

async function assertUserExists(userId) {
  const users = await execute(
    'SELECT Id, Username, Role FROM attendance.Users WHERE Id = @id',
    { id: userId }
  );
  return users[0] || null;
}

async function assertUnitExists(unitId) {
  const units = await execute('SELECT Id, Name FROM attendance.Units WHERE Id = @id', { id: unitId });
  return units[0] || null;
}

// GET /api/user-roles/:userId - Get a user's role assignments (with units)
router.get('/:userId', async (req, res) => {
  const startTime = Date.now();

  try {
    const user = await assertUserExists(req.params.userId);
    if (!user) {
      await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const assignments = await getUserRoleAssignments(user.Id);

    await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}`, 200, Date.now() - startTime, req.user.id);
    res.json(assignments);
  } catch (error) {
    await Logger.logError('USER_ROLES', 'get', req.params.userId, 'Get user roles error', error, { userId: req.user.id });
    await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت نقش‌های کاربر' });
  }
});

// GET /api/user-roles/:userId/effective?unitId=N - Effective permissions for a user, optionally scoped to one unit
router.get('/:userId/effective', async (req, res) => {
  const startTime = Date.now();

  try {
    const user = await assertUserExists(req.params.userId);
    if (!user) {
      await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}/effective`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const assignments = await getUserRoleAssignments(user.Id);
    const unitId = req.query.unitId ? Number(req.query.unitId) : null;
    const effective = await getEffectivePermissionsForAssignments(assignments, unitId);

    await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}/effective`, 200, Date.now() - startTime, req.user.id);
    res.json({ userId: user.Id, unitId, permissionIds: [...effective] });
  } catch (error) {
    await Logger.logError('USER_ROLES', 'effective', req.params.userId, 'Get effective permissions error', error, { userId: req.user.id });
    await Logger.logRequest('GET', `/api/user-roles/${req.params.userId}/effective`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت دسترسی‌های مؤثر کاربر' });
  }
});

// PUT /api/user-roles/:userId - Replace all assignments: [{ roleId, unitId?, isPrimary? }]
router.put('/:userId', async (req, res) => {
  const startTime = Date.now();

  try {
    const { assignments } = req.body;

    // Back-compat: accept a plain array of role ids as global assignments
    const normalized = Array.isArray(assignments)
      ? assignments.map(a => (typeof a === 'object' ? a : { roleId: a }))
      : null;

    if (!normalized) {
      await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Invalid assignments' });
      return res.status(400).json({ error: 'لیست نقش‌ها نامعتبر است' });
    }

    const user = await assertUserExists(req.params.userId);
    if (!user) {
      await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    if (user.Role === 'admin') {
      await Logger.log('warning', 'USER_ROLES_UPDATE_DENIED', 'user_roles', req.params.userId, 'Attempted to modify admin user roles', { adminId: req.user.id });
      await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 403, Date.now() - startTime, req.user.id, { reason: 'Cannot modify admin' });
      return res.status(403).json({ error: 'نقش‌های مدیر سیستم قابل تغییر نیستند' });
    }

    // Validate every referenced role/unit before mutating anything
    for (const a of normalized) {
      if (!a.roleId) {
        await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Missing roleId' });
        return res.status(400).json({ error: 'شناسه نقش الزامی است' });
      }
      const role = await execute('SELECT Id FROM attendance.Roles WHERE Id = @id', { id: a.roleId });
      if (role.length === 0) {
        await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Role not found' });
        return res.status(400).json({ error: `نقش با شناسه ${a.roleId} یافت نشد` });
      }
      if (a.unitId != null && a.unitId !== '') {
        const unit = await assertUnitExists(a.unitId);
        if (!unit) {
          await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Unit not found' });
          return res.status(400).json({ error: `واحد با شناسه ${a.unitId} یافت نشد` });
        }
      }
    }

    // Duplicate guard: same role+unit pair twice
    const seen = new Set();
    for (const a of normalized) {
      const key = `${a.roleId}|${a.unitId == null || a.unitId === '' ? 'G' : a.unitId}`;
      if (seen.has(key)) {
        await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Duplicate assignment' });
        return res.status(400).json({ error: 'یک نقش نمی‌تواند دو بار برای یک واحد اختصاص یابد' });
      }
      seen.add(key);
    }

    await execute('DELETE FROM attendance.UserRoles WHERE UserId = @userId', { userId: req.params.userId });

    // If none flagged primary, flag the first one
    const hasPrimary = normalized.some(a => !!a.isPrimary);
    let index = 0;
    for (const a of normalized) {
      const unitId = a.unitId == null || a.unitId === '' ? null : Number(a.unitId);
      const isPrimary = hasPrimary ? !!a.isPrimary : index === 0;
      await executeInsert(
        `INSERT INTO attendance.UserRoles (UserId, RoleId, UnitId, IsPrimary, CreatedAt)
         VALUES (@userId, @roleId, @unitId, @isPrimary, GETDATE())`,
        { userId: req.params.userId, roleId: a.roleId, unitId, isPrimary: isPrimary ? 1 : 0 }
      );
      index++;
    }

    await Logger.log('success', 'USER_ROLES_UPDATED', 'user_roles', req.params.userId, `User roles updated for ${user.Username}`, { count: normalized.length }, req.user.id);
    await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 200, Date.now() - startTime, req.user.id);

    await writeAudit({ actorUserId: req.user?.id ?? null, action: 'USER_ROLES_REPLACED', entity: 'role', entityId: req.params?.id ?? null, req });

    res.json({ message: 'نقش‌های کاربر با موفقیت به‌روزرسانی شد', assignments: await getUserRoleAssignments(req.params.userId) });
  } catch (error) {
    await Logger.logError('USER_ROLES', 'update', req.params.userId, 'Update user roles error', error, { body: req.body, userId: req.user.id });
    await Logger.logRequest('PUT', `/api/user-roles/${req.params.userId}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در به‌روزرسانی نقش‌ها' });
  }
});

// POST /api/user-roles/:userId/assign - Assign one role (optionally in a unit)
router.post('/:userId/assign', async (req, res) => {
  const startTime = Date.now();

  try {
    const { roleId, unitId } = req.body;

    if (!roleId) {
      await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 400, Date.now() - startTime, req.user.id, { reason: 'Missing roleId' });
      return res.status(400).json({ error: 'شناسه نقش الزامی است' });
    }

    const user = await assertUserExists(req.params.userId);
    if (!user) {
      await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const roles = await execute('SELECT Id, Name FROM attendance.Roles WHERE Id = @id', { id: roleId });
    if (roles.length === 0) {
      await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 404, Date.now() - startTime, req.user.id, { reason: 'Role not found' });
      return res.status(404).json({ error: 'نقش یافت نشد' });
    }

    const scopedUnitId = unitId == null || unitId === '' ? null : Number(unitId);
    if (scopedUnitId != null) {
      const unit = await assertUnitExists(scopedUnitId);
      if (!unit) {
        await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 400, Date.now() - startTime, req.user.id, { reason: 'Unit not found' });
        return res.status(400).json({ error: 'واحد یافت نشد' });
      }
    }

    // Same role+unit pair already assigned?
    const existing = scopedUnitId == null
      ? await execute(
          'SELECT Id FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId AND UnitId IS NULL',
          { userId: req.params.userId, roleId }
        )
      : await execute(
          'SELECT Id FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId AND UnitId = @unitId',
          { userId: req.params.userId, roleId, unitId: scopedUnitId }
        );

    if (existing.length > 0) {
      await Logger.log('warning', 'USER_ROLE_ASSIGN_FAILED', 'user_roles', req.params.userId, 'Role already assigned', { roleId, unitId: scopedUnitId });
      await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 400, Date.now() - startTime, req.user.id, { reason: 'Already assigned' });
      return res.status(400).json({ error: 'این نقش قبلاً برای این واحد اختصاص داده شده است' });
    }

    // First assignment for this user becomes the primary one
    const anyExisting = await execute('SELECT Id FROM attendance.UserRoles WHERE UserId = @userId', { userId: req.params.userId });
    const isPrimary = anyExisting.length === 0 ? 1 : 0;

    await executeInsert(
      `INSERT INTO attendance.UserRoles (UserId, RoleId, UnitId, IsPrimary, CreatedAt)
       VALUES (@userId, @roleId, @unitId, @isPrimary, GETDATE())`,
      { userId: req.params.userId, roleId, unitId: scopedUnitId, isPrimary }
    );

    await Logger.log('success', 'USER_ROLE_ASSIGNED', 'user_roles', req.params.userId, `Role ${roles[0].Name} assigned to user ${user.Username}`, { roleId, unitId: scopedUnitId }, req.user.id);
    await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 201, Date.now() - startTime, req.user.id);

    await writeAudit({ actorUserId: req.user?.id ?? null, action: 'USER_ROLE_ASSIGNED', entity: 'role', entityId: req.params?.id ?? null, req });

    res.status(201).json({ message: 'نقش با موفقیت به کاربر اختصاص داده شد' });
  } catch (error) {
    await Logger.logError('USER_ROLES', 'assign', req.params.userId, 'Assign role error', error, { body: req.body, userId: req.user.id });
    await Logger.logRequest('POST', `/api/user-roles/${req.params.userId}/assign`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در اختصاص نقش' });
  }
});

// DELETE /api/user-roles/:userId/revoke/:roleId - Revoke a role (all units unless ?unitId given)
router.delete('/:userId/revoke/:roleId', async (req, res) => {
  const startTime = Date.now();

  try {
    const user = await assertUserExists(req.params.userId);
    if (!user) {
      await Logger.logRequest('DELETE', `/api/user-roles/${req.params.userId}/revoke/${req.params.roleId}`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const unitId = req.query.unitId == null || req.query.unitId === '' ? null : Number(req.query.unitId);

    const userRoles = unitId == null
      ? await execute('SELECT Id FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId', { userId: req.params.userId, roleId: req.params.roleId })
      : await execute('SELECT Id FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId AND UnitId = @unitId', { userId: req.params.userId, roleId: req.params.roleId, unitId });

    if (userRoles.length === 0) {
      await Logger.logRequest('DELETE', `/api/user-roles/${req.params.userId}/revoke/${req.params.roleId}`, 404, Date.now() - startTime, req.user.id, { reason: 'Role not assigned' });
      return res.status(404).json({ error: 'این نقش به کاربر اختصاص داده نشده است' });
    }

    if (unitId == null) {
      await execute('DELETE FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId', { userId: req.params.userId, roleId: req.params.roleId });
    } else {
      await execute('DELETE FROM attendance.UserRoles WHERE UserId = @userId AND RoleId = @roleId AND UnitId = @unitId', { userId: req.params.userId, roleId: req.params.roleId, unitId });
    }

    await Logger.log('success', 'USER_ROLE_REVOKED', 'user_roles', req.params.userId, `Role revoked from user ${user.Username}`, { roleId: req.params.roleId, unitId }, req.user.id);
    await Logger.logRequest('DELETE', `/api/user-roles/${req.params.userId}/revoke/${req.params.roleId}`, 200, Date.now() - startTime, req.user.id);

    await writeAudit({ actorUserId: req.user?.id ?? null, action: 'USER_ROLE_REVOKED', entity: 'role', entityId: req.params?.id ?? null, req });

    res.json({ message: 'نقش با موفقیت از کاربر لغو شد' });
  } catch (error) {
    await Logger.logError('USER_ROLES', 'revoke', req.params.userId, 'Revoke role error', error, { roleId: req.params.roleId, userId: req.user.id });
    await Logger.logRequest('DELETE', `/api/user-roles/${req.params.userId}/revoke/${req.params.roleId}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در لغو نقش' });
  }
});

export default router;
