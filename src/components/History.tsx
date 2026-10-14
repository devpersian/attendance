import React from 'react';
import { Employee, AttendanceRecord } from '../types';
import { getEmployees, getRecords } from '../utils/storage';
import { getTodayJalaliString, toPersianDigits, formatJalaliDate, getTodayJalali, getMonthName, getDaysInJalaliMonth, getFirstDayOfMonth } from '../utils/jalali';
import SearchableDropdown from './SearchableDropdown';
import { Calendar, Filter, Loader2 } from 'lucide-react';

export default function History() {
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [selectedEmployee, setSelectedEmployee] = React.useState<string>('all');
  const [selectedMonth, setSelectedMonth] = React.useState(() => {
    const today = getTodayJalali();
    return `${today.jy}/${String(today.jm).padStart(2, '0')}`;
  });
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [emps, recs] = await Promise.all([getEmployees(), getRecords()]);
      setEmployees(emps);
      setRecords(recs);
    } catch (error) {
      console.error('Error loading ', error);
    } finally {
      setLoading(false);
    }
  };

  const [jy, jm] = selectedMonth.split('/').map(Number);
  const daysInMonth = getDaysInJalaliMonth(jy, jm);
  const firstDay = getFirstDayOfMonth(jy, jm);

  const filteredRecords = records.filter(r => {
    if (!r.date) return false;
    const matchesEmployee = selectedEmployee === 'all' || r.employeeId === selectedEmployee;
    const matchesMonth = r.date.startsWith(selectedMonth);
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchesEmployee && matchesMonth && matchesStatus;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const monthRecords = records.filter(r => r.date && r.date.startsWith(selectedMonth));
  const presentDays = monthRecords.filter(r => r.status === 'present').length;
  const lateDays = monthRecords.filter(r => r.status === 'late').length;
  const absentDays = monthRecords.filter(r => r.status === 'absent').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="ent-card p-8 text-center">
          <Loader2 size={40} className="animate-spin text-[#0A6ED1] mx-auto mb-3" />
          <p className="ent-body">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="ent-h1 mb-1">سوابق حضور و غیاب</h2>
        <p className="ent-body">مشاهده و مدیریت سوابق حضور کارکنان</p>
      </div>

      {/* Filters */}
      <div className="ent-card p-5 animate-fade-in stagger-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="ent-icon">
            <Filter size={18} />
          </div>
          <h3 className="ent-h3">فیلتر</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ent-form-group">
            <SearchableDropdown
              label="کارمند"
              options={[
                { value: 'all', label: 'همه کارکنان' },
                ...employees.map(emp => ({
                  value: emp.id,
                  label: emp.name || 'نامشخص',
                  sublabel: emp.personnelCode || '---'
                }))
              ]}
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              placeholder="انتخاب کارمند"
            />
          </div>
          <div className="ent-form-group">
            <label className="ent-form-label">ماه</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="ent-input"
            >
              {generateMonthOptions()}
            </select>
          </div>
          <div className="ent-form-group">
            <label className="ent-form-label">وضعیت</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="ent-input"
            >
              <option value="all">همه</option>
              <option value="present">حاضر</option>
              <option value="late">تأخیر</option>
              <option value="absent">غایب</option>
              <option value="leave">مرخصی</option>
            </select>
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="ent-tile animate-fade-in stagger-2">
          <p className="ent-kpi-accent mb-2">{toPersianDigits(presentDays)}</p>
          <p className="ent-label">روز حاضر</p>
        </div>
        <div className="ent-tile animate-fade-in stagger-3">
          <p className="ent-kpi mb-2" style={{ color: '#C17900' }}>{toPersianDigits(lateDays)}</p>
          <p className="ent-label">روز تأخیر</p>
        </div>
        <div className="ent-tile animate-fade-in stagger-4">
          <p className="ent-kpi mb-2" style={{ color: '#BB0000' }}>{toPersianDigits(absentDays)}</p>
          <p className="ent-label">روز غایب</p>
        </div>
      </div>

      {/* Calendar View */}
      <div className="ent-card p-5 animate-fade-in stagger-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="ent-icon">
            <Calendar size={18} />
          </div>
          <h3 className="ent-h3">
            تقویم {getMonthName(jm)} {toPersianDigits(jy)}
          </h3>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((day, i) => (
            <div key={i} className="text-center text-xs font-semibold text-[#5A5E63] py-2">{day}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${jy}/${String(jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
            const dayRecords = filteredRecords.filter(r => r.date === dateStr);
            const hasRecord = dayRecords.length > 0;
            const status = dayRecords[0]?.status;

            return (
              <div
                key={day}
                className={`aspect-square rounded flex items-center justify-center text-sm font-medium transition-all
                  ${hasRecord ? (
                    status === 'present' ? 'bg-[#F1F8F4] text-[#107E3E] border border-[#107E3E]' :
                    status === 'late' ? 'bg-[#FFF8E6] text-[#C17900] border border-[#C17900]' :
                    status === 'leave' ? 'bg-[#F0F6FF] text-[#0A6ED1] border border-[#0A6ED1]' :
                    'bg-[#FFF5F5] text-[#BB0000] border border-[#BB0000]'
                  ) : 'bg-[#F7F8FA] text-[#5A5E63] border border-[#E5E5E5]'}
                  ${dateStr === getTodayJalaliString() ? 'ring-2 ring-[#0A6ED1] ring-offset-1' : ''}
                `}
              >
                {toPersianDigits(day)}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-5 text-xs">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#F1F8F4] border border-[#107E3E]" />
            <span className="ent-caption">حاضر</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#FFF8E6] border border-[#C17900]" />
            <span className="ent-caption">تأخیر</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#FFF5F5] border border-[#BB0000]" />
            <span className="ent-caption">غایب</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#F0F6FF] border border-[#0A6ED1]" />
            <span className="ent-caption">مرخصی</span>
          </span>
        </div>
      </div>

      {/* Records Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-6">
        <div className="p-5 border-b border-[#E5E5E5]">
          <h3 className="ent-h3">جزئیات سوابق</h3>
          <p className="ent-caption mt-1">{toPersianDigits(filteredRecords.length)} رکورد یافت شد</p>
        </div>
        <table className="ent-table">
          <thead>
            <tr>
              <th>کارمند</th>
              <th>تاریخ</th>
              <th>ورود</th>
              <th>خروج</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map(record => {
              const emp = employees.find(e => e.id === record.employeeId);
              return (
                <tr key={record.id}>
                  <td className="font-medium">{emp?.name || 'نامشخص'}</td>
                  <td>{formatJalaliDate(record.date)}</td>
                  <td className="font-mono" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                    {record.clockIn ? toPersianDigits(record.clockIn) : '--:--'}
                  </td>
                  <td className="font-mono" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                    {record.clockOut ? toPersianDigits(record.clockOut) : '--:--'}
                  </td>
                  <td>
                    <span className={`ent-badge ${
                      record.status === 'present' ? 'ent-badge-success' :
                      record.status === 'late' ? 'ent-badge-warning' :
                      record.status === 'leave' ? 'ent-badge-info' :
                      'ent-badge-danger'
                    }`}>
                      {record.status === 'present' ? 'حاضر' : record.status === 'late' ? 'تأخیر' : record.status === 'leave' ? 'مرخصی' : 'غایب'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 ent-caption">
                  رکوردی یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function generateMonthOptions(): React.ReactElement[] {
  const today = getTodayJalali();
  const options: React.ReactElement[] = [];
  
  for (let i = 0; i < 12; i++) {
    let m = today.jm - i;
    let y = today.jy;
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
    const value = `${y}/${String(m).padStart(2, '0')}`;
    options.push(
      <option key={value} value={value}>
        {getMonthName(m)} {toPersianDigits(y)}
      </option>
    );
  }
  return options;
}
