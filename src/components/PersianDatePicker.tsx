import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import { toPersianDigits, getTodayJalali, getMonthName, getDaysInJalaliMonth, getFirstDayOfMonth } from '../utils/jalali';

interface PersianDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
}

export default function PersianDatePicker({ 
  value, 
  onChange, 
  placeholder = '1403/01/15',
  label,
  error
}: PersianDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split('/').map(Number);
      return { jy: parts[0], jm: parts[1] };
    }
    const today = getTodayJalali();
    return { jy: today.jy, jm: today.jm };
  });

  const handleDateSelect = (day: number) => {
    const dateStr = `${viewDate.jy}/${String(viewDate.jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    let newMonth = viewDate.jm - 1;
    let newYear = viewDate.jy;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setViewDate({ jy: newYear, jm: newMonth });
  };

  const handleNextMonth = () => {
    let newMonth = viewDate.jm + 1;
    let newYear = viewDate.jy;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setViewDate({ jy: newYear, jm: newMonth });
  };

  const handleToday = () => {
    const today = getTodayJalali();
    setViewDate({ jy: today.jy, jm: today.jm });
    const dateStr = `${today.jy}/${String(today.jm).padStart(2, '0')}/${String(today.jd).padStart(2, '0')}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const daysInMonth = getDaysInJalaliMonth(viewDate.jy, viewDate.jm);
  const firstDay = getFirstDayOfMonth(viewDate.jy, viewDate.jm);

  const selectedParts = value ? value.split('/').map(Number) : null;
  const isSelected = (day: number) => {
    if (!selectedParts) return false;
    return selectedParts[0] === viewDate.jy && 
           selectedParts[1] === viewDate.jm && 
           selectedParts[2] === day;
  };

  const today = getTodayJalali();
  const isToday = (day: number) => {
    return today.jy === viewDate.jy && 
           today.jm === viewDate.jm && 
           today.jd === day;
  };

  return (
    <div className="relative">
      {label && (
        <label className="ent-form-label block mb-2">
          {label}
        </label>
      )}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`ent-input cursor-pointer flex items-center justify-between ${error ? 'border-[#BB0000]' : ''}`}
      >
        <span className={value ? 'ent-body' : 'text-[#8A8E93]'} style={{ fontFamily: 'Vazir' }}>
          {value ? toPersianDigits(value) : placeholder}
        </span>
        <Calendar size={16} className="text-[#8A8E93]" />
      </div>
      {error && (
        <p className="text-[#BB0000] text-xs mt-1">{error}</p>
      )}

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 z-50 ent-card p-4 w-80 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
            >
              <ChevronRight size={18} className="text-[#5A5E63]" />
            </button>
            <div className="text-center">
              <p className="ent-body font-semibold">
                {getMonthName(viewDate.jm)} {toPersianDigits(viewDate.jy)}
              </p>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
            >
              <ChevronLeft size={18} className="text-[#5A5E63]" />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((day, i) => (
              <div key={i} className="text-center text-xs font-semibold text-[#5A5E63] py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const todayMark = isToday(day);
              
              return (
                <button
                  key={day}
                  onClick={() => handleDateSelect(day)}
                  className={`
                    aspect-square rounded flex items-center justify-center text-sm font-medium transition-all
                    ${selected 
                      ? 'bg-[#0A6ED1] text-white' 
                      : todayMark
                        ? 'bg-[#F0F6FF] text-[#0A6ED1] border border-[#0A6ED1]'
                        : 'hover:bg-[#F7F8FA] text-[#32363A]'
                    }
                  `}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>

          {/* Today Button */}
          <button
            onClick={handleToday}
            className="w-full mt-4 ent-btn-secondary text-sm"
          >
            امروز
          </button>
        </div>
      )}
    </div>
  );
}
