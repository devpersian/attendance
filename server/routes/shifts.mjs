import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/shifts - Get all shifts
router.get('/', async (req, res) => {
  try {
    const shifts = await execute('SELECT * FROM attendance.Shifts WHERE IsActive = 1 ORDER BY StartTime');
    await Logger.info('READ', 'shifts', null, `Fetched ${shifts.length} shifts`);
    res.json(shifts);
  } catch (error) {
    await Logger.error('READ', 'shifts', null, 'Failed to fetch shifts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// GET /api/shifts/:id - Get shift by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shifts = await execute('SELECT * FROM attendance.Shifts WHERE Id = @id', { id });
    
    if (shifts.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    res.json(shifts[0]);
  } catch (error) {
    await Logger.error('READ', 'shift', req.params.id, 'Failed to fetch shift', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch shift' });
  }
});

// POST /api/shifts - Create new shift
router.post('/', async (req, res) => {
  try {
    const {  name, description, startTime, endTime, breakStartTime, breakEndTime, lateThresholdMinutes, earlyLeaveThresholdMinutes, color } = req.body;
    
    const id = await executeInsert(`INSERT INTO attendance.Shifts (Name, Description, StartTime, EndTime, BreakStartTime, BreakEndTime, LateThresholdMinutes, EarlyLeaveThresholdMinutes, Color)
       VALUES (@name, @description, @startTime, @endTime, @breakStartTime, @breakEndTime, @lateThresholdMinutes, @earlyLeaveThresholdMinutes, @color)`, { id, name, description: description || null, startTime, endTime, breakStartTime: breakStartTime || null, breakEndTime: breakEndTime || null, lateThresholdMinutes: lateThresholdMinutes || 15, earlyLeaveThresholdMinutes: earlyLeaveThresholdMinutes || 15, color: color || null });
    
    await Logger.success('CREATE', 'shift', id, `Shift created: ${name}`, { name, startTime, endTime });
    res.status(201).json({ message: 'Shift created successfully' });
  } catch (error) {
    await Logger.error('CREATE', 'shift', null, 'Failed to create shift', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// PUT /api/shifts/:id - Update shift
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const setClauses = [];
    const params = { id };
    
    if (updates.name !== undefined) {
      setClauses.push('Name = @name');
      params.name = updates.name;
    }
    
    if (updates.description !== undefined) {
      setClauses.push('Description = @description');
      params.description = updates.description || null;
    }
    
    if (updates.startTime !== undefined) {
      setClauses.push('StartTime = @startTime');
      params.startTime = updates.startTime;
    }
    
    if (updates.endTime !== undefined) {
      setClauses.push('EndTime = @endTime');
      params.endTime = updates.endTime;
    }
    
    if (updates.breakStartTime !== undefined) {
      setClauses.push('BreakStartTime = @breakStartTime');
      params.breakStartTime = updates.breakStartTime || null;
    }
    
    if (updates.breakEndTime !== undefined) {
      setClauses.push('BreakEndTime = @breakEndTime');
      params.breakEndTime = updates.breakEndTime || null;
    }
    
    if (updates.lateThresholdMinutes !== undefined) {
      setClauses.push('LateThresholdMinutes = @lateThresholdMinutes');
      params.lateThresholdMinutes = updates.lateThresholdMinutes;
    }
    
    if (updates.earlyLeaveThresholdMinutes !== undefined) {
      setClauses.push('EarlyLeaveThresholdMinutes = @earlyLeaveThresholdMinutes');
      params.earlyLeaveThresholdMinutes = updates.earlyLeaveThresholdMinutes;
    }
    
    if (updates.color !== undefined) {
      setClauses.push('Color = @color');
      params.color = updates.color || null;
    }
    
    if (updates.isActive !== undefined) {
      setClauses.push('IsActive = @isActive');
      params.isActive = updates.isActive;
    }
    
    setClauses.push('UpdatedAt = GETDATE()');
    
    if (setClauses.length === 1) {
      return res.json({ message: 'No changes to update' });
    }
    
    const query = `UPDATE attendance.Shifts SET ${setClauses.join(', ')} WHERE Id = @id`;
    
    await execute(query, params);
    
    await Logger.success('UPDATE', 'shift', id, `Shift updated`, updates);
    res.json({ message: 'Shift updated successfully' });
  } catch (error) {
    await Logger.error('UPDATE', 'shift', req.params.id, 'Failed to update shift', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// DELETE /api/shifts/:id - Delete shift
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM attendance.Shifts WHERE Id = @id', { id });
    await Logger.success('DELETE', 'shift', id, 'Shift deleted');
    res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    await Logger.error('DELETE', 'shift', req.params.id, 'Failed to delete shift', { error: error.message });
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

export default router;
