import React, { useState, useEffect } from 'react';
import { Clock, Plus, Edit2, Trash2, X, Search, Loader2, AlertCircle } from 'lucide-react';
import { shiftsAPI } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface Shift {
  Id: string;
  Name: string;
  Description: string;
  StartTime: string;
  EndTime: string;
  BreakStartTime: string;
  BreakEndTime: string;
  LateThresholdMinutes: number;
  EarlyLeaveThresholdMinutes: number;
  IsActive: boolean;
  Color: string;
}

export default function ShiftsManagement() {
  const toast = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '08:00',
    endTime: '17:00',
    breakStartTime: '',
    breakEndTime: '',
    lateThresholdMinutes: 15,
    earlyLeaveThresholdMinutes: 15,
    color: '#10B981'
  });

  const colors = [
    { value: '#10B981', label: 'سبز' },
    { value: '#F59E0B', label: 'نارنجی' },
    { value: '#8B5CF6', label: 'بنفش' },
    { value: '#3B82F6', label: 'آبی' },
    { value: '#EF4444', label: 'قرمز' },
    { value: '#EC4899', label: 'صورتی' }
  ];

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await shiftsAPI.getAll();
      setShifts(data);
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast.error('خطا در بارگذاری شیفت‌ها');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'نام شیفت الزامی است';
    }
    
    if (!formData.startTime) {
      newErrors.startTime = 'ساعت شروع الزامی است';
    }
    
    if (!formData.endTime) {
      newErrors.endTime = 'ساعت پایان الزامی است';
    }
    
    if (formData.breakStartTime && formData.breakEndTime) {
      if (formData.breakStartTime >= formData.breakEndTime) {
        newErrors.breakEndTime = 'ساعت پایان استراحت باید بعد از ساعت شروع باشد';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingShift(null);
    setFormData({
      name: '',
      description: '',
      startTime: '08:00',
      endTime: '17:00',
      breakStartTime: '',
      breakEndTime: '',
      lateThresholdMinutes: 15,
      earlyLeaveThresholdMinutes: 15,
      color: '#10B981'
    });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormData({
      name: shift.Name,
      description: shift.Description || '',
      startTime: shift.StartTime.substring(0, 5),
      endTime: shift.EndTime.substring(0, 5),
      breakStartTime: shift.BreakStartTime ? shift.BreakStartTime.substring(0, 5) : '',
      breakEndTime: shift.BreakEndTime ? shift.BreakEndTime.substring(0, 5) : '',
      lateThresholdMinutes: shift.LateThresholdMinutes,
      earlyLeaveThresholdMinutes: shift.EarlyLeaveThresholdMinutes,
      color: shift.Color || '#10B981'
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: string) => {
    setShiftToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!shiftToDelete) return;
    
    try {
      await shiftsAPI.delete(shiftToDelete);
      await loadShifts();
      toast.success('شیفت با موفقیت حذف شد');
    } catch (error) {
      console.error('Error deleting shift:', error);
      toast.error('خطا در حذف شیفت');
    } finally {
      setShowDeleteConfirm(false);
      setShiftToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      
      const shiftData = {
        ...formData,
        startTime: `${formData.startTime}:00`,
        endTime: `${formData.endTime}:00`,
        breakStartTime: formData.breakStartTime ? `${formData.breakStartTime}:00` : null,
        breakEndTime: formData.breakEndTime ? `${formData.breakEndTime}:00` : null
      };
      
      if (editingShift) {
        await shiftsAPI.update(editingShift.Id, shiftData);
        toast.success('شیفت با موفقیت به‌روزرسانی شد');
      } else {
        const newShift = {
          id: `shift-${Date.now()}`,
          ...shiftData
        };
        await shiftsAPI.create(newShift);
        toast.success('شیفت جدید با موفقیت ایجاد شد');
      }
      
      await loadShifts();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving shift:', error);
      toast.error('خطا در ذخیره شیفت');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  const filteredShifts = shifts.filter(shift => {
    const term = searchTerm.trim();
    if (!term) return true;
    return (shift.Name || '').includes(term) || (shift.Description || '').includes(term);
  });

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
          <h2 className="ent-h1 mb-1">مدیریت شیفت‌ها</h2>
          <p className="ent-body">{shifts.length} شیفت ثبت شده</p>
        </div>
        <button
          onClick={handleAdd}
          className="ent-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>افزودن شیفت</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative animate-fade-in stagger-1">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8E93]" />
        <input
          type="text"
          placeholder="جستجو..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ent-input pr-10"
        />
      </div>

      {/* Shifts Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-2">
        <table className="ent-table">
          <thead>
            <tr>
              <th>نام</th>
              <th>ساعت کاری</th>
              <th>استراحت</th>
              <th>آستانه تأخیر</th>
              <th>آستانه خروج زود</th>
              <th>توضیحات</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredShifts.map(shift => (
              <tr key={shift.Id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded flex items-center justify-center text-white"
                      style={{ backgroundColor: shift.Color || '#10B981' }}
                    >
                      <Clock size={16} />
                    </div>
                    <span className="font-medium">{shift.Name}</span>
                  </div>
                </td>
                <td dir="ltr" className="ent-body">
                  {formatTime(shift.StartTime)} - {formatTime(shift.EndTime)}
                </td>
                <td dir="ltr" className="ent-body">
                  {shift.BreakStartTime && shift.BreakEndTime
                    ? `${formatTime(shift.BreakStartTime)} - ${formatTime(shift.BreakEndTime)}`
                    : '-'}
                </td>
                <td>
                  <span className="ent-badge ent-badge-warning">{shift.LateThresholdMinutes ?? '-'} دقیقه</span>
                </td>
                <td>
                  <span className="ent-badge ent-badge-danger">{shift.EarlyLeaveThresholdMinutes ?? '-'} دقیقه</span>
                </td>
                <td className="ent-body">{shift.Description || '-'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(shift)}
                      className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                      title="ویرایش"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(shift.Id)}
                      className="p-2 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredShifts.length === 0 && (
          <div className="text-center py-16">
            <Clock size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body">
              {searchTerm ? 'شیفتی یافت نشد' : 'هنوز شیفتی اضافه نشده است'}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingShift ? `ویرایش شیفت — ${editingShift.Name}` : 'افزودن شیفت جدید'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body space-y-4 overflow-y-auto flex-1">
              <div className="ent-form-group">
                <label className="ent-form-label">
                  نام شیفت <span className="ent-form-required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                  placeholder="مثال: شیفت صبح"
                />
                {errors.name && (
                  <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.name}
                  </p>
                )}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <label className="ent-form-label">
                    ساعت شروع <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => {
                      setFormData({ ...formData, startTime: e.target.value });
                      if (errors.startTime) setErrors({ ...errors, startTime: '' });
                    }}
                    className={`ent-input ${errors.startTime ? 'border-[#BB0000]' : ''}`}
                    dir="ltr"
                  />
                  {errors.startTime && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.startTime}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">
                    ساعت پایان <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => {
                      setFormData({ ...formData, endTime: e.target.value });
                      if (errors.endTime) setErrors({ ...errors, endTime: '' });
                    }}
                    className={`ent-input ${errors.endTime ? 'border-[#BB0000]' : ''}`}
                    dir="ltr"
                  />
                  {errors.endTime && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.endTime}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">شروع استراحت</label>
                  <input
                    type="time"
                    value={formData.breakStartTime}
                    onChange={(e) => setFormData({ ...formData, breakStartTime: e.target.value })}
                    className="ent-input"
                    dir="ltr"
                  />
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">پایان استراحت</label>
                  <input
                    type="time"
                    value={formData.breakEndTime}
                    onChange={(e) => {
                      setFormData({ ...formData, breakEndTime: e.target.value });
                      if (errors.breakEndTime) setErrors({ ...errors, breakEndTime: '' });
                    }}
                    className={`ent-input ${errors.breakEndTime ? 'border-[#BB0000]' : ''}`}
                    dir="ltr"
                  />
                  {errors.breakEndTime && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.breakEndTime}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">آستانه تأخیر (دقیقه)</label>
                  <input
                    type="number"
                    value={formData.lateThresholdMinutes}
                    onChange={(e) => setFormData({ ...formData, lateThresholdMinutes: parseInt(e.target.value) })}
                    className="ent-input"
                    min="0"
                    dir="ltr"
                  />
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">آستانه خروج زود (دقیقه)</label>
                  <input
                    type="number"
                    value={formData.earlyLeaveThresholdMinutes}
                    onChange={(e) => setFormData({ ...formData, earlyLeaveThresholdMinutes: parseInt(e.target.value) })}
                    className="ent-input"
                    min="0"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">رنگ شیفت</label>
                <div className="grid grid-cols-6 gap-2">
                  {colors.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`h-10 rounded border-2 transition-all ${
                        formData.color === color.value
                          ? 'border-[#32363A] scale-105'
                          : 'border-transparent hover:border-[#C2C6CB]'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
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
                  <span>{editingShift ? 'ذخیره تغییرات' : 'افزودن شیفت'}</span>
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف شیفت"
        message="آیا از حذف این شیفت مطمئن هستید؟ این عملیات قابل بازگشت نیست."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setShiftToDelete(null);
        }}
      />
    </div>
  );
}
