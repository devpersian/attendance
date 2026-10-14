import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { runPayroll, buildPayslip, computeMonthlyHours } from '../services/payrollEngine.mjs';
import { sendSms, templates } from '../services/notifications.mjs';

const router = express.Router();
router.use(authenticateToken);

// GET /api/payroll/runs — list payroll runs
router.get('/runs', async (req, res) => {
  try {
    const rows = await execute('SELECT * FROM attendance.PayrollRuns ORDER BY JalaliYear DESC, JalaliMonth DESC', {});
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payroll/runs — create/run payroll for a Jalali month { jalaliYear, jalaliMonth }
router.post('/runs', async (req, res) => {
  try {
    const { jalaliYear, jalaliMonth } = req.body;
    const jy = parseInt(jalaliYear, 10), jm = parseInt(jalaliMonth, 10);
    if (!jy || !jm || jm < 1 || jm > 12) return res.status(400).json({ error: 'jalaliYear و jalaliMonth الزامی است' });
    const result = await runPayroll(jy, jm, req.user?.id ?? null);
    res.status(201).json({ runId: result.runId, employees: result.employees, totalGross: result.totalGross, totalNet: result.totalNet });
  } catch (e) {
    console.error('payroll run error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payroll/runs/:id/payslips — payslips of a run (with employee names)
router.get('/runs/:id/payslips', async (req, res) => {
  try {
    const rows = await execute(
      `SELECT p.*, e.Name AS EmployeeName, e.PersonnelCode, e.Department, e.Position
       FROM attendance.Payslips p JOIN attendance.Employees e ON e.Id = p.EmployeeId
       WHERE p.RunId=@id`,
      { id: req.params.id }
    );
    res.json(rows.map(r => ({ ...r, Earnings: JSON.parse(r.EarningsJson || '{}'), Deductions: JSON.parse(r.DeductionsJson || '{}') })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payroll/preview/:employeeId?year=1405&month=1 — dry-run single payslip
router.get('/preview/:employeeId', async (req, res) => {
  try {
    const emp = await execute('SELECT * FROM attendance.Employees WHERE Id=@id', { id: req.params.employeeId });
    if (!emp.length) return res.status(404).json({ error: 'کارمند یافت نشد' });
    const now = new Date();
    const j = (await import('jalaali-js')).toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const jy = parseInt(req.query.year, 10) || j.jy;
    const jm = parseInt(req.query.month, 10) || j.jm;
    const slip = await buildPayslip(emp[0], jy, jm);
    res.json({ employee: emp[0].Name, year: jy, month: jm, ...slip });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/payroll/runs/:id/status — approve/pay a run { status }
router.put('/runs/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'calculated', 'approved', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'وضعیت نامعتبر' });
    }
    await execute(`UPDATE attendance.PayrollRuns SET Status=@s, UpdatedAt=GETDATE() WHERE Id=@id`, { s: status, id: req.params.id });

    // Notify employees when the run is approved (SMS best-effort).
    if (status === 'approved') {
      const slips = await execute(
        `SELECT p.EmployeeId, e.Name, e.Phone FROM attendance.Payslips p
         JOIN attendance.Employees e ON e.Id=p.EmployeeId WHERE p.RunId=@id`,
        { id: req.params.id }
      );
      for (const s of slips) {
        if (s.Phone) sendSms(s.Phone, templates.payrollReady(s.Name), { template: 'payroll_ready' }).catch(() => {});
      }
    }
    res.json({ message: 'وضعیت فیش‌ها به‌روزرسانی شد' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
