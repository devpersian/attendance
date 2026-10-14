/**
 * GET /api/reports/* — Aggregated attendance reports.
 *
 * All statistics use the official Iranian working-day count for the period
 * (Jalali month days minus Fridays and official holidays) instead of a
 * hardcoded 30-day denominator, and absence detection ignores holidays.
 */

import express from 'express';
import { execute } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { workingDaysInMonth, isHoliday, holidaysInMonth } from '../services/holidays.mjs';

const router = express.Router();
router.use(authenticateToken);

function parseMonth(month) {
  const m = /^(\d{4})\/(\d{1,2})$/.exec(String(month || '').trim());
  if (!m) return null;
  return { jy: Number(m[1]), jm: Number(m[2]) };
}

/** Distinct attended (non-holiday) dates per employee in a Jalali month. */
async function monthStats(month) {
  const records = await execute(
    `SELECT EmployeeId, Date, Status FROM attendance.AttendanceRecords WHERE Date LIKE @month`,
    { month: `${month}%` },
  );

  const byEmployee = {};
  for (const r of records) {
    const id = String(r.EmployeeId);
    byEmployee[id] ??= { dates: new Set(), lateDates: new Set() };
    if (r.Status === 'late') byEmployee[id].lateDates.add(r.Date);
    else byEmployee[id].dates.add(r.Date);
  }
  // a date counts once — prefer "present" record if both exist
  for (const id of Object.keys(byEmployee)) {
    for (const d of byEmployee[id].lateDates) byEmployee[id].dates.add(d);
  }
  return { records, byEmployee };
}

// GET /api/reports/monthly?month=1403/07 — department & employee summary
router.get('/monthly', async (req, res) => {
  try {
    const { jy, jm } = parseMonth(req.query.month) ?? {};
    if (!jy) return res.status(400).json({ error: 'پارامتر month با قالب jy/jm الزامی است' });

    const month = `${jy}/${String(jm).padStart(2, '0')}`;
    const employees = await execute('SELECT Id, Name, Department FROM attendance.Employees');
    const { byEmployee } = await monthStats(month);

    const workdays = workingDaysInMonth(jy, jm);
    const depts = {};
    const perEmployee = [];

    for (const emp of employees) {
      const s = byEmployee[String(emp.Id)];
      const presentDays = s ? [...s.dates].filter((d) => !isHoliday(d)).length : 0;
      const lateDays = s ? s.lateDates.size : 0;
      const absentDays = Math.max(0, workdays - presentDays);
      const rate = workdays > 0 ? Math.round((presentDays / workdays) * 100) : 0;

      perEmployee.push({
        employeeId: emp.Id,
        name: emp.Name,
        department: emp.Department,
        presentDays,
        lateDays,
        absentDays,
        rate,
      });

      depts[emp.Department] ??= { department: emp.Department, employees: 0, presentDays: 0, lateDays: 0, absentDays: 0 };
      depts[emp.Department].employees++;
      depts[emp.Department].presentDays += presentDays;
      depts[emp.Department].lateDays += lateDays;
      depts[emp.Department].absentDays += absentDays;
    }

    const departments = Object.values(depts).map((d) => ({
      ...d,
      capacity: d.employees * workdays,
      rate: d.employees > 0 ? Math.round((d.presentDays / (d.employees * workdays)) * 100) : 0,
    }));

    res.json({ month, workingDays: workdays, employees: perEmployee, departments });
  } catch (error) {
    await Logger.error('READ', 'reports', null, 'Monthly report failed', { error: error.message });
    res.status(500).json({ error: 'Failed to build monthly report' });
  }
});

