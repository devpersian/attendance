import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PageView } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ClockInOut from './components/ClockInOut';
import History from './components/History';
import Employees from './components/Employees';
import Leaves from './components/Leaves';
import Reports from './components/Reports';
import Devices from './components/Devices';
import Enrollments from './components/Enrollments';
import AdminPanel from './components/AdminPanel';
import CompanyInfo from './components/CompanyInfo';
import UserManagement from './components/UserManagement';
import RoleManagement from './components/RoleManagement';
import AuditLog from './components/AuditLog';
import DeviceMonitor from './components/DeviceMonitor';
import UnitManagement from './components/UnitManagement';
import ShiftsManagement from './components/ShiftsManagement';
import ShiftPatternsManagement from './components/ShiftPatternsManagement';
import WorkingHoursRulesManagement from './components/WorkingHoursRulesManagement';
import EmployeeShiftsManagement from './components/EmployeeShiftsManagement';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function MainLayout() {
  const [currentPage, setCurrentPage] = React.useState<PageView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { user, logout } = useAuth();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'clock': return <ClockInOut />;
      case 'history': return <History />;
      case 'employees': return <Employees />;
      case 'devices': return <Devices />;
      case 'device-monitor': return <DeviceMonitor />;
      case 'enrollments': return <Enrollments />;
      case 'leaves': return <Leaves />;
      case 'reports': return <Reports />;
      case 'company': return <CompanyInfo />;
      case 'users': return <UserManagement />;
      case 'roles': return <RoleManagement />;
      case 'audit-log': return <AuditLog />;
      case 'units': return <UnitManagement />;
      case 'shifts': return <ShiftsManagement />;
      case 'shift-patterns': return <ShiftPatternsManagement />;
      case 'working-hours': return <WorkingHoursRulesManagement />;
      case 'employee-shifts': return <EmployeeShiftsManagement />;
      case 'admin': return <AdminPanel />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]" dir="rtl">
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <main className="flex-1 lg:mr-0 min-h-screen">
        {/* Top Bar */}
        <div className="bg-white border-b border-[#E5E5E5] px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h2 className="ent-h3">
              {currentPage === 'dashboard' && 'داشبورد'}
              {currentPage === 'clock' && 'ثبت حضور'}
              {currentPage === 'history' && 'سوابق'}
              {currentPage === 'employees' && 'کارکنان'}
              {currentPage === 'devices' && 'دستگاه‌ها'}
              {currentPage === 'device-monitor' && 'پایش دستگاه‌ها'}
              {currentPage === 'enrollments' && 'ثبت شناسایی کاربران'}
              {currentPage === 'leaves' && 'مرخصی‌ها'}
              {currentPage === 'reports' && 'گزارشات'}
              {currentPage === 'company' && 'اطلاعات شرکت'}
              {currentPage === 'users' && 'مدیریت کاربران'}
              {currentPage === 'roles' && 'مدیریت نقش‌ها'}
              {currentPage === 'audit-log' && 'گزارش ممیزی امنیتی'}
              {currentPage === 'units' && 'مدیریت واحدها'}
              {currentPage === 'admin' && 'پنل مدیریت'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <p className="ent-body font-semibold">{user?.username}</p>
              <p className="ent-caption">
                {user?.role === 'admin' && 'مدیر سیستم'}
                {user?.role === 'manager' && 'مدیر'}
                {user?.role === 'employee' && 'کارمند'}
              </p>
            </div>
            <button
              onClick={logout}
              className="ent-btn-secondary text-sm px-4 py-2"
            >
              خروج
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <div key={currentPage} className="animate-fade-in">
            {renderPage()}
          </div>
        </div>
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route 
        path="/*" 
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
