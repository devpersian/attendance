import express from 'express';
import * as jalaali from 'jalaali-js';
import { execute } from '../db.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { holidayName, isIranHoliday, isWeeklyRestDay } from '../services/holidays.mjs';

const router = express.Router();

// All business endpoints require a valid session token.
router.use(authenticateToken);

/** Convert a Jalali date string "1405-01-01" (or "1405/01/01") to a JS Date. */
function jalaliStrToDate(s) {
  const m = String(s).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const g = jalaali.toGregorian(+m[1], +m[2], +m[3]);
  return new Date(g.gy, g.gm - 1, g.gd);
}

/** Convert a Date to Jalali string "jy-jm-jd". */
function dateToJalaliStr(d) {
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`;
}

// GET /api/holidays?year=1405 — full official calendar for a Jalali year
router.get('/', async (req, res) => {
  try {
    const nowJ = jalaali.toJalaali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const jy = parseInt(req.query.year, 10) || nowJ.jy;

    // Collect DB rows (movable lunar holidays seeded per year)
    let dbRows = [];
    try {
      dbRows = await execute(
        `SELECT HolidayDate, Name, Kind FROM attendance.Holidays WHERE JalaliYear = @jy OR JalaliYear IS NULL`,
        { jy }
      );
    } catch {
      try {
        dbRows = await execute(`SELECT HolidayDate, Name, Kind FROM attendance.Holidays`, {});
      } catch { /* table may not exist yet */ }
    }

    const byDate = new Map();
    for (const r of dbRows) {
      const d = new Date(r.HolidayDate);
      if (isNaN(d)) continue;
      const key = d.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, r.Name);
    }

    // Walk every day of the Jalali year and merge built-in fixed/lunar names.
    const list = [];
    for (let jm = 1; jm <= 12; jm++) {
      const len = jalaali.jalaaliMonthLength(jy, jm);
      for (let jd = 1; jd <= len; jd++) {
        const g = jalaali.toGregorian(jy, jm, jd);
        const d = new Date(g.gy, g.gm - 1, g.gd);
        const gkey = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
        const name = (await holidayName(d)) || byDate.get(gkey);
        if (name) {
          list.push({
            jalali: `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`,
            gregorian: gkey,
            weekday: d.getDay(), // 5 = Friday
            name,
          });
        }
      }
    }

    res.json({ year: jy, holidays: list });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// GET /api/holidays/check?date=2026-03-21 — single-day lookup for widgets
router.get('/check', async (req, res) => {
  try {
    const raw = req.query.date;
    const d = raw ? new Date(raw) : new Date();
    if (isNaN(d)) return res.status(400).json({ error: 'Invalid date' });
    const holiday = await isIranHoliday(d);
    res.json({
      date: d.toISOString().slice(0, 10),
      jalali: dateToJalaliStr(d),
      isHoliday: holiday,
      isFriday: isWeeklyRestDay(d),
      isNonWorking: holiday || isWeeklyRestDay(d),
      name: holiday ? await holidayName(d) : null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check holiday' });
  }
});

export { jalaliStrToDate, dateToJalaliStr };
export default router;
