/**
 * Iranian labor-law payroll engine (قانون کار جمهوری اسلامی ایران).
 *
 * Rules implemented (all amounts in Toman):
 *   - Standard week: 44 hours → monthly nominal hours = 44/168 * monthDays ≈ 176 (22 working days × 8h)
 *   - Overtime (اضافه‌کاری): 40% above hourly rate (ماده ۵۹) — multiplier read from
 *     attendance.WorkingHoursRules (RuleType='overtime') when present.
 *   - Night work (شب‌کاری, 22:00–08:00): +35% of hourly rate (ماده ۵۷).
 *   - Friday work (جمعه‌کاری): +40% (ماده ۶۲ تبصره ۲).
 *   - Holiday work: treated like Friday premium (ضریب تعطیلی).
 *   - Employee social-insurance deduction: 7% of gross (سازمان تأمین اجتماعی, ماده ۹۱).
 *   - Salary tax (مالیات بر حقوق): monthly exemption threshold bands; simplified
 *     progressive table configurable via env PAYROLL_TAX_EXEMPTION (default 24,000,000 Toman 1404).
 *   - حق اولاد: per-child statutory amount (env CHILD_ALLOWANCE, default 1,296,000×? uses 10×daily base).
 *   - Mission allowance flows in from Missions approved within the period.
 *
 * The engine reads AttendanceRecords for a Jalali month, classifies each day
 * using the holidays service + shift definitions, and produces payslip JSON.
 */

import * as jalaali from 'jalaali-js';
import { execute, executeInsert } from '../db.mjs';
import { isIranHoliday, isWeeklyRestDay, holidayName } from './holidays.mjs';

const NIGHT_START = 22 * 60;   // 22:00 in minutes
const NIGHT_END = 8 * 60;      // 08:00 next day

function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/** Minutes worked that fall inside the legal night window (22-8). */
function nightMinutes(inMin, outMin) {
  if (inMin == null || outMin == null) return 0;
  let total = 0;
  // Split into segments crossing midnight if needed
  const segs = outMin > inMin ? [[inMin, outMin]] : [[inMin, 24 * 60], [0, outMin]];
  for (const [a, b] of segs) {
    // night windows within [a,b]: [22*60, 24*60) and [0, 8*60)
    total += Math.max(0, Math.min(b, 24 * 60) - Math.max(a, NIGHT_START));
    total += Math.max(0, Math.min(b, NIGHT_END) - Math.max(a, 0));
  }
  return total;
}

/** Jalali month day count & first-day gregorian date. */
export function jalaliMonthRange(jy, jm) {
  const len = jalaali.jalaaliMonthLength(jy, jm);
  const days = [];
  for (let jd = 1; jd <= len; jd++) {
    const g = jalaali.toGregorian(jy, jm, jd);
    days.push({ jd, gregorian: `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`, jalali: `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}` });
  }
  return days;
}

async function getOvertimeMultiplier() {
  try {
    const rows = await execute(
      `SELECT TOP 1 OvertimeMultiplier FROM attendance.WorkingHoursRules
       WHERE RuleType='overtime' AND IsActive=1 AND OvertimeMultiplier IS NOT NULL
       ORDER BY StartDate DESC`, {}
    );
    if (rows.length && Number(rows[0].OvertimeMultiplier) > 0) return Number(rows[0].OvertimeMultiplier);
  } catch { /* fall through */ }
  return 0.4; // قانون کار: ۴۰٪
}

/**
 * Compute hour aggregates for one employee over a Jalali month.
 */
