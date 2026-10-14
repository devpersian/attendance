import React from 'react';
import { Employee, LeaveRequest } from '../types';
import { getEmployees, getLeaves, addLeave, updateLeave } from '../utils/storage';
import { toPersianDigits, formatJalaliDate } from '../utils/jalali';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import PersianDatePicker from './PersianDatePicker';
import SearchableDropdown from './SearchableDropdown';
import { CalendarOff, Plus, Check, X, Clock, Loader2, Calendar, AlertCircle, RefreshCw, User } from 'lucide-react';

export default function Leaves() {
  const toast = useToast();
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [showModal, setShowModal] = React.useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = React.useState(false);
  const [leaveToApprove, setLeaveToApprove] = React.useState<{ id: string; status: 'approved' | 'rejected' } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formData, setFormData] = React.useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    type: 'annual' as LeaveRequest['type'],
    description: ''
  });

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      console.log('📊 Loading leaves data...', { forceRefresh });
      
      let emps, lvs;
      if (forceRefresh) {
        [emps, lvs] = await Promise.all([getEmployees(), getLeaves()]);
      } else {
        [emps, lvs] = await Promise.all([getEmployees(), getLeaves()]);
      }
      
      console.log('✅ Loaded employees:', emps.length, 'leaves:', lvs.length);
      setEmployees(emps);
      setLeaves(lvs);
    } catch (error) {
      console.error('❌ Error loading ', error);
      toast.error('خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    console.log('🔄 Manual refresh triggered');
    loadData(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.employeeId) {
      newErrors.employeeId = 'انتخاب کارمند الزامی است';
    }
    
    if (!formData.startDate.trim()) {
      newErrors.startDate = 'تاریخ شروع الزامی است';
    } else if (!/^\d{4}\/\d{2}\/\d{2}$/.test(formData.startDate)) {
      newErrors.startDate = 'فرمت تاریخ باید 1403/01/15 باشد';
    }
    
    if (!formData.endDate.trim()) {
      newErrors.endDate = 'تاریخ پایان الزامی است';
    } else if (!/^\d{4}\/\d{2}\/\d{2}$/.test(formData.endDate)) {
      newErrors.endDate = 'فرمت تاریخ باید 1403/01/15 باشد';
    }
    
    if (formData.startDate && formData.endDate) {
      if (formData.startDate > formData.endDate) {
        newErrors.endDate = 'تاریخ پایان باید بعد از تاریخ شروع باشد';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setFormData({ 
      employeeId: '', 
      startDate: '', 
      endDate: '', 
      type: 'annual', 
      description: '' 
    });
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      const newLeave: LeaveRequest = {
        id: Date.now().toString(),
        employeeId: formData.employeeId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        type: formData.type,
        status: 'pending',
        description: formData.description
      };

      await addLeave(newLeave);
      await loadData();
      setShowModal(false);
      toast.success('درخواست مرخصی با موفقیت ثبت شد');
    } catch (error) {
      console.error('Error creating leave:', error);
      toast.error('خطا در ثبت درخواست مرخصی');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusClick = (id: string, status: 'approved' | 'rejected') => {
    setLeaveToApprove({ id, status });
    setShowStatusConfirm(true);
  };

  const handleStatusConfirm = async () => {
    if (!leaveToApprove) return;
    
    try {
      await updateLeave(leaveToApprove.id, { status: leaveToApprove.status });
      await loadData();
      
      if (leaveToApprove.status === 'approved') {
        toast.success('درخواست مرخصی تأیید شد');
      } else {
        toast.warning('درخواست مرخصی رد شد');
      }
    } catch (error) {
      console.error('Error updating leave status:', error);
      toast.error('خطا در به‌روزرسانی وضعیت');
    } finally {
      setShowStatusConfirm(false);
      setLeaveToApprove(null);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'sick': return 'استعلاجی';
      case 'annual': return 'سالانه';
      case 'personal': return 'شخصی';
      case 'unpaid': return 'بدون حقوق';
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { 
        label: 'در انتظار', 
        class: 'ent-badge-warning',
        icon: <Clock size={12} />
      };
      case 'approved': return { 
        label: 'تأیید شده', 
        class: 'ent-badge-success',
        icon: <Check size={12} />
      };
      case 'rejected': return { 
        label: 'رد شده', 
        class: 'ent-badge-danger',
        icon: <X size={12} />
      };
      default: return { 
        label: status, 
        class: 'ent-badge-neutral',
        icon: null
      };
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

  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h2 className="ent-h1 mb-1">مرخصی‌ها</h2>
          <p className="ent-body">درخواست و پیگیری مرخصی کارکنان</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="ent-btn-secondary flex items-center gap-2"
            title="بارگذاری مجدد"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>بارگذاری مجدد</span>
          </button>
          <button
            onClick={handleAdd}
            className="ent-btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            <span>درخواست مرخصی</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="ent-tile animate-fade-in stagger-1">
          <div className="flex items-center gap-3">
            <div className="ent-icon ent-icon-warning">
              <Clock size={20} />
            </div>
            <div>
              <p className="ent-kpi">{toPersianDigits(pendingCount)}</p>
              <p className="ent-label">در انتظار بررسی</p>
            </div>
          </div>
        </div>
        <div className="ent-tile animate-fade-in stagger-2">
          <div className="flex items-center gap-3">
            <div className="ent-icon ent-icon-success">
              <Check size={20} />
            </div>
            <div>
              <p className="ent-kpi">{toPersianDigits(approvedCount)}</p>
              <p className="ent-label">تأیید شده</p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaves List */}
      <div className="space-y-3">
        {leaves.length === 0 ? (
          <div className="ent-card p-12 text-center animate-fade-in stagger-3">
            <CalendarOff size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body mb-2">هنوز درخواست مرخصی ثبت نشده است</p>
            <button
              onClick={handleAdd}
              className="ent-btn-primary mt-3"
            >
              اولین درخواست مرخصی را ثبت کنید
            </button>
          </div>
        ) : (
          leaves.slice().reverse().map((leave, idx) => {
            const emp = employees.find(e => e.id === leave.employeeId);
            const statusBadge = getStatusBadge(leave.status);
            
            return (
              <div 
                key={leave.id} 
                className={`ent-card p-5 animate-fade-in stagger-${Math.min(idx + 3, 6)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="ent-h3">{emp?.name || 'نامشخص'}</h4>
                      <span className={`ent-badge ${statusBadge.class}`}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="ent-caption mb-1">از تاریخ</p>
                        <p className="ent-body font-medium">{formatJalaliDate(leave.startDate)}</p>
                      </div>
                      <div>
                        <p className="ent-caption mb-1">تا تاریخ</p>
                        <p className="ent-body font-medium">{formatJalaliDate(leave.endDate)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <span className="ent-badge ent-badge-info">
                        {getTypeLabel(leave.type)}
                      </span>
                    </div>
                    
                    {leave.description && (
                      <div className="mt-3 p-3 bg-[#F7F8FA] rounded">
                        <p className="ent-caption mb-1">توضیحات:</p>
                        <p className="ent-body text-sm">{leave.description}</p>
                      </div>
                    )}
                  </div>

                  {leave.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleStatusClick(leave.id, 'approved')}
                        className="ent-btn-success text-sm py-2 px-4 flex items-center gap-2"
                      >
                        <Check size={16} />
                        <span>تأیید</span>
                      </button>
                      <button
                        onClick={() => handleStatusClick(leave.id, 'rejected')}
                        className="ent-btn-danger text-sm py-2 px-4 flex items-center gap-2"
                      >
                        <X size={16} />
                        <span>رد</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">درخواست مرخصی جدید</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body space-y-4">
              <div className="ent-form-group">
                <SearchableDropdown
                  label={
                    <span>
                      کارمند <span className="ent-form-required">*</span>
                    </span>
                  }
                  options={employees.map(emp => ({
                    value: emp.id,
                    label: emp.name || 'نامشخص',
                    sublabel: emp.personnelCode || '---'
                  }))}
                  value={formData.employeeId}
                  onChange={(value) => {
                    setFormData({ ...formData, employeeId: value });
                    if (errors.employeeId) setErrors({ ...errors, employeeId: '' });
                  }}
                  placeholder="انتخاب کارمند"
                  error={errors.employeeId}
                />
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">نوع مرخصی</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as LeaveRequest['type'] })}
                  className="ent-input"
                >
                  <option value="annual">سالانه</option>
                  <option value="sick">استعلاجی</option>
                  <option value="personal">شخصی</option>
                  <option value="unpaid">بدون حقوق</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <PersianDatePicker
                    value={formData.startDate}
                    onChange={(date) => {
                      setFormData({ ...formData, startDate: date });
                      if (errors.startDate) setErrors({ ...errors, startDate: '' });
                    }}
                    label="تاریخ شروع *"
                    error={errors.startDate}
                    placeholder="1403/01/15"
                  />
                </div>
                <div className="ent-form-group">
                  <PersianDatePicker
                    value={formData.endDate}
                    onChange={(date) => {
                      setFormData({ ...formData, endDate: date });
                      if (errors.endDate) setErrors({ ...errors, endDate: '' });
                    }}
                    label="تاریخ پایان *"
                    error={errors.endDate}
                    placeholder="1403/01/17"
                  />
                </div>
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">توضیحات</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="ent-input resize-none h-20"
                  placeholder="توضیحات اختیاری..."
                />
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
                    <span>در حال ثبت...</span>
                  </>
                ) : (
                  <span>ثبت درخواست</span>
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

      {/* Status Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showStatusConfirm}
        title={leaveToApprove?.status === 'approved' ? 'تأیید درخواست مرخصی' : 'رد درخواست مرخصی'}
        message={
          leaveToApprove?.status === 'approved'
            ? 'آیا از تأیید این درخواست مرخصی مطمئن هستید؟'
            : 'آیا از رد این درخواست مرخصی مطمئن هستید؟'
        }
        confirmText={leaveToApprove?.status === 'approved' ? 'تأیید' : 'رد'}
        cancelText="انصراف"
        type={leaveToApprove?.status === 'approved' ? 'info' : 'warning'}
        onConfirm={handleStatusConfirm}
        onCancel={() => {
          setShowStatusConfirm(false);
          setLeaveToApprove(null);
        }}
      />
    </div>
  );
}
