/**
 * Iranian official (Jalali) holidays calendar.
 *
 * Two kinds of entries are supported:
 *  - `fixed`   : a specific Jalali date (repeats every year).
 *  - `weekday` : every occurrence of a weekday in a given month
 *                (e.g. Fridays; `nth: 'last'` = last Friday of the month,
 *                 used for Nowruz 12 Farvardin which varies by year).
 *
 * All Gregorian dates are computed lazily per requested Jalali year using
 * jalaali-js, so no hardcoded conversion tables go stale.
 */

// jalaali-js v2 is a CommonJS/ESM dual package without a default export in
// ESM interop, so import the whole namespace and use its named helpers.
import * as jalali from 'jalaali-js';

const { toGregorian, toJalaali, isLeapJalaaliYear } = jalali;

const WEEKDAY_GREGORIAN_TO_JALALI = {
  // Gregorian getDay(): 0=Sun .. 6=Sat  →  Jalali index 0=Sat .. 6=Fri
  0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0,
};

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/**
 * Official Iranian holidays (religious & national), keyed by Jalali month/day.
 * Religious lunar dates drift ~11 days/year against the solar calendar; the
 * fixed entries below reflect the commonly-used approximations and should be
 * refreshed annually from the official calendar announcement.
 */
export const IRAN_HOLIDAYS = [
  // ---------------- religious ----------------
  { jm: 1, jd: 2, name: 'عید فطر (روز اول)', type: 'religious' },
  { jm: 1, jd: 3, name: 'عید فطر (روز دوم)', type: 'religious' },
  { jm: 2, jd: 20, name: 'شهادت امام حسن مجتبی(ع)', type: 'religious' },
  { jm: 3, jd: 14, name: 'رحلت امام خمینی(ره)', type: 'religious' },
  { jm: 3, jd: 15, name: 'قیام ۱۵ خرداد', type: 'religious' },
  { jm: 6, jd: 7, name: 'شهادت امام رضا(ع)', type: 'religious' },
  { jm: 8, jd: 20, name: 'اربعین حسینی', type: 'religious' },
  { jm: 9, jd: 24, name: 'شهادت پیامبر اکرم(ص) و امام حسن مجتبی(ع)', type: 'religious' },
  { jm: 10, jd: 7, name: 'شهادت امام جواد(ع)', type: 'religious' },
  { jm: 10, jd: 20, name: 'میلاد پیامبر اکرم(ص) و امام جعفر صادق(ع)', type: 'religious' },
  { jm: 11, jd: 1, name: 'شهادت حضرت زهرا(س)', type: 'religious' },
  { jm: 12, jd: 15, name: 'عید قربان', type: 'religious' },
  { jm: 12, jd: 18, name: 'عید غدیر خم', type: 'religious' },
  // ---------------- national ----------------
  { jm: 1, jd: 1, name: 'نوروز', type: 'national' },
  { jm: 1, jd: 2, name: 'نوروز', type: 'national' },
  { jm: 1, jd: 3, name: 'نوروز', type: 'national' },
  { jm: 1, jd: 4, name: 'نوروز', type: 'national' },
  { jm: 1, jd: 6, name: 'روز طبیعت', type: 'national' },
  { jm: 1, jd: 12, name: 'جمعه آخر تعطیلات نوروز', type: 'national', weekdayRule: { jm: 1, nth: 'last' } },
  { jm: 1, jd: 13, name: 'روز جمهوری اسلامی', type: 'national' },
  { jm: 11, jd: 22, name: 'پیروزی انقلاب اسلامی', type: 'national' },
];

/** Weekly rest day in Iran: Friday (Jalali weekday index 6, Sat=0..Fri=6). */
export const FRIDAY_INDEX = 6;