// GET /api/reports/violations?month=1403/07 — absences & late arrivals (holiday-aware)
router.get('/violations', async (req, res) => {
  try {
    const { jy, jm } = parseMonth(req.query.month) ?? {};
    if (!jy) return res.status(400).json({ error: 'پارامتر month با قالب jy/jm الزامی است' });

    const month = `${jy}/${String(jm).padStart(2, '0')}`;
    const employees = await execute('SELECT Id, Name, Department FROM attendance.Employees');
    const { byEmployee } = await monthStats(month);
    const approvedLeaves = await execute(
      `SELECT EmployeeId, StartDate, EndDate FROM attendance.LeaveRequests WHERE Status = 'approved' AND EndDate LIKE @month`,
      { month: `${month}%` },
    );

    const violations = [];
    // one query for all dates that have any record this month (avoids N×31 queries)
    const recordedDates = new Set(
      (await execute('SELECT DISTINCT Date FROM attendance.AttendanceRecords WHERE Date LIKE @month', { month: `${month}%` }))
        .map((r) => r.Date),
    );

    for (const emp of employees) {
      const s = byEmployee[String(emp.Id)] || { dates: new Set(), lateDates: new Set() };
      const leaves = approvedLeaves.filter((l) => String(l.EmployeeId) === String(emp.Id));
      const onLeave = (dateStr) =>
        leaves.some((l) => dateStr >= l.StartDate && dateStr <= l.EndDate);

      const absences = [];
      for (let jd = 1; jd <= 31; jd++) {
        const key = `${month}/${String(jd).padStart(2, '0')}`;
        if (!recordedDates.has(key)) continue; // day not yet reached / no activity stored
        if (isHoliday(key) || s.dates.has(key) || onLeave(key)) continue;
        absences.push(key);
      }

      if (s.lateDates.size > 0 || absences.length > 0) {
        violations.push({
          employeeId: emp.Id,
          name: emp.Name,
          department: emp.Department,
          lateDays: s.lateDates.size,
          lateDates: [...s.lateDates].sort(),
          absences,
        });
      }
    }

    res.json({ month, violations });
  } catch (error) {
    await Logger.error('READ', 'reports', null, 'Violations report failed', { error: error.message });
    res.status(500).json({ error: 'Failed to build violations report' });
  }
});

// GET /api/reports/overtime?month=1403/07 — hours beyond shift end
router.get('/overtime', async (req, res) => {
  try {
    const { jy, jm } = parseMonth(req.query.month) ?? {};
    if (!jy) return res.status(400).json({ error: 'پارامتر month با قالب jy/jm الزامی است' });

    const month = `${jy}/${String(jm).padStart(2, '0')}`;
    const rows = await execute(
      `SELECT r.EmployeeId, e.Name AS EmployeeName, e.Department, r.Date, r.ClockIn, r.ClockOut,
              s.EndTime
       FROM attendance.AttendanceRecords r
       JOIN attendance.Employees e ON e.Id = r.EmployeeId
       LEFT JOIN attendance.EmployeeShifts es ON es.EmployeeId = r.EmployeeId
            AND es.IsActive = 1
            AND es.StartDate <= r.Date AND (es.EndDate IS NULL OR es.EndDate >= r.Date)
       LEFT JOIN attendance.Shifts s ON s.Id = es.ShiftId
       WHERE r.Date LIKE @month AND r.ClockIn IS NOT NULL AND r.ClockOut IS NOT NULL`,
      { month: `${month}%` },
    );

    const toMin = (t) => {
      const [h, m] = String(t).split(':').map(Number);
      return h * 60 + (m || 0);
    };

    const byEmployee = {};
    for (const row of rows) {
      const out = toMin(row.ClockOut);
      const shiftEnd = row.EndTime ? toMin(row.EndTime) : null;
      let overtimeMin = 0;
      if (shiftEnd != null) {
        overtimeMin = out > shiftEnd ? out - shiftEnd : 0;
      } else {
        // default business hours 8:00–16:00 when no shift assigned
        overtimeMin = out > 16 * 60 ? out - 16 * 60 : 0;
      }
      const id = String(row.EmployeeId);
      byEmployee[id] ??= {
        employeeId: row.EmployeeId,
        name: row.EmployeeName,
        department: row.Department,
        overtimeMinutes: 0,
        days: 0,
      };
      if (overtimeMin > 0) {
        byEmployee[id].overtimeMinutes += overtimeMin;
        byEmployee[id].days++;
      }
    }

    const list = Object.values(byEmployee)
      .map((e) => ({ ...e, overtimeHours: Math.round((e.overtimeMinutes / 60) * 10) / 10 }))
      .sort((a, b) => b.overtimeMinutes - a.overtimeMinutes);

    res.json({ month, overtime: list });
  } catch (error) {
    await Logger.error('READ', 'reports', null, 'Overtime report failed', { error: error.message });
    res.status(500).json({ error: 'Failed to build overtime report' });
  }
});

// GET /api/reports/holidays?month=1403/07 — official holidays of a month
router.get('/holidays', (req, res) => {
  const parsed = parseMonth(req.query.month);
  if (!parsed) return res.status(400).json({ error: 'پارامتر month با قالب jy/jm الزامی است' });
  const { jy, jm } = parsed;
  res.json({
    month: req.query.month,
    workingDays: workingDaysInMonth(jy, jm),
    holidays: holidaysInMonth(jy, jm),
  });
});

export default router;