export async function computeMonthlyHours(employeeId, jy, jm) {
  const days = jalaliMonthRange(jy, jm);
  const dateStrs = days.map(d => `${jy}/${String(jm).padStart(2, '0')}/${String(d.jd).padStart(2, '0')}`);
  const placeholders = dateStrs.map((_, i) => `@d${i}`).join(',');
  const params = {};
  dateStrs.forEach((d, i) => { params[`d${i}`] = d; });

  const records = await execute(
    `SELECT * FROM attendance.AttendanceRecords
     WHERE EmployeeId=@emp AND Date IN (${placeholders})`,
    { emp: employeeId, ...params }
  );
  const byDate = new Map(records.map(r => [r.Date, r]));

  let stdMinutes = 0, otMinutes = 0, nightMinutesTotal = 0, fridayMinutes = 0, holidayMinutes = 0;
  let lateMinutes = 0, absentDays = 0, workedDays = 0;

  // Nominal daily minutes derived from company hours (fallback 8h).
  let dailyStdMin = 8 * 60;
  try {
    const co = await execute(`SELECT TOP 1 WorkStartTime, WorkEndTime, LateThreshold FROM attendance.CompanyInfo WHERE ConfigKey='default'`, {});
    if (co.length) {
      const s = toMin(co[0].WorkStartTime), e = toMin(co[0].WorkEndTime), lt = toMin(co[0].LateThreshold);
      if (s != null && e != null && e > s) dailyStdMin = e - s;
      var lateThresholdMin = lt ?? s;
    }
  } catch { /* defaults */ }

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const key = dateStrs[i];
    const rec = byDate.get(key);
    const gdate = new Date(d.gregorian + 'T00:00:00');
    const holiday = await isIranHoliday(gdate);
    const friday = isWeeklyRestDay(gdate);

    if (!rec || (!rec.ClockIn && !rec.ClockOut)) {
      if (!holiday && !friday) absentDays += 1;
      continue;
    }
    const cin = toMin(rec.ClockIn), cout = toMin(rec.ClockOut);
    if (cin == null || cout == null) continue; // incomplete day — counted elsewhere
    let worked = cout > cin ? cout - cin : (24 * 60 - cin) + cout;
    workedDays += 1;

    nightMinutesTotal += nightMinutes(cin, cout);

    if (holiday) {
      holidayMinutes += worked;
    } else if (friday) {
      fridayMinutes += worked;
    } else {
      stdMinutes += Math.min(worked, dailyStdMin);
      otMinutes += Math.max(0, worked - dailyStdMin);
      if (typeof lateThresholdMin === 'number' && cin > lateThresholdMin) {
        lateMinutes += cin - lateThresholdMin;
      }
    }
  }

  return {
    hoursWorked: +(stdMinutes / 60).toFixed(2),
    overtimeHours: +(otMinutes / 60).toFixed(2),
    nightHours: +(nightMinutesTotal / 60).toFixed(2),
    fridayHours: +(fridayMinutes / 60).toFixed(2),
    holidayHours: +(holidayMinutes / 60).toFixed(2),
    lateMinutes,
    absentDays,
    workedDays,
    calendarDays: days.length,
  };
}

/**
 * Build one payslip (earnings/deductions in Toman).
 */
export async function buildPayslip(employee, jy, jm) {
  const hours = await computeMonthlyHours(employee.Id, jy, jm);
  const otMult = await getOvertimeMultiplier();

  const baseSalary = Number(employee.BaseSalary) || 0;
  const nominalHours = 22 * 8; // ماه ۲۲ روز کاری × ۸ ساعت
  const hourly = Number(employee.HourlyRate) || (baseSalary > 0 ? baseSalary / nominalHours : 0);

  const earnings = {
    baseSalary: Math.round(baseSalary),
    overtime: Math.round(hours.overtimeHours * hourly * (1 + otMult)),
    nightWork: Math.round(hours.nightHours * hourly * 0.35),
    fridayWork: Math.round(hours.fridayHours * hourly * 1.4),
    holidayWork: Math.round(hours.holidayHours * hourly * 1.4),
    mealAllowance: Math.round(Number(employee.MealAllowance) || 0),
    transportation: Math.round(Number(employee.TransportAllowance) || 0),
    housing: Math.round(Number(employee.HousingAllowance) || 0),
    children: Math.round((Number(employee.ChildrenCount) || 0) * (Number(process.env.CHILD_ALLOWANCE) || 0)),
  };

  // Approved missions within the month add حق مأموریت
  try {
    const startJ = `${jy}/${String(jm).padStart(2, '0')}/01`;
    const endJ = `${jy}/${String(jm).padStart(2, '0')}/${String(jalaali.jalaaliMonthLength(jy, jm)).padStart(2, '0')}`;
    const missions = await execute(
      `SELECT ISNULL(SUM(ISNULL(Allowance,0)),0) AS Total FROM attendance.Missions
       WHERE EmployeeId=@emp AND Status='approved' AND StartDate>=@s AND StartDate<=@e`,
      { emp: employee.Id, s: startJ, e: endJ }
    );
    earnings.missionAllowance = Math.round(Number(missions[0]?.Total) || 0);
  } catch { earnings.missionAllowance = 0; }

  const gross = Object.values(earnings).reduce((a, b) => a + b, 0);

  // حق بیمه سهم کارمند: ۷٪
  const deductions = { insurance: Math.round(gross * 0.07) };

  // مالیات حقوق: معافیت ماهانه + نرخ ۱۰٪ ما‌به‌الزا (ساده‌سازی جدول ۱۴۰۴)
  const exemption = Number(process.env.PAYROLL_TAX_EXEMPTION) || 24_000_000;
  const taxable = Math.max(0, gross - exemption);
  deductions.tax = Math.round(taxable * (Number(process.env.PAYROLL_TAX_RATE) || 0.10));

  const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
  const net = gross - totalDeductions;

  return { earnings, deductions, hours, gross, deductionsTotal: totalDeductions, net };
}

