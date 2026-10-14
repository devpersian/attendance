import express from 'express';
import { execute } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken, requirePermission } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/admin/audit-log — security audit trail (Phase 1 / P1.6)
// Read-only, requires the users module permission (admins by default).
// Query: limit (default 100, max 500), action, entity, userId, from/to (ISO dates).
router.get('/audit-log', requirePermission('users'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const where = [];
    const params = { limit };
    if (req.query.action) { where.push('a.Action = @action'); params.action = req.query.action; }
    if (req.query.entity) { where.push('a.Entity = @entity'); params.entity = req.query.entity; }
    if (req.query.userId) { where.push('a.ActorUserId = @userId'); params.userId = Number(req.query.userId); }
    if (req.query.from)   { where.push('a.CreatedAt >= @from'); params.from = new Date(req.query.from); }
    if (req.query.to)     { where.push('a.CreatedAt <= @to'); params.to = new Date(req.query.to); }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rows = await execute(
      `SELECT TOP (@limit) a.Id, a.ActorUserId, u.Username AS ActorName, a.Action, a.Entity, a.EntityId,
              a.Detail, a.IpAddress, a.CreatedAt
       FROM attendance.AuditLog a
       LEFT JOIN attendance.Users u ON u.Id = a.ActorUserId
       ${clause}
       ORDER BY a.CreatedAt DESC`,
      params,
    );
    res.json(rows);
  } catch (error) {
    await Logger.error('READ', 'audit_log', null, 'خطا در دریافت گزارش ممیزی', { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت گزارش ممیزی' });
  }
});

// GET /api/admin/dashboard - Get admin dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await execute(`
      SELECT 
        (SELECT COUNT(*) FROM attendance.Employees) as TotalEmployees,
        (SELECT COUNT(*) FROM attendance.AttendanceRecords WHERE Date = CONVERT(NVARCHAR(10), GETDATE(), 120)) as TodayAttendance,
        (SELECT COUNT(*) FROM attendance.LeaveRequests WHERE Status = 'pending') as PendingLeaves,
        (SELECT COUNT(*) FROM attendance.Devices WHERE Status = 'active' AND isDeleted = 0) as ActiveDevices,
        (SELECT COUNT(*) FROM attendance.SystemLogs WHERE Level = 'error' AND CreatedAt >= DATEADD(hour, -24, GETDATE())) as Errors24h
    `);

    const recentLogs = await Logger.getLogs({}, 10);

    await Logger.info('VIEW', 'admin_dashboard', null, 'Admin dashboard accessed');

    res.json({
      stats: stats[0],
      recentLogs
    });
  } catch (error) {
    await Logger.error('VIEW', 'admin_dashboard', null, 'Failed to load admin dashboard', { error: error.message });
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/admin/logs - Get system logs
router.get('/logs', async (req, res) => {
  try {
    const { level, action, entity, dateFrom, dateTo, limit = 100 } = req.query;

    const filters = {};
    if (level) filters.level = level;
    if (action) filters.action = action;
    if (entity) filters.entity = entity;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const logs = await Logger.getLogs(filters, parseInt(limit));

    await Logger.info('VIEW', 'system_logs', null, `Viewed system logs with filters`, { filters });

    res.json(logs);
  } catch (error) {
    await Logger.error('VIEW', 'system_logs', null, 'Failed to load logs', { error: error.message });
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// GET /api/admin/logs/stats - Get log statistics
router.get('/logs/stats', async (req, res) => {
  try {
    const stats = await Logger.getStats();
    res.json(stats);
  } catch (error) {
    await Logger.error('VIEW', 'log_stats', null, 'Failed to load log stats', { error: error.message });
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/employees - Get all employees with details
router.get('/employees', async (req, res) => {
  try {
    const employees = await execute(`
      SELECT 
        e.*,
        COUNT(ar.Id) as TotalRecords,
        COUNT(CASE WHEN ar.Status = 'present' THEN 1 END) as PresentCount,
        COUNT(CASE WHEN ar.Status = 'late' THEN 1 END) as LateCount,
        COUNT(CASE WHEN ar.Status = 'absent' THEN 1 END) as AbsentCount
      FROM attendance.Employees e
      LEFT JOIN attendance.AttendanceRecords ar ON e.Id = ar.EmployeeId
      GROUP BY e.Id, e.Name, e.PersonnelCode, e.Department, e.Position, e.CreatedAt, e.UpdatedAt
      ORDER BY e.Name
    `);

    await Logger.info('VIEW', 'employees_admin', null, 'Viewed all employees');

    res.json(employees);
  } catch (error) {
    await Logger.error('VIEW', 'employees_admin', null, 'Failed to load employees', { error: error.message });
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

// GET /api/admin/devices - Get all devices with status
router.get('/devices', async (req, res) => {
  try {
    const devices = await execute(`
      SELECT 
        d.*,
        COUNT(dal.Id) as TotalLogs,
        MAX(dal.Timestamp) as LastActivity
      FROM attendance.Devices d
      LEFT JOIN attendance.DeviceAttendanceLogs dal ON d.Id = dal.DeviceId
      WHERE d.isDeleted = 0
      GROUP BY d.Id, d.Name, d.Type, d.Model, d.IPAddress, d.Port, d.Protocol, 
               d.Status, d.Location, d.LastSync, d.PollingInterval, d.CreatedAt, d.UpdatedAt
      ORDER BY d.Name
    `);

    await Logger.info('VIEW', 'devices_admin', null, 'Viewed all devices');

    res.json(devices);
  } catch (error) {
    await Logger.error('VIEW', 'devices_admin', null, 'Failed to load devices', { error: error.message });
    res.status(500).json({ error: 'Failed to load devices' });
  }
});

// POST /api/admin/devices/:id/sync - Force sync a device
router.post('/devices/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    
    await execute('UPDATE attendance.Devices SET LastSync = GETDATE() WHERE Id = @id', { id });
    
    await Logger.success('SYNC', 'device', id, 'Device sync forced by admin');

    res.json({ message: 'Device sync initiated' });
  } catch (error) {
    await Logger.error('SYNC', 'device', req.params.id, 'Failed to sync device', { error: error.message });
    res.status(500).json({ error: 'Failed to sync device' });
  }
});

// PUT /api/admin/devices/:id/status - Update device status
router.put('/devices/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await execute('UPDATE attendance.Devices SET Status = @status, UpdatedAt = GETDATE() WHERE Id = @id', { id, status });

    await Logger.success('UPDATE', 'device_status', id, `Device status changed to ${status}`, { status });

    res.json({ message: 'Device status updated' });
  } catch (error) {
    await Logger.error('UPDATE', 'device_status', req.params.id, 'Failed to update device status', { error: error.message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// GET /api/admin/system - Get system information
router.get('/system', async (req, res) => {
  try {
    const systemInfo = await execute(`
      SELECT 
        DB_NAME() as DatabaseName,
        SERVERPROPERTY('ProductVersion') as SQLVersion,
        (SELECT COUNT(*) FROM attendance.Employees) as TotalEmployees,
        (SELECT COUNT(*) FROM attendance.AttendanceRecords) as TotalRecords,
        (SELECT COUNT(*) FROM attendance.Devices WHERE isDeleted = 0) as TotalDevices,
        (SELECT COUNT(*) FROM attendance.SystemLogs) as TotalLogs,
        (SELECT MAX(CreatedAt) FROM attendance.SystemLogs) as LastLogTime
    `);

    await Logger.info('VIEW', 'system_info', null, 'Viewed system information');

    res.json(systemInfo[0]);
  } catch (error) {
    await Logger.error('VIEW', 'system_info', null, 'Failed to load system info', { error: error.message });
    res.status(500).json({ error: 'Failed to load system info' });
  }
});

// DELETE /api/admin/logs/clear - Clear old logs (keep last 30 days)
router.delete('/logs/clear', async (req, res) => {
  try {
    const result = await execute(`
      DELETE FROM attendance.SystemLogs 
      WHERE CreatedAt < DATEADD(day, -30, GETDATE())
      SELECT @@ROWCOUNT as DeletedCount
    `);

    await Logger.warning('DELETE', 'system_logs', null, `Cleared old logs`, { deletedCount: result[0].DeletedCount });

    res.json({ message: 'Old logs cleared', deletedCount: result[0].DeletedCount });
  } catch (error) {
    await Logger.error('DELETE', 'system_logs', null, 'Failed to clear logs', { error: error.message });
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

export default router;
