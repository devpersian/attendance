import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Server, 
  Users, 
  Cpu, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Activity,
  RefreshCw,
  Trash2,
  Filter,
  Download,
  Eye
} from 'lucide-react';
import { adminAPI } from '../utils/api';
import { useToast } from './Toast';
import { toPersianDigits } from '../utils/jalali';

interface DashboardData {
  stats: {
    TotalEmployees: number;
    TodayAttendance: number;
    PendingLeaves: number;
    ActiveDevices: number;
    Errors24h: number;
  };
  recentLogs: SystemLog[];
  systemInfo?: {
    DatabaseName: string;
    SQLVersion: string;
    TotalRecords: number;
    TotalLogs: number;
    LastLogTime: string;
  };
}

interface SystemLog {
  Id: string;
  Level: 'info' | 'success' | 'warning' | 'error';
  Action: string;
  Entity: string;
  EntityId?: string;
  Message: string;
  Metadata?: string;
  UserId?: string;
  CreatedAt: string;
}

interface LogStats {
  TotalLogs: number;
  ErrorCount: number;
  WarningCount: number;
  SuccessCount: number;
  InfoCount: number;
}

export default function AdminPanel() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    level: '',
    entity: '',
    limit: 100
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
      loadLogStats();
    } else if (activeTab === 'system') {
      loadSystemInfo();
    }
  }, [activeTab, filters]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getDashboard();
      setDashboard(data);
    } catch (error) {
      toast.error('خطا در بارگذاری داشبورد');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getLogs(filters);
      setLogs(data);
    } catch (error) {
      toast.error('خطا در بارگذاری لاگ‌ها');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemInfo = async () => {
    try {
      setLoading(true);
      const systemInfo = await adminAPI.getSystemInfo();
      setDashboard(prev => prev ? { ...prev, systemInfo } : { stats: {} as any, recentLogs: [], systemInfo });
    } catch (error) {
      toast.error('خطا در بارگذاری اطلاعات سیستم');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadLogStats = async () => {
    try {
      const data = await adminAPI.getLogStats();
      setLogStats(data);
    } catch (error) {
      console.error(error);
    }
  };

  const clearOldLogs = async () => {
    if (!confirm('آیا از حذف لاگ‌های قدیمی (بیش از 30 روز) مطمئن هستید؟')) return;
    
    try {
      await adminAPI.clearLogs();
      toast.success('لاگ‌های قدیمی حذف شدند');
      loadLogs();
      loadLogStats();
    } catch (error) {
      toast.error('خطا در حذف لاگ‌ها');
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'success': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'info': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle className="w-4 h-4" />;
      case 'warning': return <AlertCircle className="w-4 h-4" />;
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'info': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">پنل مدیریت</h1>
              <p className="text-sm text-slate-500 mt-1">نظارت و کنترل سیستم</p>
            </div>
            <button
              onClick={loadDashboard}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              بروزرسانی
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5" />
                <span>داشبورد</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <span>لاگ‌های سیستم</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === 'system'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                <span>اطلاعات سیستم</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        {!loading && activeTab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">کل کارکنان</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {toPersianDigits(dashboard.stats.TotalEmployees)}
                    </p>
                  </div>
                  <Users className="w-12 h-12 text-blue-500" />
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">حضور امروز</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {toPersianDigits(dashboard.stats.TodayAttendance)}
                    </p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">مرخصی‌های در انتظار</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {toPersianDigits(dashboard.stats.PendingLeaves)}
                    </p>
                  </div>
                  <Clock className="w-12 h-12 text-amber-500" />
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">دستگاه‌های فعال</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {toPersianDigits(dashboard.stats.ActiveDevices)}
                    </p>
                  </div>
                  <Cpu className="w-12 h-12 text-purple-500" />
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">خطاهای 24 ساعت</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {toPersianDigits(dashboard.stats.Errors24h)}
                    </p>
                  </div>
                  <AlertCircle className="w-12 h-12 text-red-500" />
                </div>
              </div>
            </div>

            {/* Recent Logs */}
            <div className="premium-card p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">آخرین فعالیت‌ها</h3>
              <div className="space-y-3">
                {dashboard.recentLogs.slice(0, 10).map((log) => (
                  <div key={log.Id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className={`p-2 rounded-lg ${getLevelColor(log.Level)}`}>
                      {getLevelIcon(log.Level)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{log.Message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {log.Action} - {log.Entity} • {new Date(log.CreatedAt).toLocaleString('fa-IR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'logs' && (
          <div className="space-y-6">
            {/* Log Stats */}
            {logStats && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="premium-card p-4">
                  <p className="text-sm text-slate-600 mb-1">کل لاگ‌ها (7 روز)</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {toPersianDigits(logStats.TotalLogs)}
                  </p>
                </div>
                <div className="premium-card p-4">
                  <p className="text-sm text-slate-600 mb-1">خطاها</p>
                  <p className="text-2xl font-bold text-red-600">
                    {toPersianDigits(logStats.ErrorCount)}
                  </p>
                </div>
                <div className="premium-card p-4">
                  <p className="text-sm text-slate-600 mb-1">هشدارها</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {toPersianDigits(logStats.WarningCount)}
                  </p>
                </div>
                <div className="premium-card p-4">
                  <p className="text-sm text-slate-600 mb-1">موفقیت‌ها</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {toPersianDigits(logStats.SuccessCount)}
                  </p>
                </div>
                <div className="premium-card p-4">
                  <p className="text-sm text-slate-600 mb-1">اطلاعات</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {toPersianDigits(logStats.InfoCount)}
                  </p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="premium-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">فیلترها</h3>
                <button
                  onClick={clearOldLogs}
                  className="btn-danger flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف لاگ‌های قدیمی
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">سطح</label>
                  <select
                    value={filters.level}
                    onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                    className="input-field"
                  >
                    <option value="">همه</option>
                    <option value="error">خطا</option>
                    <option value="warning">هشدار</option>
                    <option value="success">موفقیت</option>
                    <option value="info">اطلاعات</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">موجودیت</label>
                  <select
                    value={filters.entity}
                    onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                    className="input-field"
                  >
                    <option value="">همه</option>
                    <option value="employee">کارکنان</option>
                    <option value="record">حضور و غیاب</option>
                    <option value="leave">مرخصی</option>
                    <option value="device">دستگاه</option>
                    <option value="api">API</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">تعداد</label>
                  <select
                    value={filters.limit}
                    onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
                    className="input-field"
                  >
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Logs Table */}
            <div className="premium-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">سطح</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">عملیات</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">موجودیت</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">پیام</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr key={log.Id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${getLevelColor(log.Level)}`}>
                            {getLevelIcon(log.Level)}
                            {log.Level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">{log.Action}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">{log.Entity}</td>
                        <td className="px-6 py-4 text-sm text-slate-700 max-w-md truncate">
                          {log.Message}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {new Date(log.CreatedAt).toLocaleString('fa-IR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'system' && (
          <div className="space-y-6">
            <div className="premium-card p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-6">اطلاعات سیستم</h3>
              {dashboard && dashboard.systemInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">نام دیتابیس</p>
                    <p className="text-lg font-semibold text-slate-800">{dashboard.systemInfo.DatabaseName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">نسخه SQL Server</p>
                    <p className="text-lg font-semibold text-slate-800">{dashboard.systemInfo.SQLVersion}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">کل رکوردها</p>
                    <p className="text-lg font-semibold text-slate-800">
                      {toPersianDigits(dashboard.systemInfo.TotalRecords)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">کل لاگ‌ها</p>
                    <p className="text-lg font-semibold text-slate-800">
                      {toPersianDigits(dashboard.systemInfo.TotalLogs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2">آخرین لاگ</p>
                    <p className="text-lg font-semibold text-slate-800">
                      {new Date(dashboard.systemInfo.LastLogTime).toLocaleString('fa-IR')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