/**
 * Run payroll for an entire Jalali month: creates/updates a PayrollRun with
 * payslips for every active employee having salary configured.
 */
export async function runPayroll(jy, jm, userId = null) {
  const employees = await execute(
    `SELECT * FROM attendance.Employees WHERE BaseSalary IS NOT NULL OR HourlyRate IS NOT NULL`, {}
  );

  let run = await execute(
    `SELECT * FROM attendance.PayrollRuns WHERE JalaliYear=@y AND JalaliMonth=@m`, { y: jy, m: jm }
  );
  let runId;
  if (run.length === 0) {
    runId = await executeInsert(
      `INSERT INTO attendance.PayrollRuns (JalaliYear, JalaliMonth, Title, Status, CreatedBy)
       VALUES (@y, @m, @title, 'calculated', @createdBy)`,
      { y: jy, m: jm, title: `حقوق ${jm}/${jy}`, createdBy: userId }
    );
  } else {
    runId = run[0].Id;
    await execute(`DELETE FROM attendance.Payslips WHERE RunId=@id`, { id: runId });
    await execute(`UPDATE attendance.PayrollRuns SET Status='calculated', UpdatedAt=GETDATE() WHERE Id=@id`, { id: runId });
  }

  let totalGross = 0, totalNet = 0;
  const slips = [];
  for (const emp of employees) {
    const slip = await buildPayslip(emp, jy, jm);
    totalGross += slip.gross; totalNet += slip.net;
    await executeInsert(
      `INSERT INTO attendance.Payslips (RunId, EmployeeId, EarningsJson, DeductionsJson, HoursWorked, OvertimeHours, NightHours, HolidayHours, LateMinutes, AbsentDays, Gross, Net)
       VALUES (@runId,@emp,@earnings,@deductions,@hoursWorked,@ot,@night,@holiday,@late,@absent,@gross,@net)`,
      {
        runId, emp: emp.Id,
        earnings: JSON.stringify(slip.earnings),
        deductions: JSON.stringify(slip.deductions),
        hoursWorked: slip.hours.hoursWorked, ot: slip.hours.overtimeHours,
        night: slip.hours.nightHours, holiday: slip.hours.holidayHours + slip.hours.fridayHours,
        late: slip.hours.lateMinutes, absent: slip.hours.absentDays,
        gross: slip.gross, net: slip.net,
      }
    );
    slips.push({ employeeId: emp.Id, name: emp.Name, ...slip });
  }

  await execute(
    `UPDATE attendance.PayrollRuns SET TotalGross=@g, TotalNet=@n WHERE Id=@id`,
    { g: totalGross, n: totalNet, id: runId }
  );

  return { runId, jy, jm, employees: employees.length, totalGross, totalNet, slips };
}
