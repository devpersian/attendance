import React from 'react';
import { PageView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useHasPermission } from '../utils/useHasPermission';
import { ScrollText } from 'lucide-react';
import {
  LayoutDashboard,
  Clock,
  History,
  Users,
  BarChart3,
  CalendarOff,
  Menu,
  X,
  Cpu,
  Settings,
  Fingerprint,
  Building2,
  Shield,
  Calendar,
  Activity
} from 'lucide-react';
import { toPersianDigits, getFullDateJalali } from '../utils/jalali';

interface SidebarProps {
  currentPage: PageView;
  onPageChange: (page: PageView) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems: { id: PageView; label: string; icon: React.ReactNode; section?: string }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: <LayoutDashboard size={18} />, section: 'overview' },
  { id: 'clock', label: 'ثبت حضور', icon: <Clock size={18} />, section: 'overview' },
  { id: 'history', label: 'سوابق', icon: <History size={18} />, section: 'data' },
  { id: 'employees', label: 'کارکنان', icon: <Users size={18} />, section: 'data' },
  { id: 'leaves', label: 'مرخصی‌ها', icon: <CalendarOff size={18} />, section: 'data' },
  { id: 'devices', label: 'دستگاه‌ها', icon: <Cpu size={18} />, section: 'system' },
  { id: 'device-monitor', label: 'پایش دستگاه‌ها', icon: <Activity size={18} />, section: 'system' },
  { id: 'enrollments', label: 'ثبت شناسایی', icon: <Fingerprint size={18} />, section: 'system' },
  { id: 'reports', label: 'گزارشات', icon: <BarChart3 size={18} />, section: 'system' },
  { id: 'company', label: 'اطلاعات شرکت', icon: <Building2 size={18} />, section: 'settings' },
  { id: 'users', label: 'مدیریت کاربران', icon: <Shield size={18} />, section: 'settings' },
  { id: 'roles', label: 'مدیریت نقش‌ها', icon: <Shield size={18} />, section: 'settings' },
  { id: 'units', label: 'مدیریت واحدها', icon: <Building2 size={18} />, section: 'settings' },
  { id: 'shifts', label: 'مدیریت شیفت‌ها', icon: <Clock size={18} />, section: 'settings' },
  { id: 'shift-patterns', label: 'الگوهای شیفت چرخشی', icon: <Clock size={18} />, section: 'settings' },
  { id: 'working-hours', label: 'قوانین ساعات کاری', icon: <Calendar size={18} />, section: 'settings' },
  { id: 'employee-shifts', label: 'تخصیص شیفت', icon: <Users size={18} />, section: 'settings' },
  { id: 'admin', label: 'پنل مدیریت', icon: <Settings size={18} />, section: 'settings' },
  { id: 'audit-log', label: 'گزارش ممیزی امنیتی', icon: <ScrollText size={18} />, section: 'settings' },
];

// Phase 0 cleanup / P0.4 follow-up: sidebar entries for admin areas are gated
// client-side by the user's role ('admin') or the corresponding module
// permission. The server enforces these independently — this only hides links
// the user cannot open anyway.
const ADMIN_ONLY_VIEWS: PageView[] = ['users', 'roles', 'units', 'audit-log', 'admin'];

// Phase 2 / P2.7: the live monitor is a device-ops surface — visible to admins
// or holders of devices.manage / devices.realtime (server enforces independently).

export default function Sidebar({ currentPage, onPageChange, isOpen, onToggle }: SidebarProps) {
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageDevices = useHasPermission('devices.manage');
  const canWatchDevices = useHasPermission('devices.realtime');
  const isVisible = (id: PageView) => {
    if (ADMIN_ONLY_VIEWS.includes(id)) return isAdmin;
    if (id === 'device-monitor') return isAdmin || canManageDevices === true || canWatchDevices === true;
    return true;
  };

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden" 
          onClick={onToggle} 
        />
      )}

      <button
        onClick={onToggle}
        className="fixed top-4 right-4 z-50 lg:hidden ent-card p-2"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`ent-nav z-50 transform transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Logo */}
        <div className="p-5 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="ent-icon">
              <Fingerprint size={20} />
            </div>
            <div>
              <h1 className="ent-h3">حضور و غیاب</h1>
              <p className="ent-caption">نسخه ۴.۰</p>
            </div>
          </div>
        </div>

        {/* Time */}
        <div className="px-5 py-4 border-b border-[#E5E5E5]">
          <p className="ent-caption mb-1">{getFullDateJalali()}</p>
          <p className="ent-kpi" dir="ltr" style={{ fontFamily: 'Vazir' }}>
            {toPersianDigits(hours)}:{toPersianDigits(minutes)}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {['overview', 'data', 'system', 'settings'].map((section) => {
            const sectionItems = menuItems.filter(item => item.section === section && isVisible(item.id));
            const sectionLabel = section === 'overview' ? 'نمای کلی' : section === 'data' ? 'داده‌ها' : section === 'system' ? 'سیستم' : 'تنظیمات';
            
            if (sectionItems.length === 0) return null;

            return (
              <div key={section} className="mb-4">
                <p className="ent-label px-5 mb-2 text-xs uppercase tracking-wider">
                  {sectionLabel}
                </p>
                <div>
                  {sectionItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { 
                        onPageChange(item.id); 
                        if (window.innerWidth < 1024) onToggle(); 
                      }}
                      className={`ent-nav-item ${currentPage === item.id ? 'active' : ''}`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E5E5]">
          <p className="ent-caption text-center">
            سیستم مدیریت حضور و غیاب
          </p>
        </div>
      </aside>
    </>
  );
}
