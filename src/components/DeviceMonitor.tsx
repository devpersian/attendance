/**
 * DeviceMonitor — live device operations console (Phase 2 / P2.7).
 *
 * - Health snapshot from GET /api/devices/monitor, refreshed every 30s and
 *   instantly whenever a realtime event arrives for that device.
 * - Live punch feed over the existing SSE stream (`useRealtimeStream`).
 * - Offline transitions flip card state in place (server sweeper emits
 *   `device-status` events on the same bus).
 * - Control actions (unlock / sync time / refresh data) queue commands that
 *   ride back in the device's next webhook ACK; gated client-side by the
 *   `devices.control` permission — the server enforces it independently.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Lock, RefreshCw, Clock, Loader2, AlertCircle, Wifi, WifiOff, Radio,
} from 'lucide-react';
import { devicesAPI } from '../utils/api';
import { useToast } from './Toast';
import { useHasPermission } from '../utils/useHasPermission';
import { useRealtimeStream, RealtimeEvent } from '../utils/realtime';

interface MonitorDevice {
  Id: number;
  Name: string;
  Type: string | null;
  Model: string | null;
  IPAddress: string | null;
  Port: number | null;
  Protocol: string | null;
  Status: string;
  Location: string | null;
  LastSync: string | null;
  LastSeen: string | null;
  LastError: string | null;
  ConsecutiveFailures: number;
  TotalRecordsReceived: number;
  PollingInterval: number | null;
  TotalLogs: number;
  UnprocessedLogs: number;
  LastRecordAt: string | null;
  reachable: boolean | null;
  latencyMs: number | null;
}

interface FeedItem {
  key: number;
  at: string;
  deviceId?: number;
  text: string;
  kind: 'punch' | 'status' | 'info';
}

let feedSeq = 0;

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.max(diff, 0)} ثانیه پیش`;
  if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
  try {
    return new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function statusOf(d: MonitorDevice): { label: string; color: string; icon: React.ReactNode } {
  if (d.Status === 'offline') return { label: 'آفلاین', color: 'bg-red-100 text-red-700', icon: <WifiOff size={14} /> };
  if (d.reachable === true) return { label: 'آنلاین', color: 'bg-green-100 text-green-700', icon: <Wifi size={14} /> };
  if (d.reachable === false) return { label: 'غيرقابل‌دسترس', color: 'bg-orange-100 text-orange-700', icon: <AlertCircle size={14} /> };
  if (d.Status === 'inactive') return { label: 'غیرفعال', color: 'bg-gray-100 text-gray-600', icon: <Radio size={14} /> };
  return { label: 'فقط پوش/نامشخص', color: 'bg-blue-100 text-blue-700', icon: <Radio size={14} /> };
}

export default function DeviceMonitor() {
  const toast = useToast();
  const canControl = useHasPermission('devices.control');
  const [devices, setDevices] = useState<MonitorDevice[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const devicesRef = useRef<MonitorDevice[]>([]);
  devicesRef.current = devices;

  const load = useCallback(async (instant = false) => {
    if (!instant) setRefreshing(true);
    try {
      const res: any = await devicesAPI.getMonitor();
      setDevices(res.devices || []);
      setSummary(res.summary || null);
    } catch (e: any) {
      toast.error('خطا در بارگذاری وضعیت دستگاه‌ها', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const pushFeed = useCallback((item: Omit<FeedItem, 'key'>) => {
    setFeed((prev) => [{ key: ++feedSeq, ...item }, ...prev].slice(0, 50));
  }, []);

  // Realtime: punches + offline/online flips. A status/punch event triggers an
  // instant snapshot refresh so cards reflect reality without waiting 30s.
  const onEvent = useCallback((ev: RealtimeEvent) => {
    const dev = devicesRef.current.find((d) => d.Id === Number(ev.deviceId));
    const name = dev?.Name || `دستگاه ${ev.deviceId ?? '?'}`;
    if (ev.type === 'punch') {
      pushFeed({ at: ev.at, deviceId: ev.deviceId, kind: 'punch', text: `${name}: تردد کاربر ${ev.deviceUserId} (${ev.eventType === 'checkout' ? 'خروج' : 'ورود'})` });
      load();
    } else if (ev.type === 'device-status') {
      pushFeed({ at: ev.at, deviceId: ev.deviceId, kind: 'status', text: (ev as any).status === 'offline' ? `${name}: آفلاین شد` : `${name}: آنلاین شد` });
      load();
    } else if (ev.type === 'device-event' && /offline|recovered/i.test(ev.message || '')) {
      pushFeed({ at: ev.at, deviceId: ev.deviceId, kind: 'status', text: `${name}: ${ev.message}` });
    }
  }, [load, pushFeed]);

  useRealtimeStream({ enabled: true, onEvent });

  const runAction = async (id: number, fn: (id: number) => Promise<any>, okMsg: string) => {
    setBusyId(id);
    try {
      await fn(id);
      toast.success('دستور صف شد', okMsg);
      pushFeed({ at: new Date().toISOString(), deviceId: id, kind: 'info', text: okMsg });
    } catch (e: any) {
      toast.error('ارسال دستور ناموفق بود', e?.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="animate-spin" size={20} /> در حال بارگذاری پایش دستگاه‌ها...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header + summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="ent-h2 flex items-center gap-2"><Activity size={22} className="text-blue-600" /> پایش زنده دستگاه‌ها</h2>
          <p className="ent-caption text-gray-500 mt-1">وضعیت لحظه‌ای، رویدادهای ترددی و دستورات کنترلی دستگاه‌های حضور و غیاب</p>
        </div>
        <button onClick={() => load()} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> تازه‌سازی
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'کل دستگاه‌ها', value: summary.total, cls: 'text-gray-800' },
            { label: 'آنلاین', value: summary.online, cls: 'text-green-600' },
            { label: 'غيرقابل‌دسترس', value: summary.unreachable, cls: 'text-orange-600' },
            { label: 'در خطا/آفلاین', value: summary.inError, cls: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {devices.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
          هیچ دستگاهی ثبت نشده است. از بخش «دستگاه‌ها» ابتدا دستگاه اضافه کنید.
        </div>
      )}

      {/* Device cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {devices.map((d) => {
          const st = statusOf(d);
          const busy = busyId === d.Id;
          return (
            <div key={d.Id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{d.Name}</h3>
                  <p className="text-xs text-gray-500">{d.Model || d.Type || '—'}{d.Location ? ` • ${d.Location}` : ''}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>
                  {st.icon}{st.label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                <div><dt className="text-gray-400">آخرین تماس</dt><dd>{relTime(d.LastSeen)}</dd></div>
                <div><dt className="text-gray-400">آخرین همگام‌سازی</dt><dd>{relTime(d.LastSync)}</dd></div>
                <div><dt className="text-gray-400">IP:Port</dt><dd dir="ltr">{d.IPAddress ? `${d.IPAddress}:${d.Port ?? ''}` : '—'}</dd></div>
                <div><dt className="text-gray-400">تأخیر</dt><dd dir="ltr">{d.latencyMs != null ? `${d.latencyMs}ms` : '—'}</dd></div>
                <div><dt className="text-gray-400">کل رکوردها</dt><dd>{d.TotalLogs}</dd></div>
                <div><dt className="text-gray-400">پردازش‌نشده</dt><dd className={d.UnprocessedLogs > 0 ? 'text-orange-600 font-semibold' : ''}>{d.UnprocessedLogs}</dd></div>
              </dl>

              {d.LastError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1 truncate" title={d.LastError}>
                  خطا: {d.LastError}
                </p>
              )}

              {canControl && (
                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  <button disabled={busy} onClick={() => runAction(d.Id, devicesAPI.unlock, 'دستور باز کردن قفل در صف قرار گرفت')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Lock size={13} /> باز کردن قفل
                  </button>
                  <button disabled={busy} onClick={() => runAction(d.Id, devicesAPI.syncTime, 'دستور تنظیم ساعت در صف قرار گرفت')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    <Clock size={13} /> تنظیم ساعت
                  </button>
                  <button disabled={busy} onClick={() => runAction(d.Id, devicesAPI.refreshData, 'درخواست دریافت فوری داده ثبت شد')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} دریافت داده
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live feed */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Radio size={16} className="text-green-600" /> رویدادهای زنده</h3>
        {feed.length === 0 ? (
          <p className="text-sm text-gray-400">هنوز رویدادی در این نشست دریافت نشده است…</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {feed.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${f.kind === 'punch' ? 'bg-green-500' : f.kind === 'status' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                <span className="text-gray-400 shrink-0" dir="ltr">{new Date(f.at).toLocaleTimeString('fa-IR')}</span>
                <span className="text-gray-700">{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
