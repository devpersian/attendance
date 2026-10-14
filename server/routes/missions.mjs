import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { jalaliStrToDate } from './holidays.mjs';

const router = express.Router();
router.use(authenticateToken);

// ---------- Missions (مأموریت) ----------

// GET /api/missions?employeeId=&status=
router.get('/', async (req, res) => {
  try {
    let q = `SELECT m.*, e.Name AS EmployeeName FROM attendance.Missions m
             JOIN attendance.Employees e ON e.Id = m.EmployeeId WHERE 1=1`;
    const p = {};
    if (req.query.employeeId) { q += ' AND m.EmployeeId=@emp'; p.emp = req.query.employeeId; }
    if (req.query.status) { q += ' AND m.Status=@st'; p.st = req.query.status; }
    q += ' ORDER BY m.StartDate DESC';
    res.json(await execute(q, p));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/missions — create mission order { employeeId, startDate, endDate, destination, purpose, allowance }
router.post('/', async (req, res) => {
  try {
    const { employeeId, startDate, endDate, destination, purpose, allowance } = req.body;
    if (!employeeId || !startDate || !endDate || !purpose) {
      return res.status(400).json({ error: 'کارمند، تاریخ شروع/پایان و هدف مأموریت الزامی است' });
    }
    const sd = jalaliStrToDate(startDate), ed = jalaliStrToDate(endDate);
    if (!sd || !ed || ed < sd) return res.status(400).json({ error: 'تاریخ‌ها نامعتبرند' });
    const days = Math.round((ed - sd) / 86400000) + 1;

    const id = await executeInsert(
      `INSERT INTO attendance.Missions (EmployeeId, StartDate, EndDate, Destination, Purpose, Allowance, Status)
       VALUES (@emp,@sd,@ed,@dest,@purpose,@allowance,'pending')`,
      { emp: employeeId, sd, ed, dest: destination || null, purpose, allowance: allowance != null ? Number(allowance) * days : null }
    );
    res.status(201).json({ id, days, message: 'مأموریت ثبت شد' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/missions/:id — update fields
router.put('/:id', async (req, res) => {
  try {
    const { destination, purpose, allowance, startDate, endDate } = req.body;
    await execute(
      `UPDATE attendance.Missions SET
         Destination=ISNULL(@dest,Destination), Purpose=ISNULL(@purpose,Purpose),
         Allowance=ISNULL(@allowance,Allowance), StartDate=ISNULL(@sd,StartDate), EndDate=ISNULL(@ed,EndDate),
         UpdatedAt=GETDATE() WHERE Id=@id`,
      { id: req.params.id, dest: destination ?? null, purpose: purpose ?? null,
        allowance: allowance != null ? Number(allowance) : null, sd: startDate ?? null, ed: endDate ?? null }
    );
    res.json({ message: 'به‌روزرسانی شد' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/missions/:id/approve { action: 'approved'|'rejected'|'done' }
router.post('/:id/approve', async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approved', 'rejected', 'done'].includes(action)) return res.status(400).json({ error: 'action نامعتبر' });
    await execute(
      `UPDATE attendance.Missions SET Status=@a, ApproverUserId=@u, ActedAt=GETDATE(), UpdatedAt=GETDATE() WHERE Id=@id`,
      { a: action, u: req.user?.id ?? null, id: req.params.id }
    );
    res.json({ message: `مأموریت ${action === 'approved' ? 'تایید' : action === 'rejected' ? 'رد' : 'انجام شده'} شد` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Attendance Corrections (اصلاح تردد) ----------

// GET /api/missions/corrections?status=pending
router.get('/corrections', async (req, res) => {
  try {
    let q = `SELECT c.*, e.Name AS EmployeeName FROM attendance.AttendanceCorrections c
             JOIN attendance.Employees e ON e.Id=c.EmployeeId WHERE 1=1`;
    const p = {};
    if (req.query.status) { q += ' AND c.Status=@st'; p.st = req.query.status; }
    q += ' ORDER BY c.CreatedAt DESC';
    res.json(await execute(q, p));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/missions/corrections — request correction { employeeId, date, clockIn?, clockOut?, reason }
router.post('/corrections', async (req, res) => {
  try {
    const { employeeId, date, clockIn, clockOut, reason } = req.body;
    if (!employeeId || !date || !reason) return res.status(400).json({ error: 'کارمند، تاریخ و دلیل الزامی است' });
    if (!clockIn && !clockOut) return res.status(400).json({ error: 'حداقل یک ساعت ورود یا خروج مشخص کنید' });

    const recs = await execute('SELECT Id FROM attendance.AttendanceRecords WHERE EmployeeId=@emp AND Date=@d', { emp: employeeId, d: date });
    const id = await executeInsert(
      `INSERT INTO attendance.AttendanceCorrections (RecordId, EmployeeId, Date, RequestedClockIn, RequestedClockOut, Reason, Status)
       VALUES (@recId,@emp,@d,@ci,@co,@reason,'pending')`,
      { recId: recs[0]?.Id ?? null, emp: employeeId, d: date, ci: clockIn || null, co: clockOut || null, reason }
    );
    res.status(201).json({ id, message: 'درخواست اصلاح تردد ثبت شد' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/missions/corrections/:id/approve { action, comment } — on approval applies to the record
router.post('/corrections/:id/approve', async (req, res) => {
  try {
    const { action, comment } = req.body;
    if (!['approved', 'rejected'].includes(action)) return res.status(400).json({ error: 'action نامعتبر' });
    const rows = await execute('SELECT * FROM attendance.AttendanceCorrections WHERE Id=@id', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ error: 'یافت نشد' });
    const c = rows[0];

    if (action === 'approved') {
      // Ensure a record exists for that day, then patch the requested times.
      let recId = c.RecordId;
      if (!recId) {
        recId = await executeInsert(
          `INSERT INTO attendance.AttendanceRecords (EmployeeId, Date, ClockIn, ClockOut, Status)
           VALUES (@emp,@d,@ci,@co,'present')`,
          { emp: c.EmployeeId, d: c.Date, ci: c.RequestedClockIn || null, co: c.RequestedClockOut || null }
        );
      } else {
        await execute(
          `UPDATE attendance.AttendanceRecords SET ClockIn=ISNULL(@ci,ClockIn), ClockOut=ISNULL(@co,ClockOut) WHERE Id=@id`,
          { id: recId, ci: c.RequestedClockIn || null, co: c.RequestedClockOut || null }
        );
      }
      await execute(`UPDATE attendance.AttendanceCorrections SET RecordId=@recId WHERE Id=@id`, { recId, id: c.Id });
    }

    await execute(
      `UPDATE attendance.AttendanceCorrections SET Status=@a, ApproverUserId=@u, ApproverComment=@cmt, ActedAt=GETDATE() WHERE Id=@id`,
      { a: action, u: req.user?.id ?? null, cmt: comment || null, id: c.Id }
    );
    res.json({ message: action === 'approved' ? 'تردد اصلاح شد' : 'درخواست رد شد' });
  } catch (e) {
    console.error('correction approve error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
