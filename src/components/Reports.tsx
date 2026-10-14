import React from 'react';
import { fetchAPI } from '../utils/http';
import { toPersianDigits, getTodayJalali, getMonthName } from '../utils/jalali';
import { BarChart3, TrendingUp, Users, Clock, Loader2, Award, Download, Printer, AlertTriangle, AlarmClock, CalendarX } from 'lucide-react';

interface MonthlyEmployee { employeeId: number; name: string; department: string; presentDays: number; lateDays: number; absentDays: number; rate: number }
interface DeptRow { department: string; employees: number; presentDays: number; lateDays: number; absentDays: number; capacity: number; rate: number }
interface MonthlyData { month: string; workingDays: number; employees: MonthlyEmployee[]; departments: DeptRow[] }
interface ViolationRow { employeeId: number; name: string; department: string; lateDays: number; lateDates: string[]; absences: string[] }
interface OvertimeRow { employeeId: number; name: string; department: string; overtimeMinutes: number; overtimeHours: number; days: number }
interface HolidayRow { date: string; name: string; type: string }
interface HolidaysData { month: string; workingDays: number; holidays: HolidayRow[] }

type Tab = 'monthly' | 'violations' | 'overtime' | 'holidays';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'monthly', label: 'گزارش ماهانه', icon: <BarChart3 size={16} /> },
  { key: 'violations', label: 'تخلفات و غیبت', icon: <AlertTriangle size={16} /> },
  { key: 'overtime', label: 'ساعات اضافه‌کاری', icon: <AlarmClock size={16} /> },
  { key: 'holidays', label: 'تعطیلات رسمی', icon: <CalendarX size={16} /> },
];

// ---- Export helpers (dependency-free) --------------------------------------

