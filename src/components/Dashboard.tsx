import React from 'react';
import { Employee, AttendanceRecord } from '../types';
import { getEmployees, getRecords } from '../utils/storage';
import { getTodayJalaliString, toPersianDigits, formatJalaliDate, gregorianToJalali } from '../utils/jalali';
import { useRealtimeStream, RealtimeEvent } from '../utils/realtime';
import { useHasPermission } from '../utils/useHasPermission';
import { Users, UserCheck, UserX, Clock, TrendingUp, AlertTriangle, Activity, Loader2, Radio } from 'lucide-react';

export default function Dashboard() {
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastPunch, setLastPunch] = React.useState<RealtimeEvent | null>(null);
  const today = getTodayJalaliString();

  React.useEffect(() => {
    loadData();
  }, []);

  // Live punch feed (SSE): refresh data when new punches arrive.
  // Gated by the `devices.realtime` permission — the server rejects the
  // stream with 403 without it, so we don't even open the EventSource.
  const canViewLive = useHasPermission('devices.realtime') ?? false;
  const { connected: liveConnected } = useRealtimeStream({
    enabled: canViewLive,
    onEvent: React.useCallback((event: RealtimeEvent) => {
      if (event.type === 'punch' || event.type === 'device-event') {
        setLastPunch(event);
        loadData();
      }
    }, []),
  });

  const loadData = async () => {
    try {
      const [emps, recs] = await Promise.all([getEmployees(), getRecords()]);
      setEmployees(emps);
      setRecords(recs);
    } catch (error) {
      console.error('Error loading dashboard ', error);
    } finally {
      setLoading(false);
    }
  };

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

  const todayRecords = records.filter(r => r.date === today);
  const presentCount = todayRecords.filter(r => r.status === 'present' || r.status === 'late').length;
  const absentCount = employees.length - presentCount;
  const lateCount = todayRecords.filter(r => r.status === 'late').length;

  const weekRecords = records.filter(r => r.date >= getWeekAgoDate());
  const avgPresence = weekRecords.length > 0 
    ? Math.round((weekRecords.filter(r => r.status === 'present' || r.status === 'late').length / Math.max(weekRecords.length, 1)) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-in flex items-start justify-between">
        <div>
          <h2 className="ent-h1 mb-1">داشبورد</h2>
          <p className="ent-body">خلاصه وضعیت حضور و غیاب امروز</p>
        </div>
        {/* Live feed indicator (SSE) — requires the devices.realtime permission */}
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs border ${
            liveConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-gray-50 text-gray-500 border-gray-200'
          }`}
          title={
            liveConnected
              ? 'اتصال زنده به دستگاه‌ها برقرار است'
              : canViewLive
                ? 'قطع اتصال زنده'
                : 'برای مشاهده فید زنده، دسترسی «مشاهده زنده تردد دستگاه‌ها» لازم است'
          }
        >
          <Radio size={14} className={liveConnected ? 'animate-pulse' : ''} />
          <span>{liveConnected ? 'پخش زنده' : canViewLive ? 'آفلاین' : 'بدون دسترسی زنده'}</span>
        </div>
      </div>

      {lastPunch && (
        <div className="ent-card p-3 animate-fade-in flex items-center gap-2 text-sm text-gray-700 border-r-4 border-r-[#0A6ED1]">
          <Activity size={16} className="text-[#0A6ED1]" />
          <span>
            آخرین رویداد: کاربر {toPersianDigits(Number(lastPunch.deviceUserId) || 0)} —{' '}
            {formatJalaliDate(getTodayJalaliString())} {lastPunch.timestamp ? new Date(lastPunch.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ent-tile animate-fade-in stagger-1">
          <div className="flex items-center justify-between mb-3">
            <div className="ent-icon">
              <Users size={20} />
            </div>
          </div>
          <p className="ent-kpi">{toPersianDigits(employees.length)}</p>
          <p className="ent-label mt-2">کل کارکنان</p>
        </div>

        <div className="ent-tile animate-fade-in stagger-2">
          <div className="flex items-center justify-between mb-3">
            <div className="ent-icon ent-icon-success">
              <UserCheck size={20} />
            </div>
          </div>
          <p className="ent-kpi">{toPersianDigits(presentCount)}</p>
          <p className="ent-label mt-2">حاضر امروز</p>
        </div>

        <div className="ent-tile animate-fade-in stagger-3">
          <div className="flex items-center justify-between mb-3">
            <div className="ent-icon ent-icon-danger">
              <UserX size={20} />
            </div>
          </div>
          <p className="ent-kpi">{toPersianDigits(absentCount)}</p>
          <p className="ent-label mt-2">غایب امروز</p>
        </div>

        <div className="ent-tile animate-fade-in stagger-4">
          <div className="flex items-center justify-between mb-3">
            <div className="ent-icon ent-icon-warning">
              <Clock size={20} />
            </div>
          </div>
          <p className="ent-kpi">{toPersianDigits(lateCount)}</p>
          <p className="ent-label mt-2">تأخیر امروز</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Attendance */}
        <div className="lg:col-span-2 ent-card p-5 animate-fade-in stagger-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="ent-h2 mb-1">وضعیت امروز</h3>
              <p className="ent-caption">{formatJalaliDate(today)}</p>
            </div>
            <div className="text-left">
              <p className="ent-kpi-accent">{toPersianDigits(employees.length > 0 ? Math.round((presentCount / employees.length) * 100) : 0)}٪</p>
              <p className="ent-caption">نرخ حضور</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-5">
            <div className="ent-progress">
              <div 
                className="ent-progress-fill"
                style={{ width: `${employees.length > 0 ? (presentCount / employees.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Employee List */}
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {employees.map((emp) => {
              const record = todayRecords.find(r => r.employeeId === emp.id);
              const status = record?.status || 'absent';
              const empName = emp.name || 'نامشخص';
              const empDept = emp.department || 'نامشخص';
              
              return (
                <div 
                  key={emp.id} 
                  className="flex items-center justify-between p-3 rounded hover:bg-[#F7F8FA] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded flex items-center justify-center text-white text-sm font-semibold ${
                      status === 'present' ? 'bg-[#107E3E]' : 
                      status === 'late' ? 'bg-[#C17900]' : 
                      'bg-[#8A8E93]'
                    }`}>
                      {empName.charAt(0)}
                    </div>
                    <div>
                      <p className="ent-body font-medium">{empName}</p>
                      <p className="ent-caption">{empDept}</p>
                    </div>
                  </div>
                  <span className={`ent-badge ${
                    status === 'present' ? 'ent-badge-success' :
                    status === 'late' ? 'ent-badge-warning' :
                    status === 'leave' ? 'ent-badge-info' :
                    'ent-badge-danger'
                  }`}>
                    {status === 'present' ? 'حاضر' : status === 'late' ? 'تأخیر' : status === 'leave' ? 'مرخصی' : 'غایب'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="ent-card p-5 animate-fade-in stagger-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="ent-icon">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="ent-h3">خلاصه هفتگی</h3>
              <p className="ent-caption">میانگین حضور</p>
            </div>
          </div>

          <div className="flex items-center justify-center py-6">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E5E5" strokeWidth="6" />
                <circle 
                  cx="50" cy="50" r="40" fill="none" 
                  stroke="#0A6ED1" strokeWidth="6"
                  strokeDasharray={`${avgPresence * 2.51} 251`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="ent-kpi-accent">{toPersianDigits(avgPresence)}٪</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="space-y-2 mt-5">
            <p className="ent-label text-xs uppercase tracking-wider mb-2">آخرین فعالیت‌ها</p>
            {records.slice(-5).reverse().map((record) => {
              const rec = record as any;
              const emp = employees.find(e => e.id === record.employeeId);
              const recordStatus = rec.status || rec.Status || 'absent';
              const recordClockIn = rec.clockIn || rec.ClockIn;
              
              return (
                <div key={record.id} className="flex items-center gap-2 text-xs p-2 rounded hover:bg-[#F7F8FA] transition-colors">
                  <div className={`w-2 h-2 rounded-full ${
                    recordStatus === 'present' ? 'bg-[#107E3E]' :
                    recordStatus === 'late' ? 'bg-[#C17900]' : 'bg-[#BB0000]'
                  }`} />
                  <span className="ent-body font-medium flex-1 truncate">{emp?.name || 'نامشخص'}</span>
                  <span className="ent-caption" style={{ fontFamily: 'Vazir' }}>
                    {recordClockIn ? toPersianDigits(recordClockIn) : '--:--'}
                  </span>
                </div>
              );
            })}
            {records.length === 0 && (
              <div className="text-center py-6">
                <AlertTriangle size={40} className="mx-auto mb-2 text-[#8A8E93]" />
                <p className="ent-caption">هنوز رکوردی ثبت نشده است</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getWeekAgoDate(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const j = gregorianToJalali(weekAgo.getFullYear(), weekAgo.getMonth() + 1, weekAgo.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}
