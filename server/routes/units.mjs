import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { authenticateToken, requireRole } from '../services/auth.mjs';
import { rowsToTree } from '../services/permissionTree.mjs';

const router = express.Router();

// All routes require authentication; management endpoints are admin-only.
router.use(authenticateToken);

/**
 * Units are a hierarchical tree (ParentId). A user may hold roles in several
 * units at once (attendance.UserRoles with UnitId); see user-roles.mjs.
 */

// GET /api/units - List units as a flat list + nested tree
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const units = await execute(
      `SELECT u.*, p.Name AS ParentName,
              (SELECT COUNT(*) FROM attendance.UserRoles ur WHERE ur.UnitId = u.Id) AS AssignmentCount
       FROM attendance.Units u
       LEFT JOIN attendance.Units p ON u.ParentId = p.Id
       ORDER BY ISNULL(u.SortOrder, 0), u.Name`
    );

    res.json({ units, tree: rowsToTree(units) });
    await Logger.logRequest('GET', '/api/units', 200, Date.now() - startTime, req.user.id);
  } catch (error) {
    await Logger.logError('UNITS', 'get_all', null, 'Get units error', error, { userId: req.user.id });
    await Logger.logRequest('GET', '/api/units', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت واحدها' });
  }
});

// POST /api/units - Create unit (admin)
router.post('/', requireRole('admin'), async (req, res) => {
  const startTime = Date.now();

  try {
    const { name, description, parentId, sortOrder } = req.body;

    if (!name || !String(name).trim()) {
      await Logger.logRequest('POST', '/api/units', 400, Date.now() - startTime, req.user.id, { reason: 'Missing name' });
      return res.status(400).json({ error: 'نام واحد الزامی است' });
    }

    const existing = await execute('SELECT Id FROM attendance.Units WHERE Name = @name', { name });
    if (existing.length > 0) {
      await Logger.logRequest('POST', '/api/units', 400, Date.now() - startTime, req.user.id, { reason: 'Name exists' });
      return res.status(400).json({ error: 'این نام واحد قبلاً ثبت شده است' });
    }

    if (parentId) {
      const parent = await execute('SELECT Id FROM attendance.Units WHERE Id = @id', { id: parentId });
      if (parent.length === 0) {
        await Logger.logRequest('POST', '/api/units', 400, Date.now() - startTime, req.user.id, { reason: 'Parent not found' });
        return res.status(400).json({ error: 'واحد والد یافت نشد' });
      }
    }

    const unitId = await executeInsert(
      `INSERT INTO attendance.Units (Name, Description, ParentId, SortOrder, CreatedAt)
       VALUES (@name, @description, @parentId, @sortOrder, GETDATE())`,
      { name, description: description || null, parentId: parentId || null, sortOrder: sortOrder ?? 0 }
    );

    await Logger.log('success', 'UNIT_CREATED', 'units', unitId, `Unit created: ${name}`, { name }, req.user.id);
    await Logger.logRequest('POST', '/api/units', 201, Date.now() - startTime, req.user.id);
    res.status(201).json({ message: 'واحد با موفقیت ایجاد شد', unit: { id: unitId, name, description } });
  } catch (error) {
    await Logger.logError('UNITS', 'create', null, 'Create unit error', error, { body: req.body, userId: req.user.id });
    await Logger.logRequest('POST', '/api/units', 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در ایجاد واحد' });
  }
});

// PUT /api/units/:id - Update unit (admin)
router.put('/:id', requireRole('admin'), async (req, res) => {
  const startTime = Date.now();

  try {
    const { name, description, parentId, sortOrder } = req.body;

    const units = await execute('SELECT Id, Name FROM attendance.Units WHERE Id = @id', { id: req.params.id });
    if (units.length === 0) {
      await Logger.logRequest('PUT', `/api/units/${req.params.id}`, 404, Date.now() - startTime, req.user.id, { reason: 'Unit not found' });
      return res.status(404).json({ error: 'واحد یافت نشد' });
    }

    // Cannot become its own parent (cycle guard for the tree)
    if (parentId && Number(parentId) === Number(req.params.id)) {
      await Logger.logRequest('PUT', `/api/units/${req.params.id}`, 400, Date.now() - startTime, req.user.id, { reason: 'Self parent' });
      return res.status(400).json({ error: 'یک واحد نمی‌تواند والد خودش باشد' });
    }

    if (parentId) {
      const parent = await execute('SELECT Id FROM attendance.Units WHERE Id = @id', { id: parentId });
      if (parent.length === 0) {
        await Logger.logRequest('PUT', `/api/units/${req.params.id}`, 400, Date.now() - startTime, req.user.id, { reason: 'Parent not found' });
        return res.status(400).json({ error: 'واحد والد یافت نشد' });
      }
    }

    await execute(
      `UPDATE attendance.Units
       SET Name = @name, Description = @description, ParentId = @parentId, SortOrder = @sortOrder
       WHERE Id = @id`,
      {
        name: name || units[0].Name,
        description: description ?? null,
        parentId: parentId || null,
        sortOrder: sortOrder ?? 0,
        id: req.params.id,
      }
    );

    await Logger.log('success', 'UNIT_UPDATED', 'units', req.params.id, 'Unit updated', { body: req.body }, req.user.id);
    await Logger.logRequest('PUT', `/api/units/${req.params.id}`, 200, Date.now() - startTime, req.user.id);
    res.json({ message: 'واحد با موفقیت به‌روزرسانی شد' });
  } catch (error) {
    await Logger.logError('UNITS', 'update', req.params.id, 'Update unit error', error, { body: req.body, userId: req.user.id });
    await Logger.logRequest('PUT', `/api/units/${req.params.id}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در به‌روزرسانی واحد' });
  }
});

// DELETE /api/units/:id - Delete unit (admin). Blocked when it has children or role assignments.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const startTime = Date.now();

  try {
    const units = await execute('SELECT Id, Name FROM attendance.Units WHERE Id = @id', { id: req.params.id });
    if (units.length === 0) {
      await Logger.logRequest('DELETE', `/api/units/${req.params.id}`, 404, Date.now() - startTime, req.user.id, { reason: 'Unit not found' });
      return res.status(404).json({ error: 'واحد یافت نشد' });
    }

    const children = await execute('SELECT Id FROM attendance.Units WHERE ParentId = @id', { id: req.params.id });
    if (children.length > 0) {
      await Logger.logRequest('DELETE', `/api/units/${req.params.id}`, 400, Date.now() - startTime, req.user.id, { reason: 'Has children' });
      return res.status(400).json({ error: 'ابتدا واحدهای فرزند را حذف کنید' });
    }

    const assignments = await execute('SELECT Id FROM attendance.UserRoles WHERE UnitId = @id', { id: req.params.id });
    if (assignments.length > 0) {
      await Logger.logRequest('DELETE', `/api/units/${req.params.id}`, 400, Date.now() - startTime, req.user.id, { reason: 'Has assignments' });
      return res.status(400).json({ error: 'این واحد دارای نقش‌های اختصاص‌یافته است؛ ابتدا آن‌ها را لغو کنید' });
    }

    await execute('DELETE FROM attendance.Units WHERE Id = @id', { id: req.params.id });

    await Logger.log('success', 'UNIT_DELETED', 'units', req.params.id, `Unit deleted: ${units[0].Name}`, {}, req.user.id);
    await Logger.logRequest('DELETE', `/api/units/${req.params.id}`, 200, Date.now() - startTime, req.user.id);
    res.json({ message: 'واحد با موفقیت حذف شد' });
  } catch (error) {
    await Logger.logError('UNITS', 'delete', req.params.id, 'Delete unit error', error, { userId: req.user.id });
    await Logger.logRequest('DELETE', `/api/units/${req.params.id}`, 500, Date.now() - startTime, req.user.id, { error: error.message });
    res.status(500).json({ error: 'خطا در حذف واحد' });
  }
});

export default router;
