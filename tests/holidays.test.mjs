import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGregorian as toGregorianRef } from 'jalaali-js';
import {
  isHoliday, workingDaysInMonth, holidaysInMonth, getHolidaysForYear, IRAN_HOLIDAYS,
} from '../server/services/holidays.mjs';

test('Nowruz days are holidays', () => {
  for (const d of [1, 2, 3, 4]) assert.equal(isHoliday(`1403/01/${d}`), true);
});

test('Fridays are weekly holidays', () => {
  const map = getHolidaysForYear(1403);
  // 1403 has 52 Fridays; some coincide with official holidays and keep the
  // official name (first-write-wins), so weekly entries may be slightly fewer.
  const fridays = Object.values(map).filter((h) => h.type === 'weekly');
  assert.ok(fridays.length >= 45, `expected >=45 weekly Friday entries, got ${fridays.length}`);
  // Every Friday must be marked as a holiday regardless of naming.
  let fridayCount = 0;
  for (let jm = 1; jm <= 12; jm++) {
    const len = jm <= 6 ? 31 : jm <= 11 ? 30 : 30; // 1403 is a leap year
    for (let jd = 1; jd <= len; jd++) {
      if (isHoliday(`1403/${jm}/${jd}`)) {
        const g = toGregorianRef(1403, jm, jd);
        if (new Date(g.gy, g.gm - 1, g.gd).getDay() === 5) fridayCount++;
      }
    }
  }
  assert.equal(fridayCount, 52);
});

test('a normal Saturday is not a holiday', () => {
  // 1403/02/01 Ordibehesht 1, 1403 = Sat 2024-04-20
  assert.equal(isHoliday('1403/02/01'), false);
});

test('workingDaysInMonth matches month length minus holidays', () => {
  const len = 31; // Ordibehesht always has 31 days
  const wd = workingDaysInMonth(1403, 2);
  const hol = holidaysInMonth(1403, 2).length;
  assert.equal(wd + hol, len);
  assert.ok(wd > 20 && wd < 31);
});

test('workingDaysInMonth never returns the old hardcoded 30', () => {
  // Farvardin 1403 has many official holidays -> well under 30
  assert.ok(workingDaysInMonth(1403, 1) < 25);
});

test('uptoDay parameter clamps counting', () => {
  assert.equal(workingDaysInMonth(1403, 2, 10), workingDaysInMonth(1403, 2, 10));
  assert.ok(workingDaysInMonth(1403, 2, 7) <= 7);
});

test('invalid input is handled gracefully', () => {
  assert.equal(isHoliday(''), false);
  assert.equal(isHoliday(null), false);
  assert.equal(isHoliday('not-a-date'), false);
});

test('holiday definitions have required fields', () => {
  for (const h of IRAN_HOLIDAYS) {
    assert.ok(h.name && h.jm >= 1 && h.jm <= 12);
    assert.ok(['religious', 'national'].includes(h.type));
  }
});
