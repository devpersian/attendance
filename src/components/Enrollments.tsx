/**
 * Enrollments — generic user enrollment section.
 *
 * Lets an admin enroll users straight from the browser:
 *   • fingerprint / iris / palm-vein : import template files exported from any
 *     enrollment terminal (or a synthetic test blob for dry-run transfers)
 *   • face                           : live webcam capture (JPEG frame)
 *   • card                           : keyboard-wedge HID reader or typed number
 *   • password / PIN                 : typed value
 *
 * Every credential is stored ONCE in a canonical, device-independent form on
 * the server (attendance.EnrollmentTemplates) and can then be TRANSFERRED to
 * any device managed by this project — the server picks the right protocol
 * adapter (ZK / ISAPI / Biostar2 / KTE / CSV) per target device. The sync
 * matrix below shows exactly which devices hold which enrollment.
 */
import React from 'react';
import {
  Fingerprint, Camera, CreditCard, KeyRound, Upload, RefreshCw, Trash2,
  Send, Download, Users as UsersIcon, X, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react';
import {
  enrollmentsAPI,
  type EntityId,
  type EnrollmentMeta,
  type EnrollmentTemplate,
  type EnrollmentTemplatePayload,
  type TransferOutcome,
} from '../utils/api';
import { getEmployees } from '../utils/storage';
import type { Employee } from '../types';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import SearchableDropdown from './SearchableDropdown';
import { LoadingState, EmptyState } from './ui';
import {
  attachCameraStream, captureFromVideo, captureFromFile, buildTestTemplate,
  decodeWiegand26, formatPin, normalizeCardNumber, type CaptureResult,
} from '../utils/enrollmentCapture';
import {
  pingBridge, rescanSdk, setSdkProvider, sdkCapture, readCard,
  type BridgeCapabilities, type BridgeProvider,
} from '../utils/bridgeClient';

// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS_FA: Record<string, string> = {
  fingerprint: 'اثر انگشت',
  face: 'چهره',
  irisscan: 'عنبیه چشم',
  palmvein: 'رگ کف دست',
  card: 'کارت',
  password: 'رمز عبور',
};

const SYNC_LABELS_FA: Record<string, string> = {
  pending: 'در انتظار ارسال',
  synced: 'همگام‌شده',
  failed: 'خطا',
  removed: 'حذف‌شده از دستگاه',
};

const STATUS_LABELS_FA: Record<string, string> = {
  active: 'فعال',
  draft: 'پیش‌نویس',
  disabled: 'غیرفعال',
};

const DEVICE_STATUS_FA: Record<string, string> = {
  active: 'آماده',
  inactive: 'غیرفعال',
  error: 'خطا',
  maintenance: 'تعمیرات',
};

const typeLabel = (t: string) => TYPE_LABELS_FA[t] || t;
const slotLabel = (s: string | null) => (!s ? '—' : s.replace('right_', 'راست ').replace('left_', 'چپ ').replace('_', ' '));

/** Human-readable credential kinds a catalog model supports (for device pickers). */
const capabilityLabelsFa = (caps: string[] | null): string =>
  (caps && caps.length > 0 ? caps : TEMPLATE_FALLBACK).map(typeLabel).join('، ');

const TEMPLATE_FALLBACK = Object.keys(TYPE_LABELS_FA);

type TabKey = 'capture' | 'list' | 'transfer' | 'jobs';

interface JobSummary {
  id: number; jobType: string; status: string; totalSteps: number; doneSteps: number;
  errorCount: number; message?: string | null; startedAt?: string | null; finishedAt?: string | null; createdAt: string;
}

// ---------------------------------------------------------------------------
// capture form state
// ---------------------------------------------------------------------------

interface CaptureForm {
  employeeId: string;
  templateType: string;
  slot: string;
  value: string;
  quality: string;
  status: 'draft' | 'active';
  replace: boolean;
  sourceDeviceId: string;
}

const EMPTY_FORM: CaptureForm = {
  employeeId: '', templateType: 'fingerprint', slot: 'right_index', value: '',
  quality: '', status: 'active', replace: false, sourceDeviceId: '',
};

