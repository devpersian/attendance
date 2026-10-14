import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/employee-shifts - Get all employee shift assignments
router.get('/', async (req, res) => {
  try {
    const assignments = await execute(`
      SELECT es.*, e.Name as EmployeeName, s.Name as ShiftName, s.StartTime, s.EndTime,
             sp.Name as PatternName, sp.TotalCycleHours
      FROM attendance.EmployeeShifts es
      INNER JOIN attendance.Employees e ON es.EmployeeId = e.Id
      LEFT JOIN attendance.Shifts s ON es.ShiftId = s.Id
      LEFT JOIN attendance.ShiftPatterns sp ON es.PatternId = sp.Id
      WHERE es.IsActive = 1
      ORDER BY e.Name, es.StartDate
    `);
    await Logger.info('READ', 'employee_shifts', null, `Fetched ${assignments.length} assignments`);
    res.json(assignments);
  } catch (error) {
    await Logger.error('READ', 'employee_shifts', null, 'Failed to fetch assignments', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// GET /api/employee-shifts/:employeeId - Get shifts for a specific employee
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const assignments = await execute(`
      SELECT es.*, s.Name as ShiftName, s.StartTime, s.EndTime, s.LateThresholdMinutes
      FROM attendance.EmployeeShifts es
      INNER JOIN attendance.Shifts s ON es.ShiftId = s.Id
      WHERE es.EmployeeId = @employeeId AND es.IsActive = 1
      ORDER BY es.StartDate DESC
    `, { employeeId });
    
    res.json(assignments);
  } catch (error) {
    await Logger.error('READ', 'employee_shifts', req.params.employeeId, 'Failed to fetch employee shifts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch employee shifts' });
  }
});

// POST /api/employee-shifts - Assign shift or pattern to employee
router.post('/', async (req, res) => {
  try {
    const { id, employeeId, shiftId, patternId, startDate, endDate, daysOfWeek } = req.body;
    
    // Validate: must have either shiftId or patternId
    if (!shiftId && !patternId) {
      return res.status(400).json({ error: 'Either shiftId or patternId is required' });
    }
    
    // Validate: cannot have both shiftId and patternId
    if (shiftId && patternId) {
      return res.status(400).json({ error: 'Cannot assign both shift and pattern' });
    }
    
    await executeInsert(`INSERT INTO attendance.EmployeeShifts (EmployeeId, ShiftId, PatternId, StartDate, EndDate, DaysOfWeek)
       VALUES (@employeeId, @shiftId, @patternId, @startDate, @endDate, @daysOfWeek)`, { id, employeeId, shiftId: shiftId || null, patternId: patternId || null, startDate, endDate: endDate || null, daysOfWeek: daysOfWeek || null });
    
    const assignmentType = patternId ? 'pattern' : 'shift';
    const assignmentId = patternId || shiftId;
    
    await Logger.success('CREATE', 'employee_shift', id, `${assignmentType} assigned to employee ${employeeId}`, { 
      employeeId, 
      shiftId, 
      patternId,
      startDate 
    });
    res.status(201).json({ message: 'Shift assigned successfully' });
  } catch (error) {
    await Logger.error('CREATE', 'employee_shift', null, 'Failed to assign shift', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to assign shift' });
  }
});

// PUT /api/employee-shifts/:id - Update shift assignment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const setClauses = [];
    const params = { id };
    
    if (updates.shiftId !== undefined) {
      setClauses.push('ShiftId = @shiftId');
      params.shiftId = updates.shiftId;
    }
    
    if (updates.startDate !== undefined) {
      setClauses.push('StartDate = @startDate');
      params.startDate = updates.startDate;
    }
    
    if (updates.endDate !== undefined) {
      setClauses.push('EndDate = @endDate');
      params.endDate = updates.endDate || null;
    }
    
    if (updates.daysOfWeek !== undefined) {
      setClauses.push('DaysOfWeek = @daysOfWeek');
      params.daysOfWeek = updates.daysOfWeek || null;
    }
    
    if (updates.isActive !== undefined) {
      setClauses.push('IsActive = @isActive');
      params.isActive = updates.isActive;
    }
    
    setClauses.push('UpdatedAt = GETDATE()');
    
    if (setClauses.length === 1) {
      return res.json({ message: 'No changes to update' });
    }
    
    const query = `UPDATE attendance.EmployeeShifts SET ${setClauses.join(', ')} WHERE Id = @id`;
    
    await execute(query, params);
    
    await Logger.success('UPDATE', 'employee_shift', id, `Shift assignment updated`, updates);
    res.json({ message: 'Shift assignment updated successfully' });
  } catch (error) {
    await Logger.error('UPDATE', 'employee_shift', req.params.id, 'Failed to update shift assignment', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to update shift assignment' });
  }
});

// DELETE /api/employee-shifts/:id - Remove shift assignment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM attendance.EmployeeShifts WHERE Id = @id', { id });
    await Logger.success('DELETE', 'employee_shift', id, 'Shift assignment deleted');
    res.json({ message: 'Shift assignment deleted successfully' });
  } catch (error) {
    await Logger.error('DELETE', 'employee_shift', req.params.id, 'Failed to delete shift assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to delete shift assignment' });
  }
});

// GET /api/employee-shifts/today/:employeeId - Get today's shift for an employee
router.get('/today/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Convert to Iranian week (0 = Saturday, 6 = Friday)
    const iranianDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const assignments = await execute(`
      SELECT es.*, s.Name as ShiftName, s.StartTime, s.EndTime, s.LateThresholdMinutes, s.EarlyLeaveThresholdMinutes
      FROM attendance.EmployeeShifts es
      INNER JOIN attendance.Shifts s ON es.ShiftId = s.Id
      WHERE es.EmployeeId = @employeeId 
        AND es.IsActive = 1
        AND (es.DaysOfWeek IS NULL OR es.DaysOfWeek LIKE @dayPattern)
      ORDER BY es.StartDate DESC
    `, { 
      employeeId,
      dayPattern: `%${iranianDayOfWeek}%`
    });
    
    if (assignments.length === 0) {
      return res.json(null);
    }
    
    res.json(assignments[0]);
  } catch (error) {
    await Logger.error('READ', 'employee_shift_today', req.params.employeeId, 'Failed to fetch today shift', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch today shift' });
  }
});

export default router;
