import React from 'react';
import { Building2, Save, Loader2 } from 'lucide-react';
import { getCompanyInfo, updateCompanyInfo } from '../utils/storage';
import { useToast } from './Toast';

export default function CompanyInfo() {
  const toast = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    workStartTime: '08:00',
    workEndTime: '17:00',
    lateThreshold: '15'
  });

  React.useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    try {
      setLoading(true);
      const info = await getCompanyInfo();
      if (info) {
        setFormData({
          name: info.name || '',
          address: info.address || '',
          phone: info.phone || '',
          email: info.email || '',
          website: info.website || '',
          workStartTime: info.workStartTime || '08:00',
          workEndTime: info.workEndTime || '17:00',
          lateThreshold: info.lateThreshold || '15'
        });
      }
    } catch (error) {
      console.error('Error loading company info:', error);
      toast.error('خطا در بارگذاری اطلاعات شرکت');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.warning('نام شرکت الزامی است');
      return;
    }

    try {
      setSaving(true);
      await updateCompanyInfo(formData);
      toast.success('اطلاعات شرکت با موفقیت به‌روزرسانی شد');
    } catch (error) {
      console.error('Error saving company info:', error);
      toast.error('خطا در ذخیره اطلاعات شرکت');
    } finally {
      setSaving(false);
    }
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
      <div className="animate-fade-in">
        <h2 className="ent-h1 mb-1">اطلاعات شرکت</h2>
        <p className="ent-body">مدیریت اطلاعات عمومی شرکت و ساعات کاری</p>
      </div>

      {/* Company Information */}
      <div className="ent-card p-5 animate-fade-in stagger-1">
        <div className="flex items-center gap-3 mb-5">
          <div className="ent-icon">
            <Building2 size={20} />
          </div>
          <h3 className="ent-h3">اطلاعات پایه</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="ent-form-group md:col-span-2">
            <label className="ent-form-label">
              نام شرکت <span className="ent-form-required">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="ent-input"
              placeholder="نام شرکت را وارد کنید"
            />
          </div>

          <div className="ent-form-group md:col-span-2">
            <label className="ent-form-label">آدرس</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="ent-input resize-none h-20"
              placeholder="آدرس کامل شرکت"
            />
          </div>

          <div className="ent-form-group">
            <label className="ent-form-label">تلفن</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="ent-input"
              placeholder="021-12345678"
              dir="ltr"
            />
          </div>

          <div className="ent-form-group">
            <label className="ent-form-label">ایمیل</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="ent-input"
              placeholder="info@company.com"
              dir="ltr"
            />
          </div>

          <div className="ent-form-group md:col-span-2">
            <label className="ent-form-label">وب‌سایت</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="ent-input"
              placeholder="https://company.com"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* Work Hours */}
      <div className="ent-card p-5 animate-fade-in stagger-2">
        <h3 className="ent-h3 mb-5">ساعات کاری</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ent-form-group">
            <label className="ent-form-label">ساعت شروع کار</label>
            <input
              type="time"
              value={formData.workStartTime}
              onChange={(e) => setFormData({ ...formData, workStartTime: e.target.value })}
              className="ent-input"
              dir="ltr"
            />
          </div>

          <div className="ent-form-group">
            <label className="ent-form-label">ساعت پایان کار</label>
            <input
              type="time"
              value={formData.workEndTime}
              onChange={(e) => setFormData({ ...formData, workEndTime: e.target.value })}
              className="ent-input"
              dir="ltr"
            />
          </div>

          <div className="ent-form-group">
            <label className="ent-form-label">آستانه تأخیر (دقیقه)</label>
            <input
              type="number"
              value={formData.lateThreshold}
              onChange={(e) => setFormData({ ...formData, lateThreshold: e.target.value })}
              className="ent-input"
              placeholder="15"
              dir="ltr"
            />
            <p className="ent-caption mt-1">
              ورود بعد از این زمان به عنوان تأخیر ثبت می‌شود
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end animate-fade-in stagger-3">
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
            <>
              <Save size={16} />
              <span>ذخیره تغییرات</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
