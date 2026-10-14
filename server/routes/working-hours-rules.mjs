import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/working-hours-rules - Get all rules
router.get('/', async (req, res) => {
  try {
    const rules = await execute(`
      SELECT r.*, s.Name as ShiftName 
      FROM attendance.WorkingHoursRules r
      LEFT JOIN attendance.Shifts s ON r.ShiftId = s.Id
      WHERE r.IsActive = 1
      ORDER BY r.RuleType, r.StartDate
    `);
    await Logger.info('READ', 'working_hours_rules', null, `Fetched ${rules.length} rules`);
    res.json(rules);
  } catch (error) {
    await Logger.error('READ', 'working_hours_rules', null, 'Failed to fetch rules', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// GET /api/working-hours-rules/:id - Get rule by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rules = await execute('SELECT * FROM attendance.WorkingHoursRules WHERE Id = @id', { id });
    
    if (rules.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    res.json(rules[0]);
  } catch (error) {
    await Logger.error('READ', 'working_hours_rule', req.params.id, 'Failed to fetch rule', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch rule' });
  }
});

// POST /api/working-hours-rules - Create new rule
router.post('/', async (req, res) => {
  try {
    const { id, name, ruleType, startDate, endDate, dayOfWeek, isWorkingDay, shiftId, overtimeMultiplier, description } = req.body;
    
    await executeInsert(`INSERT INTO attendance.WorkingHoursRules (Name, RuleType, StartDate, EndDate, DayOfWeek, IsWorkingDay, ShiftId, OvertimeMultiplier, Description)
       VALUES (@name, @ruleType, @startDate, @endDate, @dayOfWeek, @isWorkingDay, @shiftId, @overtimeMultiplier, @description)`, { id, name, ruleType, startDate: startDate || null, endDate: endDate || null, dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : null, isWorkingDay: isWorkingDay || 0, shiftId: shiftId || null, overtimeMultiplier: overtimeMultiplier || null, description: description || null });
    
    await Logger.success('CREATE', 'working_hours_rule', id, `Rule created: ${name}`, { name, ruleType });
    res.status(201).json({ message: 'Rule created successfully' });
  } catch (error) {
    await Logger.error('CREATE', 'working_hours_rule', null, 'Failed to create rule', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT /api/working-hours-rules/:id - Update rule
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
    
    if (updates.ruleType !== undefined) {
      setClauses.push('RuleType = @ruleType');
      params.ruleType = updates.ruleType;
    }
    
    if (updates.startDate !== undefined) {
      setClauses.push('StartDate = @startDate');
      params.startDate = updates.startDate || null;
    }
    
    if (updates.endDate !== undefined) {
      setClauses.push('EndDate = @endDate');
      params.endDate = updates.endDate || null;
    }
    
    if (updates.dayOfWeek !== undefined) {
      setClauses.push('DayOfWeek = @dayOfWeek');
      params.dayOfWeek = updates.dayOfWeek !== undefined ? updates.dayOfWeek : null;
    }
    
    if (updates.isWorkingDay !== undefined) {
      setClauses.push('IsWorkingDay = @isWorkingDay');
      params.isWorkingDay = updates.isWorkingDay;
    }
    
    if (updates.shiftId !== undefined) {
      setClauses.push('ShiftId = @shiftId');
      params.shiftId = updates.shiftId || null;
    }
    
    if (updates.overtimeMultiplier !== undefined) {
      setClauses.push('OvertimeMultiplier = @overtimeMultiplier');
      params.overtimeMultiplier = updates.overtimeMultiplier || null;
    }
    
    if (updates.description !== undefined) {
      setClauses.push('Description = @description');
      params.description = updates.description || null;
    }
    
    if (updates.isActive !== undefined) {
      setClauses.push('IsActive = @isActive');
      params.isActive = updates.isActive;
    }
    
    setClauses.push('UpdatedAt = GETDATE()');
    
    if (setClauses.length === 1) {
      return res.json({ message: 'No changes to update' });
    }
    
    const query = `UPDATE attendance.WorkingHoursRules SET ${setClauses.join(', ')} WHERE Id = @id`;
    
    await execute(query, params);
    
    await Logger.success('UPDATE', 'working_hours_rule', id, `Rule updated`, updates);
    res.json({ message: 'Rule updated successfully' });
  } catch (error) {
    await Logger.error('UPDATE', 'working_hours_rule', req.params.id, 'Failed to update rule', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /api/working-hours-rules/:id - Delete rule
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM attendance.WorkingHoursRules WHERE Id = @id', { id });
    await Logger.success('DELETE', 'working_hours_rule', id, 'Rule deleted');
    res.json({ message: 'Rule deleted successfully' });
  } catch (error) {
    await Logger.error('DELETE', 'working_hours_rule', req.params.id, 'Failed to delete rule', { error: error.message });
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
