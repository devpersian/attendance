import * as jalaali from 'jalaali-js';

const persianMonths = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const persianWeekDays = [
  'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'
];

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
}

export function getTodayJalali(): { jy: number; jm: number; jd: number } {
  const now = new Date();
  return jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function getTodayJalaliString(): string {
  const { jy, jm, jd } = getTodayJalali();
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function getFullDateJalali(): string {
  const now = new Date();
  const { jy, jm, jd } = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const dayOfWeek = now.getDay();
  return `${persianWeekDays[dayOfWeek]}، ${toPersianDigits(jd)} ${persianMonths[jm - 1]} ${toPersianDigits(jy)}`;
}

export function getCurrentTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getMonthName(month: number): string {
  return persianMonths[month - 1];
}

export function getWeekDayName(date: Date): string {
  return persianWeekDays[date.getDay()];
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return jalaali.toGregorian(jy, jm, jd);
}

export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return jalaali.toJalaali(gy, gm, gd);
}

export function getDaysInJalaliMonth(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function getMonthDays(jy: number, jm: number): string[] {
  const days: string[] = [];
  const daysCount = getDaysInJalaliMonth(jy, jm);
  for (let i = 1; i <= daysCount; i++) {
    days.push(`${jy}/${String(jm).padStart(2, '0')}/${String(i).padStart(2, '0')}`);
  }
  return days;
}

export function formatJalaliDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'تاریخ نامعتبر';
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return 'تاریخ نامعتبر';
  
  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);
  
  if (isNaN(jy) || isNaN(jm) || isNaN(jd)) return 'تاریخ نامعتبر';
  
  return `${toPersianDigits(jd)} ${persianMonths[jm - 1]} ${toPersianDigits(jy)}`;
}

export function getFirstDayOfMonth(jy: number, jm: number): number {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, 1);
  const date = new Date(gy, gm - 1, gd);
  // Saturday = 0 in Persian week
  const day = date.getDay();
  // Convert: Sunday=6, Monday=0, Tuesday=1, ... Saturday=5 -> Persian: Saturday=0
  return (day + 1) % 7;
}

export { persianMonths, persianWeekDays };
