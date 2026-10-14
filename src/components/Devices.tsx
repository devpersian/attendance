import React from 'react';
import { Device } from '../types';
import { getDevices, createDevice, updateDevice, deleteDevice, restoreDevice, syncDevice, getDeviceLogs, getDeviceProtocolRegistry, getDeviceCatalog } from '../utils/storage';
import { devicesAPI } from '../utils/api';
import { toPersianDigits } from '../utils/jalali';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { 
  Cpu, Plus, Edit2, Trash2, X, RefreshCw, RotateCcw, 
  Wifi, WifiOff, AlertCircle, CheckCircle, 
  Clock, MapPin, Activity, Eye, Loader2
} from 'lucide-react';

export default function Devices() {
  const toast = useToast();
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [showModal, setShowModal] = React.useState(false);
  const [showLogsModal, setShowLogsModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deviceToDelete, setDeviceToDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [editingDevice, setEditingDevice] = React.useState<Device | null>(null);
  const [selectedDevice, setSelectedDevice] = React.useState<Device | null>(null);
  const [deviceLogs, setDeviceLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  // Full registry from server (mirrors CK_Devices_Protocol): all keys + which have drivers.
  const [protocolInfo, setProtocolInfo] = React.useState<{ protocols: string[]; implemented: string[]; drivers: Record<string, boolean> }>({ protocols: [], implemented: [], drivers: {} });
  // Device models catalog from server (/api/devices/catalog).
  const [catalog, setCatalog] = React.useState<any[]>([]);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    type: 'fingerprint' as Device['type'],
    model: '',
    modelId: '',
    ipAddress: '',
    port: 4370,
    serialNumber: '',
    protocol: 'tcp' as Device['protocol'],
    status: 'active' as Device['status'],
    location: '',
    pollingInterval: 60,
    webhookEnabled: false,
    webhookURL: '',
    config: {} as Record<string, any>
  });

  React.useEffect(() => {
    loadDevices();
    getDeviceProtocolRegistry().then((r) => r && setProtocolInfo(r));
    getDeviceCatalog().then(setCatalog);
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const devs = await getDevices();
      setDevices(devs);
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('خطا در بارگذاری دستگاه‌ها');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingDevice(null);
    setFormData({
      name: '',
      type: 'fingerprint',
      model: '',
      modelId: '',
      ipAddress: '',
      port: 4370,
      serialNumber: '',
      protocol: 'tcp',
      status: 'active',
      location: '',
      pollingInterval: 60,
      webhookEnabled: false,
      webhookURL: '',
      config: {}
    });
    setTestResult(null);
    setShowModal(true);
  };

  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      name: device.name,
      type: device.type,
      model: device.model,
      modelId: device.modelId || '',
      ipAddress: device.ipAddress || '',
      port: device.port || 4370,
      serialNumber: device.serialNumber || '',
      protocol: device.protocol || 'tcp',
      status: device.status,
      location: device.location || '',
      pollingInterval: device.pollingInterval,
      webhookEnabled: device.webhookEnabled,
      webhookURL: device.webhookURL || '',
      config: device.config && typeof device.config === 'object' ? device.config : {}
    });
    setTestResult(null);
    setShowModal(true);
  };

  /** Open the confirmation dialog for a soft-delete. */
  const handleDeleteClick = (id: string) => {
    if (deleting) return; // ignore clicks while a delete is already in flight
    setDeviceToDelete(id);
    setShowDeleteConfirm(true);
  };

  /**
   * Actually perform the deletion when the red "حذف" button in the
   * confirmation dialog is pressed.
   *
   * Notes:
   * - The handler receives the React MouseEvent from ConfirmDialog; we never
   *   pass that object to `deleteDevice` — only the stored device id.
   * - We re-validate the state inside the handler (`deviceToDelete`, dialog
   *   still open, not already deleting) so a stale/duplicate click can never
   *   fire a second request or silently no-op.
   * - The dialog stays open with a busy state until the server responds, so
   *   the user always sees either a success toast (dialog closes) or the real
   *   error message (dialog remains open for a retry).
   */
  const handleDeleteConfirm = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent the click from bubbling up to any overlay/parent handlers.
    event?.preventDefault();
    event?.stopPropagation();

    const deviceId = deviceToDelete;
    if (!deviceId || !showDeleteConfirm || deleting) return;

    setDeleting(true);
    try {
      // Soft delete on the server (DELETE /api/devices/:id) — the device is
      // removed from the active list/sync but attendance records are kept and
      // it can be restored later.
      await deleteDevice(deviceId);
      await loadDevices();
      toast.success('دستگاه با موفقیت حذف شد');
      // Close the dialog now that the operation succeeded.
      setShowDeleteConfirm(false);
      setDeviceToDelete(null);
    } catch (error: any) {
      console.error('Error deleting device:', error);
      // Show the actual server message (FK conflict, auth, network, ...)
      toast.error(error?.message ? `خطا در حذف دستگاه: ${error.message}` : 'خطا در حذف دستگاه');
      // Keep the dialog open so the user can cancel or retry explicitly.
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreDevice(id);
      await loadDevices();
      toast.success('دستگاه با موفقیت بازگردانی شد');
    } catch (error: any) {
      console.error('Error restoring device:', error);
      toast.error(error?.message ? `خطا در بازگردانی دستگاه: ${error.message}` : 'خطا در بازگردانی دستگاه');
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await syncDevice(id);
      toast.success('همگام‌سازی با موفقیت انجام شد');
      await loadDevices();
    } catch (error) {
      console.error('Error syncing device:', error);
      toast.error('خطا در همگام‌سازی دستگاه');
    } finally {
      setSyncing(null);
    }
  };

  const handleViewLogs = async (device: Device) => {
    setSelectedDevice(device);
    try {
      const logs = await getDeviceLogs(device.id, 50);
      setDeviceLogs(logs);
      setShowLogsModal(true);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('خطا در بارگذاری لاگ‌ها');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.modelId || !formData.protocol) {
      toast.warning('لطفاً نام دستگاه و مدل (از لیست) را انتخاب کنید');
      return;
    }

    try {
      setSaving(true);
      if (editingDevice) {
        await updateDevice(editingDevice.id, formData);
        toast.success('دستگاه با موفقیت به‌روزرسانی شد');
      } else {
        const newDevice = {
          id: `device-${Date.now()}`,
          ...formData
        };
        await createDevice(newDevice);
        toast.success('دستگاه جدید با موفقیت اضافه شد');
      }
      await loadDevices();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving device:', error);
      toast.error('خطا در ذخیره اطلاعات');
    } finally {
      setSaving(false);
    }
  };

  // ─────────── Model catalog (server /api/devices/catalog) ───────────
  const selectedModel = React.useMemo(
    () => catalog.find((m) => m.id === formData.modelId) || null,
    [catalog, formData.modelId]
  );

  /** Picking a model from the catalog auto-applies everything that model supports. */
  const handleModelChange = (modelId: string) => {
    const m = catalog.find((x) => x.id === modelId) || null;
    if (!m) {
      setFormData({ ...formData, modelId: '', model: '' });
      return;
    }
    const proto = m.protocols?.[0] || formData.protocol;
    setFormData({
      ...formData,
      modelId: m.id,
      model: `${m.brand} ${m.model}`,
      type: m.category === 'gateway' || m.category === 'software' ? formData.type : (m.category || formData.type),
      protocol: proto,
      port: m.defaults?.port ?? formData.port,
      pollingInterval: m.defaults?.pollingInterval ?? formData.pollingInterval,
      webhookEnabled: proto === 'http-push' ? true : formData.webhookEnabled,
      config: Object.fromEntries((m.fields || []).map((f: any) => [f.key, f.default ?? '']))
    });
    setTestResult(null);
  };

  /** Switch protocol within the picked model's supported list. */
  const handleProtocolChange = (protocol: string) => {
    setFormData({
      ...formData,
      protocol,
      webhookEnabled: protocol === 'http-push' ? true : formData.webhookEnabled,
      ...(selectedModel?.defaults?.port ? { port: selectedModel.defaults.port } : {})
    });
    setTestResult(null);
  };

  // Protocols offered in the form: the picked model's supported list, else every DB-allowed key.
  const availableProtocols: string[] = selectedModel?.protocols?.length
    ? selectedModel.protocols
    : (protocolInfo.protocols.length ? protocolInfo.protocols : ['tcp', 'http', 'zk']);

  const hasDriver = (p: string) => protocolInfo.drivers[p] !== false;

  /** Live connectivity test against the server driver (works before saving). */
  const handleTestConnection = async () => {
    if (!formData.ipAddress) { toast.warning('ابتدا آدرس IP دستگاه را وارد کنید'); return; }
    try {
      setTesting(true);
      setTestResult(null);
      const res = await devicesAPI.testConnection({
        ipAddress: formData.ipAddress,
        port: formData.port,
        modelId: formData.modelId || undefined,
        protocol: formData.protocol,
        config: formData.config,
        serialNumber: formData.serialNumber
      });
      if (res?.ok) setTestResult({ ok: true, message: `اتصال برقرار شد — ${res.fetched ?? 0} رکورد نمونه دریافت شد.` });
      else setTestResult({ ok: false, message: res?.error || 'اتصال برقرار نشد' });
    } catch (error: any) {
      setTestResult({ ok: false, message: error?.message || 'خطا در تست اتصال' });
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Wifi size={16} className="text-[#107E3E]" />;
      case 'inactive': return <WifiOff size={16} className="text-[#8A8E93]" />;
      case 'error': return <AlertCircle size={16} className="text-[#BB0000]" />;
      case 'maintenance': return <Clock size={16} className="text-[#C17900]" />;
      default: return <WifiOff size={16} className="text-[#8A8E93]" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'فعال';
      case 'inactive': return 'غیرفعال';
      case 'error': return 'خطا';
      case 'maintenance': return 'در حال تعمیر';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'ent-badge-success';
      case 'inactive': return 'ent-badge-neutral';
      case 'error': return 'ent-badge-danger';
      case 'maintenance': return 'ent-badge-warning';
      default: return 'ent-badge-neutral';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fingerprint': return 'اثر انگشت';
      case 'face': return 'تشخیص چهره';
      case 'card': return 'کارت';
      case 'mixed': return 'ترکیبی';
      default: return type;
    }
  };

  // Persian labels for every protocol key allowed by CK_Devices_Protocol.
  const PROTOCOL_LABELS: Record<string, string> = {
    'http': 'HTTP (دریافت وب)',
    'http-push': 'HTTP Push (وب‌هوک دستگاه)',
    'tcp': 'TCP/IP',
    'mqtt': 'MQTT',
    'zk': 'ZK (ZKTeco Pull/Push)',
    'isapi': 'ISAPI (Hikvision)',
    'dws': 'DWS (Digital Watchdog)',
    'fpvtech': 'FPVTech',
    'controlianz': 'ControlScan/Anviz (Telnet)',
    'suprema': 'Suprema',
    'biostar2': 'BioStar 2 (Suprema REST)',
    'sdk600': 'SDK600 (eSSL)',
    'wiegand-gateway': 'Wiegand Gateway',
    'realtime': 'Realtime TCP',
    'smartplus': 'SmartPlus',
    'apex': 'Apex',
    'crosschex': 'CrossChex',
    'essl-pull': 'eSSL Pull',
    'pullsdk': 'Pull SDK',
    'telnet': 'Telnet',
    'websockets': 'WebSocket',
    'custom': 'سفارشی',
    'virdi': 'Virdi (VirdiCore)',
    'trustone': 'TrustOne (تراست وان)',
    'tosan': 'Tosan (توسان)',
  };

  // Devices seeded before the Protocol column existed (or rows whose protocol
  // was never set) can arrive with a null/undefined protocol — render safely.
  const getProtocolLabel = (protocol?: string | null) => {
    if (!protocol) return 'نامشخص';
    return PROTOCOL_LABELS[protocol] || String(protocol).toUpperCase();
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h2 className="ent-h1 mb-1">دستگاه‌ها</h2>
          <p className="ent-body">مدیریت و نظارت بر دستگاه‌های حضور و غیاب</p>
        </div>
        <button
          onClick={handleAdd}
          className="ent-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>افزودن دستگاه</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="ent-tile animate-fade-in stagger-1">
          <div className="flex items-center gap-3">
            <div className="ent-icon">
              <Cpu size={20} />
            </div>
            <div>
              <p className="ent-kpi">{toPersianDigits(devices.length)}</p>
              <p className="ent-label">کل دستگاه‌ها</p>
            </div>
          </div>
        </div>
        <div className="ent-tile animate-fade-in stagger-2">
          <div className="flex items-center gap-3">
            <div className="ent-icon ent-icon-success">
              <Wifi size={20} />
            </div>
            <div>
              <p className="ent-kpi">
                {toPersianDigits(devices.filter(d => d.status === 'active').length)}
              </p>
              <p className="ent-label">فعال</p>
            </div>
          </div>
        </div>
        <div className="ent-tile animate-fade-in stagger-3">
          <div className="flex items-center gap-3">
            <div className="ent-icon ent-icon-danger">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="ent-kpi">
                {toPersianDigits(devices.filter(d => d.status === 'error').length)}
              </p>
              <p className="ent-label">خطا</p>
            </div>
          </div>
        </div>
        <div className="ent-tile animate-fade-in stagger-4">
          <div className="flex items-center gap-3">
            <div className="ent-icon ent-icon-warning">
              <Activity size={20} />
            </div>
            <div>
              <p className="ent-kpi">
                {toPersianDigits(devices.filter(d => d.status === 'maintenance').length)}
              </p>
              <p className="ent-label">در حال تعمیر</p>
            </div>
          </div>
        </div>
      </div>

      {/* Device Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device, idx) => (
          <div key={device.id} className={`ent-card p-5 animate-fade-in stagger-${Math.min(idx + 5, 6)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`ent-icon ${
                  device.status === 'active' ? 'ent-icon-success' :
                  device.status === 'error' ? 'ent-icon-danger' : ''
                }`}>
                  <Cpu size={20} />
                </div>
                <div>
                  <h4 className="ent-h3">{device.name}</h4>
                  <p className="ent-caption">{device.model}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleViewLogs(device)}
                  className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                  title="مشاهده لاگ‌ها"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => handleEdit(device)}
                  className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                  title="ویرایش"
                >
                  <Edit2 size={16} />
                </button>
                {device.isDeleted ? (
                  <button
                    onClick={() => handleRestore(device.id)}
                    className="p-2 text-[#5A5E63] hover:text-[#0D6B34] hover:bg-[#EFF8F1] rounded transition-colors"
                    title="بازگردانی"
                  >
                    <RotateCcw size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeleteClick(device.id)}
                    className="p-2 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="ent-caption w-16">نوع:</span>
                <span className="ent-body text-sm">{getTypeLabel(device.type)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="ent-caption w-16">پروتکل:</span>
                <span className="ent-body text-sm">{getProtocolLabel(device.protocol)}</span>
              </div>
              {device.ipAddress && (
                <div className="flex items-center gap-2">
                  <span className="ent-caption w-16">آدرس IP:</span>
                  <span className="ent-body text-sm font-mono" dir="ltr">
                    {device.ipAddress}:{device.port}
                  </span>
                </div>
              )}
              {device.location && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-[#8A8E93]" />
                  <span className="ent-body text-sm">{device.location}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#E5E5E5]">
              <span className={`ent-badge ${getStatusBadge(device.status)} flex items-center gap-1`}>
                {getStatusIcon(device.status)}
                {getStatusLabel(device.status)}
              </span>
              <button
                onClick={() => handleSync(device.id)}
                disabled={syncing === device.id || device.status !== 'active'}
                className="flex items-center gap-1 text-sm text-[#0A6ED1] hover:text-[#085CAF] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={14} className={syncing === device.id ? 'animate-spin' : ''} />
                <span>همگام‌سازی</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {devices.length === 0 && (
        <div className="ent-card p-12 text-center animate-fade-in">
          <Cpu size={56} className="mx-auto mb-3 text-[#8A8E93]" />
          <p className="ent-body mb-2">هنوز دستگاهی ثبت نشده است</p>
          <button
            onClick={handleAdd}
            className="ent-btn-primary mt-3"
          >
            اولین دستگاه را اضافه کنید
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-2xl">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingDevice ? 'ویرایش دستگاه' : 'افزودن دستگاه جدید'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[#F7F8FA] rounded transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <label className="ent-form-label">نام دستگاه *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="ent-input"
                    placeholder="مثال: دستگاه ورودی اصلی"
                  />
                </div>
                <div className="ent-form-group md:col-span-2">
                  <label className="ent-form-label">مدل دستگاه * (از کاتالوگ — پروتکل و پورت به‌صورت خودکار تنظیم می‌شود)</label>
                  <select
                    value={formData.modelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="ent-input"
                  >
                    <option value="">— انتخاب مدل —</option>
                    {Object.entries(catalog.reduce((acc: Record<string, any[]>, m: any) => {
                      (acc[m.brand] = acc[m.brand] || []).push(m);
                      return acc;
                    }, {} as Record<string, any[]>)).map(([brand, models]) => (
                      <optgroup key={brand} label={brand}>
                        {(models as any[]).map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {m.model} ({getTypeLabel(m.category)}) — {(m.protocols || []).map((pp: string) => getProtocolLabel(pp)).join(' / ')}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedModel && (
                    <p className="ent-caption mt-1 text-[#5A5E63]" dir="rtl">
                      {selectedModel.notes}
                    </p>
                  )}
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">نوع دستگاه</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Device['type'] })}
                    className="ent-input"
                  >
                    <option value="fingerprint">اثر انگشت</option>
                    <option value="face">تشخیص چهره</option>
                    <option value="card">کارت</option>
                    <option value="mixed">ترکیبی</option>
                  </select>
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">پروتکل ارتباطی *</label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => handleProtocolChange(e.target.value)}
                    className="ent-input"
                  >
                    {/* When a catalog model is picked only its supported protocols are offered;
                        otherwise every key allowed by CK_Devices_Protocol (from the server registry). */}
                    {availableProtocols.map((p) => (
                      <option key={p} value={p}>
                        {getProtocolLabel(p)}{hasDriver(p) ? '' : ' (بدون درایور)'}
                      </option>
                    ))}
                  </select>
                  {!hasDriver(formData.protocol ?? '') && (
                    <p className="ent-caption mt-1 text-[#C17900]">
                      برای این پروتکل درایور دریافت داده روی سرور پیاده‌سازی نشده است؛ فقط ثبت/وب‌هوک ممکن است.
                    </p>
                  )}
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">آدرس IP</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    className="ent-input"
                    placeholder="192.168.1.100"
                    dir="ltr"
                  />
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">پورت</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    className="ent-input"
                    dir="ltr"
                  />
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">شماره سریال</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="ent-input"
                    placeholder="شماره سریال دستگاه"
                    dir="ltr"
                  />
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">موقعیت</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="ent-input"
                    placeholder="مثال: ورودی ساختمان"
                  />
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">وضعیت</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Device['status'] })}
                    className="ent-input"
                  >
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                    <option value="error">خطا</option>
                    <option value="maintenance">در حال تعمیر</option>
                  </select>
                </div>
                <div className="ent-form-group">
                  <label className="ent-form-label">فاصله همگام‌سازی (ثانیه)</label>
                  <input
                    type="number"
                    value={formData.pollingInterval}
                    onChange={(e) => setFormData({ ...formData, pollingInterval: parseInt(e.target.value) })}
                    className="ent-input"
                    dir="ltr"
                  />
                </div>
                <div className="ent-form-group md:col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.webhookEnabled}
                      onChange={(e) => setFormData({ ...formData, webhookEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="ent-form-label mb-0">فعال‌سازی Webhook</span>
                  </label>
                </div>
                {formData.webhookEnabled && (
                  <div className="ent-form-group md:col-span-2">
                    <label className="ent-form-label">آدرس Webhook</label>
                    <input
                      type="text"
                      value={formData.webhookURL}
                      onChange={(e) => setFormData({ ...formData, webhookURL: e.target.value })}
                      className="ent-input"
                      placeholder="http://your-server.com/webhook"
                      dir="ltr"
                    />
                  </div>
                )}

                {/* Extra connection settings required by the selected catalog model */}
                {selectedModel?.fields?.map((f: any) => (
                  <div className="ent-form-group" key={f.key}>
                    <label className="ent-form-label">
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.type === 'select' && f.options ? (
                      <select
                        value={formData.config[f.key] ?? f.default ?? ''}
                        onChange={(e) => setFormData({ ...formData, config: { ...formData.config, [f.key]: e.target.value } })}
                        className="ent-input"
                      >
                        {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                        value={formData.config[f.key] ?? f.default ?? ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, [f.key]: f.type === 'number' ? parseInt(e.target.value || '0', 10) : e.target.value }
                        })}
                        className="ent-input"
                        dir="ltr"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Connection test against the server-side driver (before saving) */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="ent-btn-secondary flex items-center gap-2 disabled:opacity-50"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                  <span>تست اتصال</span>
                </button>
                {testResult && (
                  <span className={`ent-badge ${testResult.ok ? 'ent-badge-success' : 'ent-badge-danger'} flex items-center gap-1`}>
                    {testResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="ent-modal-footer">
              <button
                onClick={handleSave}
                disabled={saving}
                className="ent-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <span>{editingDevice ? 'ذخیره تغییرات' : 'افزودن'}</span>
                )}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="ent-btn-secondary disabled:opacity-50"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && selectedDevice && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-3xl">
            <div className="ent-modal-header flex items-center justify-between">
              <div>
                <h3 className="ent-h2">لاگ‌های دستگاه</h3>
                <p className="ent-caption mt-1">{selectedDevice.name}</p>
              </div>
              <button onClick={() => setShowLogsModal(false)} className="p-2 hover:bg-[#F7F8FA] rounded transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                {deviceLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="ent-caption">لاگی موجود نیست</p>
                  </div>
                ) : (
                  deviceLogs.map(log => (
                    <div key={log.id} className="flex items-start gap-3 p-3 bg-[#F7F8FA] rounded">
                      <div className={`ent-icon ${
                        log.eventType === 'sync' ? 'ent-icon-success' :
                        log.eventType === 'error' ? 'ent-icon-danger' :
                        log.eventType === 'connection' ? '' : ''
                      }`}>
                        {log.eventType === 'sync' ? <CheckCircle size={16} /> :
                         log.eventType === 'error' ? <AlertCircle size={16} /> :
                         log.eventType === 'connection' ? <Wifi size={16} /> :
                         <Activity size={16} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="ent-body font-medium text-sm">
                            {log.eventType === 'sync' ? 'همگام‌سازی' :
                             log.eventType === 'error' ? 'خطا' :
                             log.eventType === 'connection' ? 'اتصال' :
                             log.eventType === 'disconnection' ? 'قطع اتصال' : 'تغییر تنظیمات'}
                          </span>
                          <span className="ent-caption text-xs">
                            {new Date(log.createdAt).toLocaleString('fa-IR')}
                          </span>
                        </div>
                        {log.message && (
                          <p className="ent-body text-sm">{log.message}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف دستگاه"
        message="با حذف این دستگاه، آن از فهرست و همگام‌سازی خارج می‌شود. تمام رکوردهای حضور و غیاب ثبت‌شده توسط این دستگاه در پایگاه داده باقی می‌مانند و دستگاه هر زمان قابل بازگردانی است."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        busy={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (deleting) return;
          setShowDeleteConfirm(false);
          setDeviceToDelete(null);
        }}
      />
    </div>
  );
}
