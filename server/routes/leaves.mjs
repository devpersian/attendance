import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/leaves - Get all leave requests
router.get('/', async (req, res) => {
  try {
    const { employeeId, status } = req.query;
    let query = 'SELECT * FROM attendance.LeaveRequests WHERE 1=1';
    const params = {};
    
    if (employeeId) {
      query += ' AND EmployeeId = @employeeId';
      params.employeeId = employeeId;
    }
    
    if (status) {
      query += ' AND Status = @status';
      params.status = status;
    }
    
    query += ' ORDER BY CreatedAt DESC';
    
    const leaves = await execute(query, params);
    await Logger.info('READ', 'leaves', null, `Fetched ${leaves.length} leave requests`, { filters: { employeeId, status } });
    res.json(leaves);
  } catch (error) {
    await Logger.error('READ', 'leaves', null, 'Failed to fetch leaves', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

// GET /api/leaves/:id - Get leave by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leaves = await execute('SELECT * FROM attendance.LeaveRequests WHERE Id = @id', { id });
    
    if (leaves.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    res.json(leaves[0]);
  } catch (error) {
    console.error('Error fetching leave:', error);
    res.status(500).json({ error: 'Failed to fetch leave' });
  }
});

// POST /api/leaves - Create new leave request
router.post('/', async (req, res) => {
  try {
    const {  employeeId, startDate, endDate, type, status, description } = req.body;
    
    const id = await executeInsert(`INSERT INTO attendance.LeaveRequests (EmployeeId, StartDate, EndDate, Type, Status, Description)
       VALUES (@employeeId, @startDate, @endDate, @type, @status, @description)`, { id, employeeId, startDate, endDate, type, status: status || 'pending', description: description || null });
    
    await Logger.success('CREATE', 'leave', id, `Leave request created for employee ${employeeId}`, { 
      employeeId, startDate, endDate, type, status 
    });
    res.status(201).json({ message: 'Leave request created successfully' });
  } catch (error) {
    await Logger.error('CREATE', 'leave', null, 'Failed to create leave request', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// PUT /api/leaves/:id - Update leave request
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description } = req.body;
    
    await execute(
      `UPDATE attendance.LeaveRequests 
       SET Status = @status, Description = @description, UpdatedAt = GETDATE()
       WHERE Id = @id`,
      { id, status, description: description || null }
    );
    
    await Logger.success('UPDATE', 'leave', id, `Leave request updated`, { status });
    res.json({ message: 'Leave request updated successfully' });
  } catch (error) {
    await Logger.error('UPDATE', 'leave', req.params.id, 'Failed to update leave request', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to update leave request' });
  }
});

// DELETE /api/leaves/:id - Delete leave request
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM attendance.LeaveRequests WHERE Id = @id', { id });
    await Logger.success('DELETE', 'leave', id, 'Leave request deleted');
    res.json({ message: 'Leave request deleted successfully' });
  } catch (error) {
    await Logger.error('DELETE', 'leave', req.params.id, 'Failed to delete leave request', { error: error.message });
    res.status(500).json({ error: 'Failed to delete leave request' });
  }
});

export default router;
