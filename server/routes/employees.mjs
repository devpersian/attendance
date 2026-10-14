import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// GET /api/employees - Get all employees
router.get('/', async (req, res) => {
  try {
    const employees = await execute('SELECT * FROM attendance.Employees ORDER BY Name');
    await Logger.info('READ', 'employees', null, `Fetched ${employees.length} employees`);
    res.json(employees);
  } catch (error) {
    await Logger.error('READ', 'employees', null, 'Failed to fetch employees', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/:id - Get employee by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const employees = await execute('SELECT * FROM attendance.Employees WHERE Id = @id', { id });
    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employees[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
  try {
    const {  name, personnelCode, department, position, avatar } = req.body;
    
    const id = await executeInsert(`INSERT INTO attendance.Employees (Name, PersonnelCode, Department, Position, Avatar)
       VALUES (@name, @personnelCode, @department, @position, @avatar)`, { id, name, personnelCode, department, position, avatar: avatar || null });
    
    await Logger.success('CREATE', 'employee', id, `Employee created: ${name}`, { name, personnelCode, department });
    res.status(201).json({ message: 'Employee created successfully' });
  } catch (error) {
    await Logger.error('CREATE', 'employee', null, 'Failed to create employee', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, personnelCode, department, position, avatar } = req.body;
    
    await execute(
      `UPDATE attendance.Employees 
       SET Name = @name, PersonnelCode = @personnelCode, Department = @department, 
           Position = @position, Avatar = @avatar, UpdatedAt = GETDATE()
       WHERE Id = @id`,
      { id, name, personnelCode, department, position, avatar: avatar || null }
    );
    
    await Logger.success('UPDATE', 'employee', id, `Employee updated: ${name}`, { name, personnelCode, department });
    res.json({ message: 'Employee updated successfully' });
  } catch (error) {
    await Logger.error('UPDATE', 'employee', req.params.id, 'Failed to update employee', { error: error.message, body: req.body });
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM attendance.Employees WHERE Id = @id', { id });
    await Logger.success('DELETE', 'employee', id, 'Employee deleted');
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    await Logger.error('DELETE', 'employee', req.params.id, 'Failed to delete employee', { error: error.message });
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

export default router;
