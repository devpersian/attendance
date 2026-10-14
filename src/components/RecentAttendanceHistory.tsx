import React, { useState, useEffect } from 'react';
import { AttendanceRecord } from '../types';
import { getRecords } from '../utils/storage';
import { toPersianDigits, formatJalaliDate, getTodayJalaliString } from '../utils/jalali';
import { History, LogIn, LogOut, Clock } from 'lucide-react';

interface RecentAttendanceHistoryProps {
  employeeId: string;
}

export default function RecentAttendanceHistory({ employeeId }: RecentAttendanceHistoryProps) {
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentRecords();
  }, [employeeId]);

  const loadRecentRecords = async () => {
    try {
      setLoading(true);
      const allRecords = await getRecords({ employeeId });
      
      // Sort by date descending and take last 7 days
      const sorted = allRecords
        .filter(r => r.employeeId === employeeId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7);
      
      setRecentRecords(sorted);
    } catch (error) {
      console.error('Error loading recent records:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-5 pt-5 border-t border-[#E5E5E5]">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-[#0A6ED1]" />
          <p className="ent-label">سوابق اخیر</p>
        </div>
        <p className="ent-caption">در حال بارگذاری...</p>
      </div>
    );
  }

  if (recentRecords.length === 0) {
    return (
      <div className="mt-5 pt-5 border-t border-[#E5E5E5]">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-[#0A6ED1]" />
          <p className="ent-label">سوابق اخیر</p>
        </div>
        <p className="ent-caption">هیچ سابقه‌ای یافت نشد</p>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-[#E5E5E5]">
      <div className="flex items-center gap-2 mb-3">
        <History size={16} className="text-[#0A6ED1]" />
        <p className="ent-label">سوابق 7 روز اخیر</p>
      </div>
      
      <div className="space-y-2">
        {recentRecords.map((record) => {
          const isToday = record.date === getTodayJalaliString();
          
          return (
            <div
              key={record.id}
              className={`flex items-center justify-between p-3 rounded border ${
                isToday 
                  ? 'bg-[#F0F6FF] border-[#0A6ED1]' 
                  : 'bg-[#F7F8FA] border-[#E5E5E5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="ent-body font-medium text-sm">
                    {formatJalaliDate(record.date)}
                    {isToday && <span className="ent-badge ent-badge-info text-xs mr-2">امروز</span>}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <LogIn size={14} className="text-[#107E3E]" />
                  <span className="ent-body text-sm font-mono" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                    {record.clockIn ? toPersianDigits(record.clockIn) : '--:--'}
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <LogOut size={14} className="text-[#E9730C]" />
                  <span className="ent-body text-sm font-mono" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                    {record.clockOut ? toPersianDigits(record.clockOut) : '--:--'}
                  </span>
                </div>
                
                {record.status === 'late' && (
                  <span className="ent-badge ent-badge-warning text-xs">
                    <Clock size={12} />
                    تأخیر
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