function download(filename: string, content: string, mime: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const escXml = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Excel-compatible SpreadsheetML 2.0 XML - opens natively in Excel/WPS. */
export function exportExcel(sheetName: string, headers: string[], rows: (string | number)[][], filename: string) {
  const cell = (v: string | number) =>
    typeof v === 'number'
      ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${escXml(v)}</Data></Cell>`;
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${escXml(sheetName)}"><Table>
<Row>${headers.map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escXml(h)}</Data></Cell>`).join('')}</Row>
${rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('\n')}
</Table></Worksheet></Workbook>`;
  download(filename, xml, 'application/vnd.ms-excel');
}

function exportCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const q = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  download(filename, [headers, ...rows].map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

export default function Reports() {
  const today = getTodayJalali();
  const defaultMonth = `${today.jy}/${String(today.jm).padStart(2, '0')}`;
  const [tab, setTab] = React.useState<Tab>('monthly');
  const [month, setMonth] = React.useState(defaultMonth);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [monthly, setMonthly] = React.useState<MonthlyData | null>(null);
  const [violations, setViolations] = React.useState<{ month: string; violations: ViolationRow[] } | null>(null);
  const [overtime, setOvertime] = React.useState<{ month: string; overtime: OvertimeRow[] } | null>(null);
  const [holidays, setHolidays] = React.useState<HolidaysData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = `?month=${encodeURIComponent(month)}`;
    const run = async () => {
      try {
        if (tab === 'monthly') {
          const d = await fetchAPI<MonthlyData>(`/reports/monthly${qs}`, { timeoutMs: 20_000 });
          if (!cancelled) setMonthly(d);
        } else if (tab === 'violations') {
          const d = await fetchAPI<{ month: string; violations: ViolationRow[] }>(`/reports/violations${qs}`, { timeoutMs: 20_000 });
          if (!cancelled) setViolations(d);
        } else if (tab === 'overtime') {
          const d = await fetchAPI<{ month: string; overtime: OvertimeRow[] }>(`/reports/overtime${qs}`, { timeoutMs: 20_000 });
          if (!cancelled) setOvertime(d);
        } else {
          const d = await fetchAPI<HolidaysData>(`/reports/holidays${qs}`);
          if (!cancelled) setHolidays(d);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'خطا در دریافت گزارش');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [tab, month]);

  const [jyStr, jmStr] = month.split('/');
  const monthTitle = `${getMonthName(Number(jmStr))} ${toPersianDigits(jyStr)}`;

  const activeRows = (): { headers: string[]; rows: (string | number)[][]; name: string } => {
    if (tab === 'monthly' && monthly) {
      return {
        name: 'report-monthly',
        headers: ['نام', 'دپارتمان', 'روزهای حاضر', 'تأخیر', 'غیبت', 'نرخ حضور (٪)'],
        rows: monthly.employees.map((e) => [e.name, e.department, e.presentDays, e.lateDays, e.absentDays, e.rate]),
      };
    }
    if (tab === 'violations' && violations) {
      return {
        name: 'report-violations',
        headers: ['نام', 'دپارتمان', 'تعداد تأخیر', 'تاریخ‌های تأخیر', 'غیبت‌ها'],
        rows: violations.violations.map((v) => [v.name, v.department, v.lateDays, v.lateDates.join(' , '), v.absences.join(' , ')]),
      };
    }
    if (tab === 'overtime' && overtime) {
      return {
        name: 'report-overtime',
        headers: ['نام', 'دپارتمان', 'روزهای اضافه‌کاری', 'ساعت اضافه‌کاری'],
        rows: overtime.overtime.map((o) => [o.name, o.department, o.days, o.overtimeHours]),
      };
    }
    if (tab === 'holidays' && holidays) {
      return {
        name: 'report-holidays',
        headers: ['تاریخ', 'عنوان', 'نوع'],
        rows: holidays.holidays.map((h) => [h.date, h.name, h.type === 'friday' ? 'جمعه' : 'رسمی']),
      };
    }
    return { name: 'report', headers: [], rows: [] };
  };

  const dataReady = !loading && !error &&
    ((tab === 'monthly' && monthly) || (tab === 'violations' && violations) ||
     (tab === 'overtime' && overtime) || (tab === 'holidays' && holidays));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in print:hidden">
        <div>
          <h2 className="ent-h1 mb-1">گزارشات</h2>
          <p className="ent-body">گزارش‌های حضور و غیاب — {monthTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="1403/07"
            className="border border-[#C4C6C9] rounded px-3 py-1.5 text-sm w-24 focus:outline-none focus:border-[#0A6ED1]"
            aria-label="ماه (jy/mm)"
          />
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#C4C6C9] text-sm hover:bg-[#F7F8FA]" title="چاپ">
            <Printer size={15} /> چاپ
          </button>
          <button
            disabled={!dataReady}
            onClick={() => { const { headers, rows, name } = activeRows(); exportExcel(monthTitle, headers, rows, `${name}-${month}.xls`); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0A6ED1] text-white text-sm hover:bg-[#085FB5] disabled:opacity-50"
            title="خروجی اکسل"
          >
            <Download size={15} /> اکسل
          </button>
          <button
            disabled={!dataReady}
            onClick={() => { const { headers, rows, name } = activeRows(); exportCsv(headers, rows, `${name}-${month}.csv`); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#107E3E] text-white text-sm hover:bg-[#0C6B33] disabled:opacity-50"
            title="خروجی CSV"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[#E1E3E6] animate-fade-in print:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-t transition-colors ${
              tab === t.key
                ? 'bg-white border border-b-white border-[#E1E3E6] font-semibold text-[#0A6ED1] -mb-px'
                : 'text-[#54585A] hover:bg-[#F0F1F3]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="ent-card p-4 text-[#BB0000] flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="ent-card p-8 text-center">
            <Loader2 size={40} className="animate-spin text-[#0A6ED1] mx-auto mb-3" />
            <p className="ent-body">در حال بارگذاری...</p>
          </div>
        </div>
      ) : !error && tab === 'monthly' && monthly ? (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="ent-tile">
              <div className="flex items-center gap-3">
                <div className="ent-icon"><Users size={20} /></div>
                <div>
                  <p className="ent-kpi">{toPersianDigits(monthly.employees.length)}</p>
                  <p className="ent-label">کل کارکنان</p>
                </div>
              </div>
            </div>
            <div className="ent-tile">
              <div className="flex items-center gap-3">
                <div className="ent-icon ent-icon-success"><TrendingUp size={20} /></div>
                <div>
                  <p className="ent-kpi">{toPersianDigits(monthly.workingDays)}</p>
                  <p className="ent-label">روز کاری ماه (بدون تعطیلات)</p>
                </div>
              </div>
            </div>
            <div className="ent-tile">
              <div className="flex items-center gap-3">
                <div className="ent-icon"><Clock size={20} /></div>
                <div>
                  <p className="ent-kpi-accent">
                    {toPersianDigits(
                      monthly.employees.length > 0
                        ? Math.round(monthly.employees.reduce((s, e) => s + e.rate, 0) / monthly.employees.length)
                        : 0
                    )}٪
                  </p>
                  <p className="ent-label">میانگین نرخ حضور</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Department rates */}
            <div className="ent-card p-5">
              <h3 className="ent-h3 mb-5">نرخ حضور دپارتمان‌ها</h3>
              <div className="space-y-4">
                {monthly.departments.map((dept, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="ent-body font-medium">{dept.department}</span>
                      <span className="ent-kpi-accent text-lg">{toPersianDigits(dept.rate)}٪</span>
                    </div>
                    <div className="ent-progress">
                      <div className="ent-progress-fill" style={{ width: `${dept.rate}%` }} />
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="ent-caption">کارکنان: {toPersianDigits(dept.employees)}</span>
                      <span className="ent-caption">حاضر: {toPersianDigits(dept.presentDays)}</span>
                      <span className="ent-caption">تأخیر: {toPersianDigits(dept.lateDays)}</span>
                      <span className="ent-caption">غیبت: {toPersianDigits(dept.absentDays)}</span>
                    </div>
                  </div>
                ))}
                {monthly.departments.length === 0 && <p className="text-center ent-caption py-6">داده‌ای موجود نیست</p>}
              </div>
            </div>

            {/* Top employees */}
            <div className="ent-card p-5">
              <h3 className="ent-h3 mb-5">بیشترین حضور این ماه</h3>
              <div className="space-y-3">
                {[...monthly.employees].sort((a, b) => b.presentDays - a.presentDays).slice(0, 5).map((emp, i) => (
                  <div key={emp.employeeId} className="flex items-center gap-3 p-3 rounded hover:bg-[#F7F8FA] transition-colors">
                    <div className={`w-10 h-10 rounded flex items-center justify-center text-white text-sm font-semibold ${
                      i === 0 ? 'bg-[#C17900]' : i === 1 ? 'bg-[#8A8E93]' : i === 2 ? 'bg-[#A0A4A8]' : 'bg-[#C4C6C9]'
                    }`}>
                      {i === 0 ? <Award size={18} /> : toPersianDigits(i + 1)}
                    </div>
                    <div className="flex-1">
                      <p className="ent-body font-medium">{emp.name}</p>
                      <p className="ent-caption">{emp.department}</p>
                    </div>
                    <div className="text-left">
                      <p className="ent-kpi-accent text-lg">{toPersianDigits(emp.presentDays)}</p>
                      {emp.lateDays > 0 && <p className="ent-caption text-xs">({toPersianDigits(emp.lateDays)} تأخیر)</p>}
                    </div>
                  </div>
                ))}
                {monthly.employees.length === 0 && <p className="text-center ent-caption py-6">داده‌ای موجود نیست</p>}
              </div>
            </div>
          </div>

          {/* Full table for printing */}
          <div className="ent-card p-5 overflow-x-auto">
            <h3 className="ent-h3 mb-4">جدول کامل ماهانه — {monthTitle}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right border-b border-[#E1E3E6]">
                  <th className="py-2 px-3 font-semibold">نام</th>
                  <th className="py-2 px-3 font-semibold">دپارتمان</th>
                  <th className="py-2 px-3 font-semibold">حاضر</th>
                  <th className="py-2 px-3 font-semibold">تأخیر</th>
                  <th className="py-2 px-3 font-semibold">غیبت</th>
                  <th className="py-2 px-3 font-semibold">نرخ</th>
                </tr>
              </thead>
              <tbody>
                {monthly.employees.map((e) => (
                  <tr key={e.employeeId} className="border-b border-[#F0F1F3] hover:bg-[#F7F8FA]">
                    <td className="py-2 px-3">{e.name}</td>
                    <td className="py-2 px-3">{e.department}</td>
                    <td className="py-2 px-3">{toPersianDigits(e.presentDays)}</td>
                    <td className="py-2 px-3">{toPersianDigits(e.lateDays)}</td>
                    <td className="py-2 px-3 text-[#BB0000]">{toPersianDigits(e.absentDays)}</td>
                    <td className="py-2 px-3">{toPersianDigits(e.rate)}٪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !error && tab === 'violations' && violations ? (
        <div className="ent-card p-5 overflow-x-auto">
          <h3 className="ent-h3 mb-4">تخلفات — {monthTitle}</h3>
          {violations.violations.length === 0 ? (
            <p className="text-center ent-caption py-6">تخليفی ثبت نشده است</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right border-b border-[#E1E3E6]">
                  <th className="py-2 px-3 font-semibold">نام</th>
                  <th className="py-2 px-3 font-semibold">دپارتمان</th>
                  <th className="py-2 px-3 font-semibold">تعداد تأخیر</th>
                  <th className="py-2 px-3 font-semibold">تاریخ‌های تأخیر</th>
                  <th className="py-2 px-3 font-semibold">غیبت‌های بدون مرخصی</th>
                </tr>
              </thead>
              <tbody>
                {violations.violations.map((v) => (
                  <tr key={v.employeeId} className="border-b border-[#F0F1F3] hover:bg-[#F7F8FA]">
                    <td className="py-2 px-3">{v.name}</td>
                    <td className="py-2 px-3">{v.department}</td>
                    <td className="py-2 px-3 text-[#C17900]">{toPersianDigits(v.lateDays)}</td>
                    <td className="py-2 px-3 text-xs">{v.lateDates.map(toPersianDigits).join('، ')}</td>
                    <td className="py-2 px-3 text-xs text-[#BB0000]">{v.absences.map(toPersianDigits).join('، ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : !error && tab === 'overtime' && overtime ? (
        <div className="ent-card p-5 overflow-x-auto">
          <h3 className="ent-h3 mb-4">اضافه‌کاری — {monthTitle}</h3>
          {overtime.overtime.length === 0 ? (
            <p className="text-center ent-caption py-6">اضافه‌کاری‌ای ثبت نشده است</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right border-b border-[#E1E3E6]">
                  <th className="py-2 px-3 font-semibold">نام</th>
                  <th className="py-2 px-3 font-semibold">دپارتمان</th>
                  <th className="py-2 px-3 font-semibold">روزها</th>
                  <th className="py-2 px-3 font-semibold">ساعت اضافه‌کاری</th>
                </tr>
              </thead>
              <tbody>
                {overtime.overtime.map((o) => (
                  <tr key={o.employeeId} className="border-b border-[#F0F1F3] hover:bg-[#F7F8FA]">
                    <td className="py-2 px-3">{o.name}</td>
                    <td className="py-2 px-3">{o.department}</td>
                    <td className="py-2 px-3">{toPersianDigits(o.days)}</td>
                    <td className="py-2 px-3 text-[#107E3E]">{toPersianDigits(o.overtimeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : !error && tab === 'holidays' && holidays ? (
        <div className="ent-card p-5">
          <h3 className="ent-h3 mb-2">تعطیلات رسمی — {monthTitle}</h3>
          <p className="ent-caption mb-4">روزهای کاری این ماه: {toPersianDigits(holidays.workingDays)}</p>
          {holidays.holidays.length === 0 ? (
            <p className="text-center ent-caption py-6">این ماه تعطیل رسمی ندارد</p>
          ) : (
            <ul className="space-y-2">
              {holidays.holidays.map((h) => (
                <li key={h.date} className="flex items-center justify-between p-3 rounded bg-[#FFF8E6] border border-[#C17900]/30">
                  <span className="ent-body">{h.name}</span>
                  <span className="ent-caption">{toPersianDigits(h.date)}{h.type === 'friday' ? ' (جمعه)' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
