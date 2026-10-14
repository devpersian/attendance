import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { authenticateToken, requireRole } from '../services/auth.mjs';
import {
  getAllPermissions,
  getEffectivePermissionIds,
  rowsToTree,
  minimizeSelection,
} from '../services/permissionTree.mjs';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/permissions - Get all permissions as a tree (roots with children)
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const permissions = await getAllPermissions();
    const tree = rowsToTree(permissions);

    await Logger.logRequest('GET', '/api/permissions', 200, Date.now() - startTime, req.user.id);
    res.json(tree);
  } catch (error) {
    await Logger.logError('PERMISSIONS', 'get_all', null, 'Get permissions error', error, { userId: req.user.id });
    await Logger.logRequest('GET', '/api/permissions', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت دسترسی‌ها' });
  }
});

// GET /api/permissions/user/:userId - Get effective user permissions (role tree + permission tree inheritance)
router.get('/user/:userId', async (req, res) => {
  const startTime = Date.now();

  try {
    // Users can only view their own permissions unless they are admin
    if (String(req.user.id) !== String(req.params.userId) && req.user.role !== 'admin') {
      await Logger.log('warning', 'PERMISSION_VIEW_DENIED', 'permissions', req.params.userId, 'User attempted to view other user permissions', { viewerId: req.user.id });
      await Logger.logRequest('GET', `/api/permissions/user/${req.params.userId}`, 403, Date.now() - startTime, req.user.id, { reason: 'Not authorized' });
      return res.status(403).json({ error: 'شما دسترسی به مشاهده دسترسی‌های این کاربر را ندارید' });
    }

    const users = await execute(
      'SELECT Id, Role FROM attendance.Users WHERE Id = @id',
      { id: req.params.userId }
    );

    if (users.length === 0) {
      await Logger.logRequest('GET', `/api/permissions/user/${req.params.userId}`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    const allPermissions = await getAllPermissions();

    // If super admin, return all permissions
    if (users[0].Role === 'admin') {
      await Logger.logRequest('GET', `/api/permissions/user/${req.params.userId}`, 200, Date.now() - startTime, req.user.id);
      return res.json({ permissions: allPermissions, isSuperAdmin: true });
    }

    // Assigned roles of the user
    const roleRows = await execute(
      `SELECT ur.RoleId
       FROM attendance.UserRoles ur
       WHERE ur.UserId = @userId`,
      { userId: req.params.userId }
    );
    const roleIds = roleRows.map(r => r.RoleId);

    // Effective set = ancestors' grants expanded down the permission tree
    const effective = await getEffectivePermissionIds(roleIds);
    const permissions = allPermissions.filter(p => effective.has(Number(p.Id)));

    await Logger.logRequest('GET', `/api/permissions/user/${req.params.userId}`, 200, Date.now() - startTime, req.user.id);
    res.json({ permissions, isSuperAdmin: false });
  } catch (error) {
    await Logger.logError('PERMISSIONS', 'get_user', req.params.userId, 'Get user permissions error', error, { userId: req.user.id });
    await Logger.logRequest('GET', `/api/permissions/user/${req.params.userId}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت دسترسی‌های کاربر' });
  }
});

// PUT /api/permissions/user/:userId - Update user permissions (admin only)
// Stored as direct grants on the user's personal "user" role node in the role tree.
router.put('/user/:userId', requireRole('admin'), async (req, res) => {
  const startTime = Date.now();

  try {
    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      await Logger.logRequest('PUT', `/api/permissions/user/${req.params.userId}`, 400, Date.now() - startTime, req.user.id, { reason: 'Invalid permissionIds' });
      return res.status(400).json({ error: 'لیست دسترسی‌ها نامعتبر است' });
    }

    // Check if user exists
    const users = await execute(
      'SELECT Id, Role FROM attendance.Users WHERE Id = @id',
      { id: req.params.userId }
    );

    if (users.length === 0) {
      await Logger.logRequest('PUT', `/api/permissions/user/${req.params.userId}`, 404, Date.now() - startTime, req.user.id, { reason: 'User not found' });
      return res.status(404).json({ error: 'کاربر یافت نشد' });
    }

    // Cannot modify admin permissions
    if (users[0].Role === 'admin') {
      await Logger.log('warning', 'PERMISSION_UPDATE_DENIED', 'permissions', req.params.userId, 'Attempted to modify admin permissions', { adminId: req.user.id });
      await Logger.logRequest('PUT', `/api/permissions/user/${req.params.userId}`, 403, Date.now() - startTime, req.user.id, { reason: 'Cannot modify admin' });
      return res.status(403).json({ error: 'دسترسی‌های مدیر سیستم قابل تغییر نیستند' });
    }

    // Get or create the user's personal role node (child of their base role in the role tree)
    let personalRole = await execute(
      `SELECT r.Id FROM attendance.Roles r
       WHERE r.Name = @name`,
      { name: `user:${req.params.userId}` }
    );

    let roleId;
    if (personalRole.length === 0) {
      // Parent = the user's base role node ('employee' by default) so it inherits its grants
      const parents = await execute(
        `SELECT r.Id FROM attendance.Roles r WHERE r.Name = @role`,
        { role: users[0].Role || 'employee' }
      );
      roleId = await executeInsert(
        `INSERT INTO attendance.Roles (Name, Description, ParentId, IsSystem, CreatedAt, UpdatedAt)
         VALUES (@name, @description, @parentId, 0, GETDATE(), GETDATE())`,
        {
          name: `user:${req.params.userId}`,
          description: `نقش اختصاصی کاربر با شناسه ${req.params.userId}`,
          parentId: parents.length > 0 ? parents[0].Id : null,
        }
      );
      await executeInsert(
        `INSERT INTO attendance.UserRoles (UserId, RoleId, CreatedAt)
         VALUES (@userId, @roleId, GETDATE())`,
        { userId: req.params.userId, roleId }
      );
    } else {
      roleId = personalRole[0].Id;
    }

    // Minimize selection (drop nodes implied by a selected ancestor), then store as direct grants
    const allPerms = await getAllPermissions();
    const minimal = minimizeSelection(permissionIds, allPerms);

    await execute('DELETE FROM attendance.RolePermissions WHERE RoleId = @roleId', { roleId });

    for (const permissionId of minimal) {
      await executeInsert(`INSERT INTO attendance.RolePermissions (RoleId, PermissionId, CreatedAt)
         VALUES (@roleId, @permissionId, GETDATE())`, { roleId, permissionId });
    }

    await Logger.log('success', 'USER_PERMISSIONS_UPDATED', 'permissions', req.params.userId, `User permissions updated`, { permissionCount: minimal.length }, req.user.id);
    await Logger.logRequest('PUT', `/api/permissions/user/${req.params.userId}`, 200, Date.now() - startTime, req.user.id);

    res.json({ message: 'دسترسی‌های کاربر با موفقیت به‌روزرسانی شد' });
  } catch (error) {
    await Logger.logError('PERMISSIONS', 'update_user', req.params.userId, 'Update user permissions error', error, { body: req.body, userId: req.user.id });
    await Logger.logRequest('PUT', `/api/permissions/user/${req.params.userId}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در به‌روزرسانی دسترسی‌ها' });
  }
});

export default router;
