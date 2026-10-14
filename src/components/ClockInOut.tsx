import React from 'react';
import { Employee, AttendanceRecord } from '../types';
import { getEmployees, addRecord, updateRecord, getRecordsByDateAndEmployee } from '../utils/storage';
import { getTodayJalaliString, getCurrentTime, toPersianDigits, getFullDateJalali } from '../utils/jalali';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import RecentAttendanceHistory from './RecentAttendanceHistory';
import SearchableDropdown from './SearchableDropdown';
import { Clock, LogIn, LogOut, User, Loader2, Calendar, MapPin, CheckCircle } from 'lucide-react';

export default function ClockInOut() {
  const toast = useToast();
  const { user } = useAuth();
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = React.useState<string>('');
  const [currentTime, setCurrentTime] = React.useState(getCurrentTime());
  const [todayRecords, setTodayRecords] = React.useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);

  // Check if user is admin/manager (can record for others)
  const canRecordForOthers = user?.role === 'admin' || user?.role === 'manager';

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getCurrentTime()), 1000);
    loadEmployees();
    return () => clearInterval(timer);
  }, []);

  // Auto-select current user's employee record if they are an employee
  React.useEffect(() => {
    if (!canRecordForOthers && user && employees.length > 0 && !selectedEmployee) {
      // Find employee linked to this user
      const myEmployee = employees.find(emp => emp.id === user.id || emp.personnelCode === user.username);
      if (myEmployee) {
        setSelectedEmployee(myEmployee.id);
      }
    }
  }, [user, employees, canRecordForOthers, selectedEmployee]);

  React.useEffect(() => {
    if (selectedEmployee) {
      loadTodayRecords();
    }
  }, [selectedEmployee]);

  const loadEmployees = async () => {
    try {
      const emps = await getEmployees();
      setEmployees(emps);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast.error('خطا در بارگذاری لیست کارکنان');
    } finally {
      setLoading(false);
    }
  };

  const loadTodayRecords = async () => {
    try {
      const records = await getRecordsByDateAndEmployee(getTodayJalaliString(), selectedEmployee);
      setTodayRecords(records);
    } catch (error) {
      console.error('Error loading today records:', error);
    }
  };

  const handleClockIn = async () => {
    if (!selectedEmployee) {
      toast.warning('لطفاً یک کارمند انتخاب کنید');
      return;
    }

    try {
      setProcessing(true);
      const today = getTodayJalaliString();
      const time = getCurrentTime();
      const isLate = isTimeLate(time);

      // Always create a new record for clock in (supports multiple entrance/exit)
      const record: AttendanceRecord = {
        id: Date.now().toString(),
        employeeId: selectedEmployee,
        date: today,
        clockIn: time,
        clockOut: null,
        status: isLate ? 'late' : 'present',
      };
      await addRecord(record);

      // Refresh all records for today
      await loadTodayRecords();
      
      if (isLate) {
        toast.warning('ساعت ورود ثبت شد (با تأخیر)', `ساعت: ${toPersianDigits(time)}`);
      } else {
        toast.success('ساعت ورود با موفقیت ثبت شد', `ساعت: ${toPersianDigits(time)}`);
      }
    } catch (error) {
      console.error('Error clocking in:', error);
      toast.error('خطا در ثبت ساعت ورود');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!selectedEmployee) {
      toast.warning('لطفاً یک کارمند انتخاب کنید');
      return;
    }

    try {
      setProcessing(true);
      const today = getTodayJalaliString();
      
      console.log('🔍 Looking for record without clockOut:', { today, selectedEmployee });
      
      // Get all records for today
      const records = await getRecordsByDateAndEmployee(today, selectedEmployee);
      console.log('📥 Found records:', records);

      if (records.length === 0) {
        console.error('❌ No records found for today');
        toast.error('ابتدا ساعت ورود را ثبت کنید');
        return;
      }

      // Find the most recent record without clockOut
      const recordWithoutClockOut = records
        .filter(r => r.clockIn && !r.clockOut)
        .sort((a, b) => b.clockIn!.localeCompare(a.clockIn!))[0];

      if (!recordWithoutClockOut) {
        toast.warning('همه ساعتهای ورود دارای ساعت خروج هستند. ابتدا ساعت ورود جدید ثبت کنید');
        return;
      }

      const time = getCurrentTime();
      console.log('✅ Updating record with clockOut:', { id: recordWithoutClockOut.id, time });
      await updateRecord(recordWithoutClockOut.id, { clockOut: time });
      
      // Refresh all records for today
      await loadTodayRecords();
      toast.success('ساعت خروج با موفقیت ثبت شد', `ساعت: ${toPersianDigits(time)}`);
    } catch (error) {
      console.error('❌ Error clocking out:', error);
      toast.error('خطا در ثبت ساعت خروج');
    } finally {
      setProcessing(false);
    }
  };

  const emp = employees.find(e => e.id === selectedEmployee);
  
  // Debug logging
  React.useEffect(() => {
    console.log('🔍 ClockInOut - selectedEmployee:', selectedEmployee);
    console.log('🔍 ClockInOut - employees count:', employees.length);
    console.log('🔍 ClockInOut - found emp:', emp);
    if (employees.length > 0) {
      console.log('🔍 ClockInOut - first employee:', employees[0]);
    }
  }, [selectedEmployee, employees]);

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
      {/* Object Page Header */}
      <div className="ent-object-header animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={16} className="text-[#5A5E63]" />
          <p className="ent-caption">{getFullDateJalali()}</p>
        </div>
        <h2 className="ent-object-title">ثبت حضور و غیاب</h2>
        <p className="ent-object-subtitle">ثبت ساعت ورود و خروج کارکنان</p>
      </div>

      {/* Time Display */}
      <div className="ent-card p-8 text-center animate-fade-in stagger-1">
        <p className="ent-label mb-3">ساعت فعلی</p>
        <p className="ent-kpi-accent mb-3" dir="ltr" style={{ fontFamily: 'Vazir' }}>
          {toPersianDigits(currentTime)}
        </p>
        <p className="ent-body">{getFullDateJalali()}</p>
      </div>

      {/* Employee Selection - Only for admin/manager */}
      {canRecordForOthers && (
        <div className="ent-card p-5 animate-fade-in stagger-2">
          <SearchableDropdown
            label={
              <div className="flex items-center gap-2">
                <User size={16} className="text-[#0A6ED1]" />
                <span>انتخاب کارمند</span>
              </div>
            }
            options={employees.map(emp => ({
              value: emp.id,
              label: emp.name || 'نامشخص',
              sublabel: `${emp.personnelCode || '---'} | ${emp.department || 'نامشخص'}`
            }))}
            value={selectedEmployee}
            onChange={(value) => {
              console.log('🔵 ClockInOut: onChange called with value:', value);
              console.log('🔵 ClockInOut: calling setSelectedEmployee...');
              setSelectedEmployee(value);
              console.log('🔵 ClockInOut: setSelectedEmployee called');
            }}
            placeholder="-- کارمند مورد نظر را انتخاب کنید --"
          />
        </div>
      )}

      {/* Selected Employee Info */}
      {emp && (
        <div className="ent-card p-5 animate-fade-in stagger-3">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 bg-[#0A6ED1] rounded flex items-center justify-center text-white text-xl font-semibold">
              {emp.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="ent-h2">{emp.name}</h3>
              <p className="ent-body mt-1">{emp.position} | {emp.department}</p>
              <p className="ent-caption mt-1">کد پرسنلی: {toPersianDigits(emp.personnelCode)}</p>
            </div>
          </div>

          {/* Today's Records - Multiple entrance/exit support */}
          <div className="mb-5">
            <p className="ent-label mb-3">سوابق امروز ({toPersianDigits(todayRecords.length)} رکورد)</p>
            {todayRecords.length === 0 ? (
              <div className="ent-card p-4 text-center">
                <p className="ent-caption">هنوز رکوردی برای امروز ثبت نشده است</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayRecords.map((record, index) => (
                  <div key={record.id} className="ent-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold ${
                          record.status === 'late' ? 'bg-[#E9730C]' : 'bg-[#107E3E]'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <LogIn size={16} className="text-[#107E3E]" />
                            <span className="ent-body font-medium" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                              {record.clockIn ? toPersianDigits(record.clockIn) : '--:--'}
                            </span>
                            {record.status === 'late' && (
                              <span className="ent-badge ent-badge-warning text-xs">تأخیر</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <LogOut size={16} className="text-[#E9730C]" />
                            <span className="ent-body font-medium" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                              {record.clockOut ? toPersianDigits(record.clockOut) : 'ثبت نشده'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Attendance History */}
          <RecentAttendanceHistory employeeId={selectedEmployee} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in stagger-4">
        <button
          onClick={handleClockIn}
          disabled={!selectedEmployee || processing}
          className="ent-btn-success py-5 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <>
              <LogIn size={24} />
              <span>ثبت ورود</span>
            </>
          )}
        </button>
        <button
          onClick={handleClockOut}
          disabled={!selectedEmployee || processing}
          className="ent-btn-danger py-5 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <>
              <LogOut size={24} />
              <span>ثبت خروج</span>
            </>
          )}
        </button>
      </div>

      {/* Working Hours Info */}
      <div className="ent-card p-5 animate-fade-in stagger-5">
        <div className="flex items-start gap-4">
          <div className="ent-icon ent-icon-warning flex-shrink-0">
            <MapPin size={20} />
          </div>
          <div className="flex-1">
            <p className="ent-h3 mb-3">قوانین ساعت کاری:</p>
            <ul className="space-y-2 ent-body">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-[#107E3E] flex-shrink-0" />
                <span>ساعت شروع کار: ۸:۰۰ صبح</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-[#107E3E] flex-shrink-0" />
                <span>ساعت پایان کار: ۱۷:۰۰ عصر</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-[#107E3E] flex-shrink-0" />
                <span>ورود بعد از ۸:۱۵ به عنوان تأخیر ثبت می‌شود</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function isTimeLate(time: string): boolean {
  const [hours, minutes] = time.split(':').map(Number);
  return hours > 8 || (hours === 8 && minutes > 15);
}
