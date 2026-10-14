/**
 * AuditLog — security audit trail viewer (Phase 1 / P1.6).
 * Read-only table over GET /api/admin/audit-log (server enforces the `users`
 * module permission; this page is likewise gated in the sidebar/App by it).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { adminAPI } from '../utils/api';
import { toPersianDigits } from '../utils/jalali';

interface AuditRow {
  Id: number;
  ActorUserId: number | null;
  ActorName: string | null;
  Action: string;
  Entity: string;
  EntityId: string | null;
  Detail: string | null;
  IpAddress: string | null;
  CreatedAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'ورود موفق',
  LOGIN_FAILED: 'ورود ناموفق',
  LOGIN_LOCKED_REJECTED: 'تلاش ورود به حساب قفل‌شده',
  ACCOUNT_LOCKED: 'قفل شدن حساب',
  LOGIN_INACTIVE_REJECTED: 'ورود کاربر غیرفعال',
  LOGIN_PASSWORD_EXPIRED: 'ورود با رمز منقضی',
  LOGOUT: 'خروج',
  PASSWORD_CHANGED: 'تغییر رمز عبور',
  ADMIN_PASSWORD_RESET: 'بازنشانی رمز توسط مدیر',
  USER_CREATED: 'ایجاد کاربر',
  USER_UPDATED: 'ویرایش کاربر',
  USER_DELETED: 'حذف کاربر',
  USER_UNLOCKED: 'رفع قفل حساب',
  USER_ROLES_UPDATED: 'تغییر نقش‌های کاربر',
  USER_ROLES_REPLACED: 'جایگزینی نقش‌های کاربر',
  USER_ROLE_ASSIGNED: 'انتساب نقش',
  USER_ROLE_REVOKED: 'لغو نقش',
  SESSIONS_REVOKED: 'ابطال نشست‌ها',
  ROLE_CREATED: 'ایجاد نقش',
  ROLE_UPDATED: 'ویرایش نقش',
  ROLE_DELETED: 'حذف نقش',
  ROLE_PERMISSIONS_UPDATED: 'تغییر دسترسی‌های نقش',
  DEVICE_CREATED: 'ایجاد دستگاه',
};

const ENTITY_LABELS: Record<string, string> = {
  user: 'کاربر',
  role: 'نقش',
  device: 'دستگاه',
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string | number> = { limit: 200 };
      if (actionFilter) filters.action = actionFilter;
      if (entityFilter) filters.entity = entityFilter;
      const res = await adminAPI.getAuditLog(filters);
      const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
      setRows(list as AuditRow[]);
    } catch (e: any) {
      setError(e?.message || 'خطا در دریافت گزارش ممیزی');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ScrollText size={20} />
          <h2 className="ent-h3">گزارش ممیزی امنیتی</h2>
        </div>
        <div className="flex items-center gap-2">
          <select className="ent-input" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">همه موجودیت‌ها</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            className="ent-input"
            placeholder="فیلتر رویداد (مثلاً LOGIN_FAILED)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value.toUpperCase())}
            style={{ width: 220 }}
          />
          <button className="ent-btn" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span className="mr-1">بارگذاری</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 ent-card p-3">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="ent-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right ent-label">
              <th className="p-3">زمان</th>
              <th className="p-3">رویداد</th>
              <th className="p-3">کننده</th>
              <th className="p-3">موجودیت</th>
              <th className="p-3">شناسه</th>
              <th className="p-3">IP</th>
              <th className="p-3">جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="animate-spin inline" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">رویدادی ثبت نشده است</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.Id} className="border-t border-[#EEEEEE]">
                <td className="p-3 whitespace-nowrap">{formatDateTime(r.CreatedAt)}</td>
                <td className="p-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                    {ACTION_LABELS[r.Action] || r.Action}
                  </span>
                </td>
                <td className="p-3">{r.ActorName || <span className="text-gray-400">ناشناس</span>}</td>
                <td className="p-3">{ENTITY_LABELS[r.Entity] || r.Entity}</td>
                <td className="p-3">{r.EntityId != null ? toPersianDigits(String(r.EntityId)) : '—'}</td>
                <td className="p-3" dir="ltr">{r.IpAddress || '—'}</td>
                <td className="p-3 max-w-[280px] truncate text-gray-600" title={r.Detail || ''}>{r.Detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