export default function Enrollments() {
  const toast = useToast();

  // ---- shared data -------------------------------------------------------
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<EnrollmentMeta | null>(null);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [templates, setTemplates] = React.useState<EnrollmentTemplate[]>([]);
  const [tab, setTab] = React.useState<TabKey>('capture');

  // ---- capture tab -------------------------------------------------------
  const [form, setForm] = React.useState<CaptureForm>(EMPTY_FORM);
  const [capture, setCapture] = React.useState<CaptureResult | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const stopCameraRef = React.useRef<(() => void) | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // ---- list tab ----------------------------------------------------------
  const [filterEmployee, setFilterEmployee] = React.useState<string>('');
  const [filterType, setFilterType] = React.useState<string>('');
  const [deleting, setDeleting] = React.useState<EnrollmentTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  // ---- transfer tab ------------------------------------------------------
  const [selTemplates, setSelTemplates] = React.useState<Set<number>>(new Set());
  const [selDevices, setSelDevices] = React.useState<Set<number>>(new Set());
  const [busyTransfer, setBusyTransfer] = React.useState(false);
  const [lastOutcome, setLastOutcome] = React.useState<TransferOutcome | null>(null);
  const [pullDeviceId, setPullDeviceId] = React.useState<string>('');
  const [pullUserId, setPullUserId] = React.useState<string>('');
  const [pulling, setPulling] = React.useState(false);

  // ---- jobs tab ----------------------------------------------------------
  const [jobs, setJobs] = React.useState<JobSummary[]>([]);
  const [expandedJob, setExpandedJob] = React.useState<number | null>(null);
  const [jobSteps, setJobSteps] = React.useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = React.useState(false);

  // ---- local enrollment bridge (Windows service) -------------------------
  // The bridge exposes hardware browsers cannot reach: vendor fingerprint/iris
  // SDK DLLs and USB HID card readers. When it is not running everything here
  // stays hidden/disabled and the pure-browser capture paths keep working.
  const [bridge, setBridge] = React.useState<BridgeCapabilities | null>(null);
  const [bridgeBusy, setBridgeBusy] = React.useState(false);
  const [sdkCapturing, setSdkCapturing] = React.useState(false);
  const [cardReading, setCardReading] = React.useState(false);

  const probeBridge = React.useCallback(async (force = false) => {
    setBridgeBusy(true);
    try {
      const caps = await pingBridge({ force });
      setBridge(caps);
      if (force) {
        if (caps) toast.success('پل ثبت‌نام متصل است', `${caps.hostname} · ${caps.capabilities.sdk.types.length} نوع بیومتریک`);
        else toast.error('پل ثبت‌نام در دسترس نیست', 'سرویس محلی enrollment-bridge روی این کامپیوتر اجرا نمی‌شود');
      }
    } finally {
      setBridgeBusy(false);
    }
  }, [toast]);

  React.useEffect(() => { probeBridge(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const bridgeSdkTypes = React.useMemo(
    () => new Set(bridge?.capabilities.sdk.types || []),
    [bridge],
  );
  const sdkAvailableForType = bridge && bridge.capabilities.sdk.available
    ? bridgeSdkTypes.has(form.templateType) : false;
  const hidReaderPresent = Boolean(bridge?.capabilities.card.hidAvailable && bridge.capabilities.card.readers.length > 0);

  const onRescanBridge = async () => {
    setBridgeBusy(true);
    try {
      const caps = await rescanSdk();
      setBridge(caps);
      if (caps) toast.info('بازجویی پل انجام شد', `SDKهای آماده: ${caps.capabilities.sdk.providers.filter((p) => p.status === 'ready').length}`);
      else toast.error('پل در دسترس نیست', 'ابتدا سرویس enrollment-bridge را اجرا کنید');
    } catch (err: any) {
      toast.error('بازجویی ناموفق', err?.message);
    } finally {
      setBridgeBusy(false);
    }
  };

  const onActivateProvider = async (p: BridgeProvider) => {
    try {
      const providers = await setSdkProvider(p.id);
      setBridge((prev) => prev ? { ...prev, capabilities: { ...prev.capabilities, sdk: { ...prev.capabilities.sdk, active: p.id, providers } as any } } : prev);
      await probeBridge(true);
      toast.success('SDK فعال شد', p.label);
    } catch (err: any) {
      toast.error('فعال‌سازی SDK ناموفق', err?.message);
    }
  };

  /** Ask the bridge to run the vendor SDK and grab a real template. */
  const captureViaSdk = async () => {
    if (!form.employeeId) return toast.error('ابتدا کارمند را انتخاب کنید');
    setSdkCapturing(true);
    try {
      const out = await sdkCapture(form.templateType, {
        slot: form.templateType !== 'face' ? form.slot : null,
      });
      setCapture({
        base64: out.templateBase64,
        byteLength: out.byteLength,
        algorithmHint: out.algorithm,
        fileName: `${out.provider}-${out.algorithm}.bin`,
      });
      toast.success('قالب از حسگر محلی گرفته شد', `${out.algorithm} · ${Math.round(out.byteLength / 1024)} KB — منبع: ${out.provider}`);
    } catch (err: any) {
      toast.error('خطا در گرفتن قالب از حسگر', err?.message);
    } finally {
      setSdkCapturing(false);
    }
  };

  /** Wait for one swipe on a USB HID reader plugged into this PC. */
  const captureViaHidReader = async () => {
    setCardReading(true);
    try {
      const card = await readCard({ timeoutMs: 30000 });
      setField('value', normalizeCardNumber(card.value));
      toast.success('کارت خوانده شد', `شماره ${card.value} (${card.format})${card.wiegand ? ` · W26: ${card.wiegand.combined}` : ''}`);
    } catch (err: any) {
      toast.error('خواندن کارت ناموفق', err?.message);
    } finally {
      setCardReading(false);
    }
  };

  const setField = <K extends keyof CaptureForm>(key: K, value: CaptureForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ---- enrollment device selection (capture tab) --------------------------
  // The operator picks the terminal that will physically capture the credential
  // (e.g. a CMITech EF-70 for iris). The selection drives everything else:
  //   • only credential kinds that hardware supports stay selectable
  //   • switching type prunes incompatible target devices in the transfer tab
  //   • saving re-validates the pair server-side (POST /templates)
  const selectedSourceDevice = React.useMemo(
    () => (meta?.devices || []).find((d) => String(d.id) === form.sourceDeviceId) || null,
    [meta, form.sourceDeviceId],
  );

  const availableTemplateTypes = React.useMemo(() => {
    const all = meta?.templateTypes || TEMPLATE_FALLBACK;
    if (!selectedSourceDevice) return all;
    const caps = selectedSourceDevice.capabilities;
    if (!caps || caps.length === 0) return all;
    return all.filter((t) => caps.includes(t));
  }, [meta, selectedSourceDevice]);

  const onPickSourceDevice = (deviceId: string) => {
    setField('sourceDeviceId', deviceId);
    const dev = (meta?.devices || []).find((d) => String(d.id) === deviceId);
    if (dev?.capabilities && dev.capabilities.length > 0 && !dev.capabilities.includes(form.templateType)) {
      const next = (meta?.templateTypes || TEMPLATE_FALLBACK).find((t) => dev.capabilities!.includes(t)) || 'fingerprint';
      setField('templateType', next);
      setCapture(null);
      toast.info('نوع شناسایی متناسب با دستگاه تغییر کرد', `${dev.name} — ${typeLabel(next)}`);
    }
  };

  const onPickTemplateType = (t: string) => {
    setField('templateType', t);
    setCapture(null);
    // keep the source device selection coherent with the chosen credential kind
    if (selectedSourceDevice && !deviceSupportsType(selectedSourceDevice, t)) {
      setField('sourceDeviceId', '');
      toast.warning('دستگاه مبدأ حذف شد', `${selectedSourceDevice.name} از «${typeLabel(t)}» پشتیبانی نمی‌کند`);
    }
  };

  /** Client-side mirror of the server capability check (catalog + adapter map). */
  const deviceSupportsType = (d: EnrollmentMeta['devices'][number], t: string): boolean => {
    if (d.capabilities && d.capabilities.length > 0 && !d.capabilities.includes(t)) return false;
    const adapters = meta?.adapters || [];
    const byProto = d.adapter ? adapters.find((a) => a.protocol === d.adapter) : null;
    if (byProto) return byProto.supports.includes(t);
    // unknown protocol: every terminal in the catalog can at least carry card/PIN
    return true;
  };

  // ------------------------------------------------------------------ load
  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [m, emps, tpls] = await Promise.all([
        enrollmentsAPI.getMeta(),
        getEmployees(),
        enrollmentsAPI.getTemplates().catch(() => [] as EnrollmentTemplate[]),
      ]);
      setMeta(m);
      setEmployees(emps);
      setTemplates(tpls);
    } catch (err: any) {
      console.error('enrollments load failed:', err);
      setLoadError(err?.message || 'خطا در بارگذاری اطلاعات ثبت شناسایی');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  const refreshTemplates = React.useCallback(async () => {
    try {
      setTemplates(await enrollmentsAPI.getTemplates(
        filterEmployee ? { employeeId: filterEmployee } : undefined));
    } catch (err: any) {
      toast.error('بارگذاری ناموفق', err?.message);
    }
  }, [filterEmployee, toast]);

  React.useEffect(() => {
    if (tab === 'list') refreshTemplates();
  }, [tab, refreshTemplates]);

  // camera lifecycle: stop whenever we leave camera mode / unmount
  const stopCamera = React.useCallback(() => {
    stopCameraRef.current?.();
    stopCameraRef.current = null;
    setCameraOn(false);
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    const video = videoRef.current;
    if (!video) return;
    try {
      stopCameraRef.current = await attachCameraStream(video);
      setCameraOn(true);
    } catch (err: any) {
      stopCamera();
      setCameraError(err?.message || 'خطا در دسترسی به دوربین');
    }
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
    try {
      const shot = captureFromVideo(video);
      setCapture(shot);
      stopCamera();
      toast.success('تصویر ثبت شد', `${Math.round(shot.byteLength / 1024)} کیلوبایت — پس از ذخیره قابل انتقال به همه دستگاه‌ها`);
    } catch (err: any) {
      toast.error('خطا در گرفتن عکس', err?.message);
    }
  };

  // ------------------------------------------------------------ capture
  const isBiometric = ['fingerprint', 'face', 'irisscan', 'palmvein'].includes(form.templateType);
  const needsValue = form.templateType === 'card' || form.templateType === 'password';

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking same file
    if (!file) return;
    try {
      const res = await captureFromFile(file);
      setCapture(res);
      toast.info('فایل بارگذاری شد', `${res.fileName} · ${Math.round(res.byteLength / 1024)} KB`);
    } catch (err: any) {
      toast.error('خطا در خواندن فایل', err?.message);
    }
  };

  const useTestTemplate = () => {
    setCapture(buildTestTemplate(`${form.employeeId}:${form.templateType}:${form.slot}`));
    toast.warning('قالب آزمایشی ساخته شد', 'فقط برای تست مسیر انتقال (dry-run) — اثر بیومتریک واقعی نیست');
  };

  const saveCapture = async () => {
    if (!form.employeeId) return toast.error('کارمند را انتخاب کنید');
    if (isBiometric && !capture) return toast.error('هیچ داده‌ای برای ذخیره وجود ندارد — فایل وارد کنید یا عکس بگیرید');
    if (needsValue && !form.value.trim()) {
      return toast.error(form.templateType === 'card' ? 'شماره کارت را وارد یا اسکن کنید' : 'رمز عبور را وارد کنید');
    }
    setSaving(true);
    try {
      const payload: EnrollmentTemplatePayload = {
        employeeId: Number(form.employeeId),
        templateType: form.templateType as EnrollmentTemplatePayload['templateType'],
        slot: isBiometric && form.templateType !== 'face' ? form.slot : null,
        value: needsValue ? form.value.trim() : null,
        algorithm: capture?.algorithmHint || null,
        quality: form.quality !== '' ? Number(form.quality) : null,
        templateBase64: isBiometric ? capture?.base64 || null : null,
        sourceDeviceId: form.sourceDeviceId ? Number(form.sourceDeviceId) : null,
        status: form.status,
        replace: form.replace,
        fileName: capture?.fileName,
      };
      const res = await enrollmentsAPI.createTemplate(payload);
      toast.success('ثبت شناسایی ذخیره شد', `شناسه قالب: ${res.id} — اکنون می‌توانید آن را به دستگاه‌ها منتقل کنید`);
      setCapture(null);
      setForm({ ...EMPTY_FORM, templateType: form.templateType, slot: form.slot });
      setTab('list');
      refreshTemplates();
    } catch (err: any) {
      toast.error('ذخیره ناموفق', err?.details || err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------- delete
  const confirmDelete = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const tpl = deleting;
    if (!tpl || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await enrollmentsAPI.deleteTemplate(tpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      setSelTemplates((prev) => { const n = new Set(prev); n.delete(tpl.id); return n; });
      toast.success('قالب حذف شد', `${typeLabel(tpl.templateType)} — ${tpl.employeeName || ''}`);
      setDeleting(null);
    } catch (err: any) {
      toast.error('حذف ناموفق', err?.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  // ----------------------------------------------------------- transfer
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) =>
    setter((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const runTransfer = async (dryRun: boolean) => {
    if (selTemplates.size === 0) return toast.error('حداقل یک قالب را انتخاب کنید');
    if (selDevices.size === 0) return toast.error('حداقل یک دستگاه مقصد را انتخاب کنید');
    setBusyTransfer(true);
    setLastOutcome(null);
    try {
      const outcome = await enrollmentsAPI.transfer({
        templateIds: [...selTemplates],
        deviceIds: [...selDevices],
        dryRun,
      });
      setLastOutcome(outcome);
      const ok = outcome.results.filter((r) => r.status === 'success').length;
      const failed = outcome.results.filter((r) => r.status === 'failed').length;
      if (dryRun) {
        toast.info('پیش‌نمایش انتقال آماده شد', `${outcome.results.length} محاسبهٔ payload بدون ارسال به دستگاه‌ها`);
      } else if (failed === 0) {
        toast.success('انتقال انجام شد', `${ok} مورد روی دستگاه‌ها همگام شد`);
      } else {
        toast.warning('انتقال با خطا', `${ok} موفق، ${failed} ناموفق — جزییات در فهرست مشاغل`);
      }
      refreshTemplates();
    } catch (err: any) {
      toast.error('انتقال ناموفق', err?.message);
    } finally {
      setBusyTransfer(false);
    }
  };

  const runPull = async () => {
    if (!pullDeviceId) return toast.error('دستگاه مبدأ را انتخاب کنید');
    setPulling(true);
    try {
      const res = await enrollmentsAPI.pull(Number(pullDeviceId), pullUserId || undefined);
      if (res.ok) {
        toast.success('دریافت از دستگاه', `${res.imported} قالب وارد شد${res.skippedUnknownUser ? ` · ${res.skippedUnknownUser} کاربر ناشناس رد شد` : ''}`);
        refreshTemplates();
      } else {
        toast.warning('دریافت ممکن نشد', res.error || 'پروتکل این دستگاه پشتیبانی نمی‌کند');
      }
    } catch (err: any) {
      toast.error('دریافت ناموفق', err?.message);
    } finally {
      setPulling(false);
    }
  };

  // --------------------------------------------------------------- jobs
  const loadJobs = React.useCallback(async () => {
    setJobsLoading(true);
    try {
      setJobs((await enrollmentsAPI.getJobs(50)) as JobSummary[]);
    } catch (err: any) {
      toast.error('بارگذاری مشاغل', err?.message);
    } finally {
      setJobsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (tab === 'jobs') loadJobs();
  }, [tab, loadJobs]);

  const openJob = async (id: number) => {
    if (expandedJob === id) { setExpandedJob(null); setJobSteps([]); return; }
    setExpandedJob(id);
    setJobSteps([]);
    try {
      const job: any = await enrollmentsAPI.getJob(id);
      setJobSteps(job?.steps || []);
    } catch (err: any) {
      toast.error('بارگذاری جزئیات شغل', err?.message);
    }
  };

  // ================================================================ render
  if (loading) return <LoadingState label="در حال بارگذاری سیستم ثبت شناسایی..." />;
  if (loadError) {
    return (
      <div className="ent-card p-8 text-center space-y-4">
        <AlertTriangle className="mx-auto text-[#BB0000]" size={36} />
        <p className="ent-body">{loadError}</p>
        <button className="ent-btn-primary" onClick={loadAll}>تلاش دوباره</button>
      </div>
    );
  }

  const deviceOptions = meta?.devices || [];
  const slots = meta?.fingerSlots || [];
  const adapters = meta?.adapters || [];
  const selectedEmp = employees.find((e) => String(e.id) === form.employeeId);
  const wiegand = form.templateType === 'card' ? decodeWiegand26(form.value) : null;

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'capture', label: 'ثبت جدید', icon: <Fingerprint size={16} /> },
    { key: 'list', label: 'قالب‌ها', icon: <UsersIcon size={16} /> },
    { key: 'transfer', label: 'انتقال بین دستگاه‌ها', icon: <Send size={16} /> },
    { key: 'jobs', label: 'مشاغل انتقال', icon: <RefreshCw size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="ent-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="ent-icon"><Fingerprint size={20} /></div>
          <div>
            <h3 className="ent-h3">ثبت شناسایی کاربران</h3>
            <p className="ent-caption">انگشت، چهره، عنبیه، کارت و رمز — یک‌بار ثبت، انتقال به هر دستگاه</p>
          </div>
        </div>
        <button className="ent-btn-secondary flex items-center gap-2" onClick={loadAll}>
          <RefreshCw size={15} /> نوسازی
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`ent-btn-${tab === t.key ? 'primary' : 'secondary'} flex items-center gap-2 !py-2`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ============================ CAPTURE TAB ============================ */}
      {tab === 'capture' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="ent-card p-5 space-y-4">
            <h4 className="ent-h3">۱. کاربر و نوع شناسایی</h4>

            <SearchableDropdown
              label={<span className="ent-label">کارمند *</span>}
              options={employees.map((e) => ({
                value: String(e.id),
                label: e.name,
                sublabel: `کد پرسنلی ${e.personnelCode}`,
              }))}
              value={form.employeeId}
              onChange={(v) => setField('employeeId', v)}
              placeholder="جستجوی کارمند..."
            />

            {/* enrollment device picker — choose the terminal that captures the credential */}
            <div>
              <label className="ent-label block mb-1">دستگاه ثبت‌کننده (اختیاری)</label>
              <select className="ent-input" value={form.sourceDeviceId} onChange={(e) => onPickSourceDevice(e.target.value)}>
                <option value="">ثبت از طریق مرورگر (بدون دستگاه)</option>
                {deviceOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.protocol}{d.capabilities && d.capabilities.length > 0 ? ` · ${capabilityLabelsFa(d.capabilities)}` : ''}
                  </option>
                ))}
              </select>
              {selectedSourceDevice && (
                <p className="ent-caption mt-1 flex items-center gap-1">
                  <Info size={13} />
                  این دستگاه می‌تواند این نوع شناسایی‌ها را ذخیره کند: {capabilityLabelsFa(selectedSourceDevice.capabilities)}
                  {availableTemplateTypes.length < (meta?.templateTypes || TEMPLATE_FALLBACK).length && ' — گزینه‌های سازگار در پایین نمایش داده می‌شوند'}
                </p>
              )}
              {!selectedSourceDevice && deviceOptions.length === 0 && (
                <p className="ent-caption mt-1">هنوز دستگاهی ثبت نشده است — از صفحه «دستگاه‌ها» یک پایانه اضافه کنید تا بتوانید مستقیم با آن ثبت انجام دهید.</p>
              )}
            </div>

            <div>
              <span className="ent-label block mb-2">نوع شناسایی</span>
              <div className="flex flex-wrap gap-2">
                {(meta?.templateTypes || Object.keys(TYPE_LABELS_FA)).map((t) => {
                  const incompatible = selectedSourceDevice != null && !availableTemplateTypes.includes(t);
                  if (incompatible) return null;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onPickTemplateType(t)}
                      className={`px-3 py-1.5 rounded border text-sm flex items-center gap-1.5 ${
                        form.templateType === t
                          ? 'border-[#0A6ED1] bg-[#E1F1FF] text-[#0A6ED1] font-semibold'
                          : 'border-[#BDCCD8] bg-white text-[#556573]'
                      }`}
                    >
                    {t === 'fingerprint' && <Fingerprint size={14} />}
                    {t === 'face' && <Camera size={14} />}
                    {t === 'irisscan' && <Info size={14} />}
                    {t === 'palmvein' && <Info size={14} />}
                    {t === 'card' && <CreditCard size={14} />}
                    {t === 'password' && <KeyRound size={14} />}
                    {typeLabel(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            {['fingerprint', 'irisscan', 'palmvein'].includes(form.templateType) && (
              <div>
                <label className="ent-label block mb-1">انگشت / موقعیت</label>
                <select className="ent-input" value={form.slot} onChange={(e) => setField('slot', e.target.value)}>
                  {slots.map((s) => <option key={s.id} value={s.id}>{s.labelFa}</option>)}
                </select>
              </div>
            )}

            {form.templateType === 'card' && (
              <div>
                <label className="ent-label block mb-1">شماره کارت *</label>
                <input
                  className="ent-input" dir="ltr"
                  placeholder="با کارت‌خوان بکشید یا شماره را وارد کنید"
                  value={form.value}
                  onChange={(e) => setField('value', normalizeCardNumber(e.target.value))}
                />
                {wiegand && (
                  <p className="ent-caption mt-1" dir="ltr">
                    Wiegand-26 → facility {wiegand.facility}, card {wiegand.card}
                  </p>
                )}
                {hidReaderPresent && (
                  <button
                    type="button"
                    className="ent-btn-secondary mt-2 flex items-center gap-2 disabled:opacity-50"
                    onClick={captureViaHidReader}
                    disabled={cardReading}
                  >
                    <CreditCard size={15} className={cardReading ? 'animate-pulse' : ''} />
                    {cardReading ? 'کارت را نزدیک خواننده بگیرید...' : 'خواندن از کارت‌خوان USB این کامپیوتر'}
                  </button>
                )}
                <p className="ent-caption mt-1">
                  کارت‌خوان‌های USB HID به‌عنوان صفحه‌کلید عمل می‌کنند — کافی است فیلد بالا تمرکز داشته باشد و کارت بکشید.
                  {bridge?.capabilities.card.hidAvailable ? '' : ' (کارت‌خوان‌های اختصاصی USB با سرویس محلی enrollment-bridge پشتیبانی می‌شوند.)'}
                </p>
              </div>
            )}

            {form.templateType === 'password' && (
              <div>
                <label className="ent-label block mb-1">رمز / پین *</label>
                <input
                  className="ent-input" dir="ltr" type="text" inputMode="numeric" maxLength={10}
                  placeholder="مثلاً 123456"
                  value={form.value}
                  onChange={(e) => setField('value', formatPin(e.target.value))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ent-label block mb-1">کیفیت (اختیاری)</label>
                <input
                  className="ent-input" type="number" min={0} max={100}
                  value={form.quality}
                  onChange={(e) => setField('quality', e.target.value)}
                  placeholder="۰ تا ۱۰۰"
                />
              </div>
              <div>
                <label className="ent-label block mb-1">وضعیت</label>
                <select className="ent-input" value={form.status} onChange={(e) => setField('status', e.target.value as any)}>
                  <option value="active">فعال</option>
                  <option value="draft">پیش‌نویس</option>
                  <option value="disabled">غیرفعال</option>
                </select>
              </div>
            </div>

            <div>
              <label className="ent-label block mb-1">دستگاه مبدأ (اختیاری)</label>
              <select className="ent-input" value={form.sourceDeviceId} onChange={(e) => setField('sourceDeviceId', e.target.value)}>
                <option value="">ثبت از طریق مرورگر</option>
                {deviceOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.replace} onChange={(e) => setField('replace', e.target.checked)} />
              جایگزینی قالب موجود با همین کاربر/نوع/انگشت
            </label>
          </div>

          {/* capture panel */}
          <div className="ent-card p-5 space-y-4">
            <h4 className="ent-h3">۲. برداشت داده</h4>

            {!isBiometric && (
              <div className="rounded border border-[#E8EFF5] bg-[#F5FAFF] p-4 text-sm text-[#354A5F]">
                این نوع شناسایی نیاز به داده بیومتریک ندارد؛ مقدار واردشده در مرحله قبل مستقیماً ذخیره و به دستگاه‌ها منتقل می‌شود.
              </div>
            )}

            {isBiometric && (
              <>
                {form.templateType === 'face' ? (
                  <div className="space-y-3">
                    <div className="relative rounded overflow-hidden bg-black aspect-video">
                      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                      {!cameraOn && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                          <Camera size={32} />
                          <p className="text-sm">برای شروع دوربین دکمه را بزنید</p>
                        </div>
                      )}
                    </div>
                    {cameraError && <p className="ent-caption text-[#BB0000]">{cameraError}</p>}
                    <div className="flex gap-2 flex-wrap">
                      {!cameraOn
                        ? <button type="button" className="ent-btn-secondary flex items-center gap-2" onClick={startCamera}><Camera size={15} /> روشن کردن دوربین</button>
                        : <>
                            <button type="button" className="ent-btn-primary flex items-center gap-2" onClick={snapPhoto}><CheckCircle2 size={15} /> گرفتن عکس</button>
                            <button type="button" className="ent-btn-secondary flex items-center gap-2" onClick={stopCamera}><X size={15} /> خاموش کردن</button>
                          </>}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-[#BDCCD8] p-4 text-sm space-y-3">
                    {sdkAvailableForType ? (
                      <>
                        <p className="text-[#1D6625] font-semibold flex items-center gap-2">
                          <CheckCircle2 size={15} />
                          حسگر محلی از طریق سرویس پل آماده است ({bridge?.capabilities.sdk.active})
                        </p>
                        <p className="text-[#556573]">
                          با دکمهٔ زیر، سرویس محلی روی این کامپیوتر SDK سازنده را اجرا کرده و قالب واقعی را از
                          حسگر می‌گیرد؛ سپس همان قالب به مخزن عمومی اضافه و به همه دستگاه‌ها منتقل می‌شود.
                        </p>
                        <button
                          type="button"
                          className="ent-btn-primary flex items-center gap-2 disabled:opacity-50"
                          onClick={captureViaSdk}
                          disabled={sdkCapturing}
                        >
                          {sdkCapturing ? <RefreshCw size={15} className="animate-spin" /> : <Fingerprint size={15} />}
                          {sdkCapturing ? 'در حال گرفتن از حسگر... انگشت را روی دستگاه نگه دارید' : 'گرفتن قالب از حسگر محلی'}
                        </button>
                      </>
                    ) : (
                      <p className="text-[#556573]">
                        مرورگر نمی‌تواند مستقیماً حسگر اثرانگشت/عنبیه را بخواند. فایل قالب خروجی‌گرفته‌شده از دستگاه ثبت
                        (‏.dat / ‏.tpl / تصویر) را وارد کنید تا در مخزن عمومی ذخیره و به همه دستگاه‌ها منتقل شود.
                        برای گرفتن مستقیم از حسگر، سرویس محلی enrollment-bridge را روی کامپیوتر متصل به حسگر اجرا کنید.
                      </p>
                    )}
                    <input ref={fileInputRef} type="file" accept=".dat,.tpl,.bin,.txt,image/*" className="hidden" onChange={onFilePicked} />
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" className="ent-btn-secondary flex items-center gap-2" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={15} /> وارد کردن فایل قالب
                      </button>
                      <button type="button" className="ent-btn-secondary flex items-center gap-2" onClick={useTestTemplate}>
                        <Info size={15} /> قالب آزمایشی (dry-run)
                      </button>
                    </div>
                  </div>
                )}

                {capture && (
                  <div className="rounded border border-[#CFE9D5] bg-[#F2FBF4] p-3 flex items-start gap-3">
                    {capture.previewUrl && (
                      <img src={capture.previewUrl} alt="preview" className="w-20 h-14 object-cover rounded border border-[#E5E5E5]" />
                    )}
                    <div className="text-sm flex-1">
                      <p className="font-semibold text-[#1D6625]">داده آماده ذخیره است</p>
                      <p className="ent-caption" dir="ltr">
                        {capture.fileName || 'webcam-capture.jpg'} · {Math.round(capture.byteLength / 1024)} KB · {capture.algorithmHint}
                      </p>
                    </div>
                    <button type="button" className="text-[#556573] hover:text-[#BB0000]" onClick={() => setCapture(null)} aria-label="remove">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="pt-2 border-t border-[#E5E5E5]">
              <button
                className="ent-btn-success w-full flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={saveCapture}
                disabled={saving}
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'در حال ذخیره...' : 'ذخیره ثبت شناسایی'}
              </button>
              {selectedEmp && (
                <p className="ent-caption mt-2 text-center">
                  {selectedEmp.name} · {typeLabel(form.templateType)}
                  {isBiometric && form.templateType !== 'face' ? ` · ${slotLabel(form.slot)}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* local enrollment bridge status strip */}
          <div className="lg:col-span-2 ent-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="ent-label flex items-center gap-2">
                سرویس محلی ثبت‌نام (enrollment-bridge)
                <span className={`ent-badge ${bridge ? 'ent-badge-success' : 'ent-badge-warning'}`}>
                  {bridge ? `متصل — ${bridge.hostname}` : 'قطع — حالت مرورگری فعال است'}
                </span>
              </h4>
              <button
                className="ent-btn-secondary flex items-center gap-2 disabled:opacity-50"
                onClick={onRescanBridge}
                disabled={bridgeBusy}
              >
                <RefreshCw size={15} className={bridgeBusy ? 'animate-spin' : ''} /> اتصال مجدد / بازجویی سخت‌افزار
              </button>
            </div>

            {bridge && (
              <div className="flex flex-wrap gap-2 text-sm">
                {bridge.capabilities.sdk.providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={p.status !== 'ready'}
                    title={p.detail || undefined}
                    onClick={() => onActivateProvider(p)}
                    className={`px-3 py-1.5 rounded border text-xs flex items-center gap-1.5 disabled:opacity-60 ${
                      p.active
                        ? 'border-[#1D6625] bg-[#F2FBF4] text-[#1D6625] font-semibold'
                        : p.status === 'ready'
                          ? 'border-[#BDCCD8] bg-white text-[#354A5F] hover:border-[#0A6ED1]'
                          : 'border-[#E5E5E5] bg-[#F7F8FA] text-[#8BA0B0]'
                    }`}
                  >
                    {p.status === 'ready' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {p.label}
                    <span className="ent-caption">
                      {p.status === 'ready' ? (p.active ? 'فعال' : 'آماده') : p.status === 'missing_dll' ? 'DLL نصب نیست' : p.status === 'missing_ffi' ? 'FFI نصب نیست' : 'خطا'}
                    </span>
                  </button>
                ))}
                {bridge.capabilities.card.readers.map((r, i) => (
                  <span key={`${r.path}-${i}`} className="ent-badge ent-badge-neutral" title={r.path}>
                    کارت‌خوان USB: {r.matched || r.product || 'ناشناس'}
                  </span>
                ))}
              </div>
            )}

            {!bridge && (
              <p className="ent-caption">
                برای ثبت مستقیم اثرانگشت/عنبیه با حسگرهای USB یا کارت‌خوان‌های اختصاصی، پوشهٔ
                <code dir="ltr"> enrollment-bridge </code>را روی کامپیوتر متصل به حسگر اجرا کنید
                (<code dir="ltr">npm start</code> یا نصب به‌عنوان سرویس ویندوز با
                <code dir="ltr"> npm run install:service</code>). بدون این سرویس، ثبت از طریق دوربین،
                وارد کردن فایل و کارت‌خوان صفحه‌کلیدی همچنان کار می‌کند.
              </p>
            )}
          </div>

          {/* adapter capability strip */}
          <div className="lg:col-span-2 ent-card p-4">
            <h4 className="ent-label mb-2">موتور انتقال — سازگاری پروتکل‌ها</h4>
            <div className="flex flex-wrap gap-2">
              {adapters.map((a) => (
                <span key={a.protocol} className="ent-badge ent-badge-neutral" title={a.supports.join(', ')}>
                  {a.label} · {a.canPush ? 'ارسال فعال' : 'payload-only'}{a.canPull ? ' · دریافت' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================== LIST TAB ============================= */}
      {tab === 'list' && (
        <div className="ent-card overflow-hidden">
          <div className="p-4 border-b border-[#E5E5E5] flex flex-wrap gap-3 items-end">
            <div className="w-64">
              <SearchableDropdown
                label={<span className="ent-label">فیلتر کارمند</span>}
                options={[{ value: '', label: 'همه کارکنان' }, ...employees.map((e) => ({ value: String(e.id), label: e.name }))]}
                value={filterEmployee}
                onChange={setFilterEmployee}
              />
            </div>
            <div>
              <label className="ent-label block mb-1">نوع</label>
              <select className="ent-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">همه</option>
                {Object.entries(TYPE_LABELS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button className="ent-btn-secondary" onClick={refreshTemplates}>اعمال</button>
          </div>

          {templates.length === 0 ? (
            <EmptyState message="هنوز هیچ ثبت شناسایی‌ای وجود ندارد" hint="از تب «ثبت جدید» اولین قالب را بسازید" />
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>کارمند</th><th>نوع</th><th>انگشت/مقدار</th><th>الگوریتم</th>
                  <th>کیفیت</th><th>وضعیت</th><th>همگام‌سازی دستگاه‌ها</th><th></th>
                </tr>
              </thead>
              <tbody>
                {templates
                  .filter((t) => !filterType || t.templateType === filterType)
                  .map((t) => {
                    const synced = t.devices.filter((d) => d.syncStatus === 'synced').length;
                    return (
                      <tr key={t.id}>
                        <td>
                          <p className="font-semibold">{t.employeeName}</p>
                          <p className="ent-caption" dir="ltr">{t.personnelCode}</p>
                        </td>
                        <td>{typeLabel(t.templateType)}</td>
                        <td dir="ltr">
                          {t.templateType === 'card' || t.templateType === 'password'
                            ? (t.templateType === 'password' ? '•'.repeat(Math.min((t.value || '').length, 8)) : t.value)
                            : slotLabel(t.slot)}
                        </td>
                        <td className="ent-caption" dir="ltr">{t.algorithm || '—'}</td>
                        <td>{t.quality ?? '—'}</td>
                        <td>
                          <span className={`ent-badge ${t.status === 'active' ? 'ent-badge-success' : 'ent-badge-neutral'}`}>
                            {STATUS_LABELS_FA[t.status] || t.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1" title={t.devices.map((d) => `${d.deviceName}: ${SYNC_LABELS_FA[d.syncStatus] || d.syncStatus}`).join('\n')}>
                            {t.devices.length === 0 && <span className="ent-caption">روی هیچ دستگاهی نیست</span>}
                            {t.devices.map((d) => (
                              <span key={d.deviceId} className={`ent-badge ${
                                d.syncStatus === 'synced' ? 'ent-badge-success'
                                  : d.syncStatus === 'failed' ? 'ent-badge-danger'
                                    : 'ent-badge-warning'}`}
                              >
                                {d.deviceName}: {SYNC_LABELS_FA[d.syncStatus] || d.syncStatus}
                              </span>
                            ))}
                            {synced > 0 && <span className="ent-caption">({synced}/{deviceOptions.length})</span>}
                          </div>
                        </td>
                        <td>
                          <button
                            className="text-[#BB0000] hover:bg-[#FFF5F5] p-2 rounded"
                            onClick={() => setDeleting(t)}
                            aria-label="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ============================ TRANSFER TAB =========================== */}
      {tab === 'transfer' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="ent-card p-5 space-y-3">
            <h4 className="ent-h3">قالب‌های منبع</h4>
            {templates.length === 0 && <p className="ent-caption">ابتدا در تب «ثبت جدید» قالب بسازید.</p>}
            <div className="max-h-80 overflow-y-auto space-y-1">
              {templates.map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-2 rounded hover:bg-[#EBF5FF] cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selTemplates.has(t.id)}
                    onChange={() => toggleSet(setSelTemplates, t.id)}
                  />
                  <span className="font-semibold">{t.employeeName}</span>
                  <span className="ent-badge ent-badge-neutral">{typeLabel(t.templateType)}</span>
                  {t.slot && <span className="ent-caption">{slotLabel(t.slot)}</span>}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="ent-btn-secondary !py-1.5 text-xs" onClick={() => setSelTemplates(new Set(templates.map((t) => t.id)))}>انتخاب همه</button>
              <button className="ent-btn-secondary !py-1.5 text-xs" onClick={() => setSelTemplates(new Set())}>پاک کردن</button>
            </div>
          </div>

          <div className="ent-card p-5 space-y-3">
            <h4 className="ent-h3">دستگاه‌های مقصد</h4>
            {deviceOptions.length === 0 && <p className="ent-caption">هیچ دستگاهی ثبت نشده است.</p>}
            <div className="max-h-80 overflow-y-auto space-y-1">
              {deviceOptions.map((d) => {
                const adapter = adapters.find((a) => a.protocol === d.adapter);
                return (
                  <label key={d.id} className="flex items-center gap-2 p-2 rounded hover:bg-[#EBF5FF] cursor-pointer text-sm">
                    <input type="checkbox" checked={selDevices.has(d.id)} onChange={() => toggleSet(setSelDevices, d.id)} />
                    <span className="font-semibold">{d.name}</span>
                    <span className="ent-caption">{d.protocol}</span>
                    <span className={`ent-badge ${d.status === 'active' ? 'ent-badge-success' : 'ent-badge-warning'}`}>
                      {DEVICE_STATUS_FA[d.status ?? ''] || d.status}
                    </span>
                    {adapter && <span className="ent-caption mr-auto" title={adapter.label}>{adapter.canPush ? '⇄' : '⤳'}</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2 border-t border-[#E5E5E5] flex-wrap">
              <button
                className="ent-btn-primary flex items-center gap-2 disabled:opacity-50"
                onClick={() => runTransfer(false)}
                disabled={busyTransfer}
              >
                <Send size={15} /> {busyTransfer ? 'در حال انتقال...' : 'انتقال واقعی'}
              </button>
              <button
                className="ent-btn-secondary flex items-center gap-2 disabled:opacity-50"
                onClick={() => runTransfer(true)}
                disabled={busyTransfer}
              >
                <Info size={15} /> پیش‌نمایش (بدون ارسال)
              </button>
            </div>

            {lastOutcome && (
              <div className="rounded border border-[#E5E5E5] p-3 text-sm space-y-1 max-h-48 overflow-y-auto">
                <p className="font-semibold">نتیجه شغل #{lastOutcome.jobId} — {lastOutcome.status}</p>
                {lastOutcome.results.map((r, i) => (
                  <p key={i} className="ent-caption flex items-center gap-2" dir="rtl">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      r.status === 'success' ? 'bg-[#1D6625]' : r.status === 'failed' ? 'bg-[#BB0000]' : 'bg-[#C17900]'}`} />
                    قالب #{r.templateId} ← دستگاه #{r.deviceId}: {r.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* pull from device */}
          <div className="lg:col-span-2 ent-card p-5">
            <h4 className="ent-h3 flex items-center gap-2"><Download size={18} /> دریافت از دستگاه (مهاجرت)</h4>
            <p className="ent-caption mb-3">
              قالب‌هایی که همین حالا روی یک دستگاه ثبت شده‌اند به مخزن عمومی وارد می‌شوند تا بتوان آن‌ها را به بقیه دستگاه‌ها منتقل کرد.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-64">
                <label className="ent-label block mb-1">دستگاه مبدأ</label>
                <select className="ent-input" value={pullDeviceId} onChange={(e) => setPullDeviceId(e.target.value)}>
                  <option value="">انتخاب...</option>
                  {deviceOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.protocol})</option>)}
                </select>
              </div>
              <div className="w-48">
                <label className="ent-label block mb-1">شناسه کاربر روی دستگاه (اختیاری)</label>
                <input className="ent-input" dir="ltr" value={pullUserId} onChange={(e) => setPullUserId(e.target.value)} placeholder="PIN / userId" />
              </div>
              <button className="ent-btn-secondary flex items-center gap-2 disabled:opacity-50" onClick={runPull} disabled={pulling}>
                {pulling ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />} دریافت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== JOBS TAB ============================= */}
      {tab === 'jobs' && (
        <div className="ent-card overflow-hidden">
          <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
            <h4 className="ent-h3">تاریخچه مشاغل انتقال</h4>
            <button className="ent-btn-secondary flex items-center gap-2" onClick={loadJobs}>
              <RefreshCw size={15} className={jobsLoading ? 'animate-spin' : ''} /> نوسازی
            </button>
          </div>
          {jobs.length === 0 ? (
            <EmptyState message="هنوز شغلی اجرا نشده است" hint="از تب «انتقال بین دستگاه‌ها» اولین انتقال را انجام دهید" />
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr><th>#</th><th>نوع</th><th>وضعیت</th><th>مراحل</th><th>خطاها</th><th>آغاز</th><th></th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <React.Fragment key={j.id}>
                    <tr>
                      <td dir="ltr">{j.id}</td>
                      <td>{j.jobType === 'push' ? 'ارسال' : j.jobType}</td>
                      <td>
                        <span className={`ent-badge ${
                          j.status === 'completed' ? 'ent-badge-success'
                            : j.status === 'failed' ? 'ent-badge-danger'
                              : j.status === 'partial' ? 'ent-badge-warning' : 'ent-badge-info'}`}>
                          {j.status}
                        </span>
                      </td>
                      <td dir="ltr">{j.doneSteps}/{j.totalSteps}</td>
                      <td dir="ltr">{j.errorCount}</td>
                      <td className="ent-caption" dir="ltr">{j.startedAt ? new Date(j.startedAt).toLocaleString('fa-IR') : '—'}</td>
                      <td>
                        <button className="ent-btn-secondary !py-1 text-xs" onClick={() => openJob(j.id)}>
                          {expandedJob === j.id ? 'بستن' : 'جزئیات'}
                        </button>
                      </td>
                    </tr>
                    {expandedJob === j.id && (
                      <tr>
                        <td colSpan={7} className="!py-3 bg-[#F7F8FA]">
                          {jobSteps.length === 0 ? <p className="ent-caption">مرحله‌ای ثبت نشده است.</p> : (
                            <ul className="space-y-1 text-sm">
                              {jobSteps.map((s: any) => (
                                <li key={s.id} className="flex items-center gap-2">
                                  <span className={`inline-block w-2 h-2 rounded-full ${
                                    s.status === 'success' ? 'bg-[#1D6625]' : s.status === 'failed' ? 'bg-[#BB0000]' : 'bg-[#C17900]'}`} />
                                  <b>{s.deviceName || `دستگاه ${s.deviceId}`}</b>
                                  <span className="ent-caption">قالب #{s.templateId}</span>
                                  <span className="ent-caption">{s.message}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* delete confirm */}
      <ConfirmDialog
        isOpen={!!deleting}
        title="حذف ثبت شناسایی"
        message={deleting
          ? `قالب «${typeLabel(deleting.templateType)}» برای ${deleting.employeeName} حذف شود؟ کپی‌های روی دستگاه‌ها نیز از ردیابی خارج می‌شوند.`
          : ''}
        confirmText="حذف"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