function jalaliToGregorian(jy, jm, jd) {
  return toGregorian(jy, jm, jd);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toJalaliDateStr(jy, jm, jd) {
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

/** Last day of a Jalali month (months 1-6: 31, 7-11: 30, 12: 29 or 30 leap). */
function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

/**
 * Build the holiday map for one Jalali year.
 * @param {number} jy
 * @returns {{ [jalaliDate: string]: { name: string, type: string, isHoliday: true } }}
 */
export function getHolidaysForYear(jy) {
  const map = {};

  for (const h of IRAN_HOLIDAYS) {
    if (!h.weekdayRule) {
      const jd = Math.min(h.jd, jalaliMonthLength(jy, h.jm));
      map[toJalaliDateStr(jy, h.jm, jd)] = { name: h.name, type: h.type, isHoliday: true };
    }
  }

  // Every Friday
  for (let jm = 1; jm <= 12; jm++) {
    for (let jd = 1; jd <= jalaliMonthLength(jy, jm); jd++) {
      const g = jalaliToGregorian(jy, jm, jd);
      const gDay = new Date(g.gy, g.gm - 1, g.gd).getDay();
      if (WEEKDAY_GREGORIAN_TO_JALALI[gDay] === FRIDAY_INDEX) {
        const key = toJalaliDateStr(jy, jm, jd);
        if (!map[key]) map[key] = { name: 'تعطیل رسمی (جمعه)', type: 'weekly', isHoliday: true };
      }
    }
  }

  // Weekday rules (e.g. last Friday of Farvardin)
  for (const h of IRAN_HOLIDAYS) {
    if (!h.weekdayRule) continue;
    const { jm: rjM, nth } = h.weekdayRule;
    const len = jalaliMonthLength(jy, rjM);
    for (let jd = len; jd >= 1; jd--) {
      const g = jalaliToGregorian(jy, rjM, jd);
      const gDay = new Date(g.gy, g.gm - 1, g.gd).getDay();
      if (WEEKDAY_GREGORIAN_TO_JALALI[gDay] === FRIDAY_INDEX) {
        map[toJalaliDateStr(jy, rjM, jd)] = { name: h.name, type: h.type, isHoliday: true };
        break;
      }
    }
  }

  return map;
}

const yearCache = new Map();
function cachedYear(jy) {
  if (!yearCache.has(jy)) yearCache.set(jy, getHolidaysForYear(jy));
  return yearCache.get(jy);
}

/**
 * Is a Jalali date (string 'jy/jm/jd') an official holiday?
 */
export function isHoliday(jalaliDateStr) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(jalaliDateStr || '').trim());
  if (!m) return false;
  const key = toJalaliDateStr(Number(m[1]), Number(m[2]), Number(m[3]));
  return !!cachedYear(Number(m[1]))[key];
}

/** Resolve any date-like value to a JS Date (invalid input → null). */
function toDate(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Internal: holiday entry for a Gregorian date, or null. */
function entryForDate(dateLike) {
  const d = toDate(dateLike);
  if (!d) return null;
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const key = toJalaliDateStr(j.jy, j.jm, j.jd);
  return cachedYear(j.jy)[key] || null;
}

/**
 * Official Iranian holiday name for a Gregorian date (excluding weekly
 * Fridays), or null if the day is not an official holiday.
 */
export function holidayName(dateLike) {
  const e = entryForDate(dateLike);
  if (!e || e.type === 'weekly') return null;
  return e.name;
}

/**
 * Is a Gregorian date an official Iranian holiday (non-Friday)?
 */
export function isIranHoliday(dateLike) {
  const e = entryForDate(dateLike);
  return !!e && e.type !== 'weekly';
}

/**
 * Is a Gregorian date a Friday (weekly rest day in Iran)?
 */
export function isWeeklyRestDay(dateLike) {
  const d = toDate(dateLike);
  if (!d) return false;
  return WEEKDAY_GREGORIAN_TO_JALALI[d.getDay()] === FRIDAY_INDEX;
}

/**
 * Is a Gregorian Date (or anything parseable by Date) a non-working day
 * in Iran?  Non-working = Friday or an official holiday.
 * Used by attendance/device record generation to tag entries as 'holiday'.
 */
export function isNonWorkingDay(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate()); // { jy, jm, jd }
  const key = toJalaliDateStr(j.jy, j.jm, j.jd);
  return !!cachedYear(j.jy)[key];
}

/**
 * Count official working days in a Jalali month:
 * all days except Fridays and official holidays.
 * If `uptoDay` is given, counts only through that day of the month.
 */
export function workingDaysInMonth(jy, jm, uptoDay = null) {
  const holidays = cachedYear(jy);
  const len = jalaliMonthLength(jy, jm);
  const limit = uptoDay != null ? Math.min(uptoDay, len) : len;
  let count = 0;
  for (let jd = 1; jd <= limit; jd++) {
    const key = toJalaliDateStr(jy, jm, jd);
    const entry = holidays[key];
    if (entry) continue; // Friday (weekly) or official holiday
    count++;
  }
  return count;
}

/**
 * List of holiday objects for a Jalali month (sorted by day).
 */
export function holidaysInMonth(jy, jm) {
  const holidays = cachedYear(jy);
  const out = [];
  for (let jd = 1; jd <= jalaliMonthLength(jy, jm); jd++) {
    const key = toJalaliDateStr(jy, jm, jd);
    const entry = holidays[key];
    if (entry) out.push({ date: key, ...entry });
  }
  return out;
}
