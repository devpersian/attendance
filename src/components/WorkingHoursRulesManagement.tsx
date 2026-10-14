import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Trash2, X, Search, Loader2, AlertCircle, CalendarOff } from 'lucide-react';
import { workingHoursRulesAPI, shiftsAPI } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import PersianDatePicker from './PersianDatePicker';

interface WorkingHoursRule {
  Id: string;
  Name: string;
  RuleType: 'holiday' | 'weekend' | 'overtime' | 'special_day';
  StartDate: string;
  EndDate: string;
  DayOfWeek: number;
  IsWorkingDay: boolean;
  ShiftId: string;
  OvertimeMultiplier: number;
  Description: string;
  IsActive: boolean;
  ShiftName?: string;
}

interface Shift {
  Id: string;
  Name: string;
}

export default function WorkingHoursRulesManagement() {
  const toast = useToast();
  const [rules, setRules] = useState<WorkingHoursRule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<WorkingHoursRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    ruleType: 'holiday' as WorkingHoursRule['RuleType'],
    startDate: '',
    endDate: '',
    dayOfWeek: -1,
    isWorkingDay: false,
    shiftId: '',
    overtimeMultiplier: 1.5,
    description: ''
  });

  const ruleTypes = [
    { value: 'holiday', label: 'تعطیلات', icon: '🎉' },
    { value: 'weekend', label: 'آخر هفته', icon: '📅' },
    { value: 'overtime', label: 'اضافه کاری', icon: '⏰' },
    { value: 'special_day', label: 'روز خاص', icon: '⭐' }
  ];

  const daysOfWeek = [
    { value: 0, label: 'شنبه' },
    { value: 1, label: 'یکشنبه' },
    { value: 2, label: 'دوشنبه' },
    { value: 3, label: 'سه‌شنبه' },
    { value: 4, label: 'چهارشنبه' },
    { value: 5, label: 'پنج‌شنبه' },
    { value: 6, label: 'جمعه' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rulesData, shiftsData] = await Promise.all([
        workingHoursRulesAPI.getAll(),
        shiftsAPI.getAll()
      ]);
      setRules(rulesData);
      setShifts(shiftsData);
    } catch (error) {
      console.error('Error loading ', error);
      toast.error('خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'نام قانون الزامی است';
    }
    
    if (formData.ruleType === 'holiday' || formData.ruleType === 'special_day') {
      if (!formData.startDate) {
        newErrors.startDate = 'تاریخ شروع الزامی است';
      }
    }
    
    if (formData.ruleType === 'weekend') {
      if (formData.dayOfWeek === -1) {
        newErrors.dayOfWeek = 'روز هفته الزامی است';
      }
    }
    
    if (formData.ruleType === 'overtime') {
      if (!formData.overtimeMultiplier || formData.overtimeMultiplier < 1) {
        newErrors.overtimeMultiplier = 'ضریب اضافه کاری باید حداقل 1 باشد';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      ruleType: 'holiday',
      startDate: '',
      endDate: '',
      dayOfWeek: -1,
      isWorkingDay: false,
      shiftId: '',
      overtimeMultiplier: 1.5,
      description: ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (rule: WorkingHoursRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.Name,
      ruleType: rule.RuleType,
      startDate: rule.StartDate || '',
      endDate: rule.EndDate || '',
      dayOfWeek: rule.DayOfWeek !== null ? rule.DayOfWeek : -1,
      isWorkingDay: rule.IsWorkingDay,
      shiftId: rule.ShiftId || '',
      overtimeMultiplier: rule.OvertimeMultiplier || 1.5,
      description: rule.Description || ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: string) => {
    setRuleToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    
    try {
      await workingHoursRulesAPI.delete(ruleToDelete);
      await loadData();
      toast.success('قانون با موفقیت حذف شد');
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('خطا در حذف قانون');
    } finally {
      setShowDeleteConfirm(false);
      setRuleToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      
      const ruleData = {
        ...formData,
        dayOfWeek: formData.ruleType === 'weekend' ? formData.dayOfWeek : null,
        startDate: (formData.ruleType === 'holiday' || formData.ruleType === 'special_day') ? formData.startDate : null,
        endDate: (formData.ruleType === 'holiday' || formData.ruleType === 'special_day') ? formData.endDate : null,
        shiftId: formData.shiftId || null,
        overtimeMultiplier: formData.ruleType === 'overtime' ? formData.overtimeMultiplier : null
      };
      
      if (editingRule) {
        await workingHoursRulesAPI.update(editingRule.Id, ruleData);
        toast.success('قانون با موفقیت به‌روزرسانی شد');
      } else {
        const newRule = {
          id: `rule-${Date.now()}`,
          ...ruleData
        };
        await workingHoursRulesAPI.create(newRule);
        toast.success('قانون جدید با موفقیت ایجاد شد');
      }
      
      await loadData();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving rule:', error);
      toast.error('خطا در ذخیره قانون');
    } finally {
      setSaving(false);
    }
  };

  const getRuleTypeLabel = (type: string) => {
    const ruleType = ruleTypes.find(r => r.value === type);
    return ruleType ? `${ruleType.icon} ${ruleType.label}` : type;
  };

  const getRuleTypeBadge = (type: string) => {
    switch (type) {
      case 'holiday': return 'ent-badge-danger';
      case 'weekend': return 'ent-badge-warning';
      case 'overtime': return 'ent-badge-info';
      case 'special_day': return 'ent-badge-neutral';
      default: return 'ent-badge-neutral';
    }
  };

  const filteredRules = rules.filter(rule => {
    const term = searchTerm.trim();
    if (!term) return true;
    return (rule.Name || '').includes(term) || (rule.Description || '').includes(term);
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
          <h2 className="ent-h1 mb-1">قوانین ساعات کاری</h2>
          <p className="ent-body">{rules.length} قانون ثبت شده</p>
        </div>
        <button
          onClick={handleAdd}
          className="ent-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>افزودن قانون</span>
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

      {/* Rules Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-2">
        <table className="ent-table">
          <thead>
            <tr>
              <th>نام قانون</th>
              <th>نوع</th>
              <th>تاریخ / روز</th>
              <th>شیفت</th>
              <th>ضریب اضافه کاری</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map(rule => (
              <tr key={rule.Id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded flex items-center justify-center text-white ${
                      rule.IsWorkingDay ? 'bg-[#107E3E]' : 'bg-[#BB0000]'
                    }`}>
                      {rule.IsWorkingDay ? <Calendar size={16} /> : <CalendarOff size={16} />}
                    </div>
                    <div>
                      <span className="font-medium block">{rule.Name}</span>
                      {rule.Description && (
                        <span className="ent-caption block">{rule.Description}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`ent-badge ${getRuleTypeBadge(rule.RuleType)}`}>
                    {getRuleTypeLabel(rule.RuleType)}
                  </span>
                </td>
                <td className="ent-body" dir="ltr">
                  {rule.StartDate && rule.EndDate
                    ? `${rule.StartDate} تا ${rule.EndDate}`
                    : rule.StartDate || (rule.DayOfWeek !== null ? daysOfWeek[rule.DayOfWeek]?.label : '-') || '-'}
                </td>
                <td className="ent-body">{rule.ShiftName || '-'}</td>
                <td className="ent-body" dir="ltr">{rule.OvertimeMultiplier ? `${rule.OvertimeMultiplier}x` : '-'}</td>
                <td>
                  {rule.IsWorkingDay ? (
                    <span className="ent-badge ent-badge-success">روز کاری</span>
                  ) : (
                    <span className="ent-badge ent-badge-neutral">تعطیل</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                      title="ویرایش"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(rule.Id)}
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
        {filteredRules.length === 0 && (
          <div className="text-center py-16">
            <Calendar size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body">
              {searchTerm ? 'قانونی یافت نشد' : 'هنوز قانونی اضافه نشده است'}
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
                {editingRule ? `ویرایش قانون — ${editingRule.Name}` : 'افزودن قانون جدید'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <label className="ent-form-label">
                    نام قانون <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (errors.name) setErrors({ ...errors, name: '' });
                    }}
                    className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                    placeholder="مثال: تعطیلات نوروز"
                  />
                  {errors.name && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.name}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">نوع قانون</label>
                  <select
                    value={formData.ruleType}
                    onChange={(e) => setFormData({ ...formData, ruleType: e.target.value as WorkingHoursRule['RuleType'] })}
                    className="ent-input"
                  >
                    {ruleTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(formData.ruleType === 'holiday' || formData.ruleType === 'special_day') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PersianDatePicker
                    value={formData.startDate}
                    onChange={(date) => {
                      setFormData({ ...formData, startDate: date });
                      if (errors.startDate) setErrors({ ...errors, startDate: '' });
                    }}
                    label="تاریخ شروع *"
                    error={errors.startDate}
                    placeholder="1403/01/01"
                  />
                  <PersianDatePicker
                    value={formData.endDate}
                    onChange={(date) => setFormData({ ...formData, endDate: date })}
                    label="تاریخ پایان"
                    placeholder="1403/01/04"
                  />
                </div>
              )}

              {formData.ruleType === 'weekend' && (
                <div className="ent-form-group">
                  <label className="ent-form-label">
                    روز هفته <span className="ent-form-required">*</span>
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => {
                      setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) });
                      if (errors.dayOfWeek) setErrors({ ...errors, dayOfWeek: '' });
                    }}
                    className={`ent-input ${errors.dayOfWeek ? 'border-[#BB0000]' : ''}`}
                  >
                    <option value={-1}>انتخاب روز</option>
                    {daysOfWeek.map(day => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                  {errors.dayOfWeek && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.dayOfWeek}
                    </p>
                  )}
                </div>
              )}

              {formData.ruleType === 'overtime' && (
                <div className="ent-form-group">
                  <label className="ent-form-label">
                    ضریب اضافه کاری <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.overtimeMultiplier}
                    onChange={(e) => {
                      setFormData({ ...formData, overtimeMultiplier: parseFloat(e.target.value) });
                      if (errors.overtimeMultiplier) setErrors({ ...errors, overtimeMultiplier: '' });
                    }}
                    className={`ent-input ${errors.overtimeMultiplier ? 'border-[#BB0000]' : ''}`}
                    step="0.1"
                    min="1"
                    dir="ltr"
                  />
                  {errors.overtimeMultiplier && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.overtimeMultiplier}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <label className="ent-form-label">شیفت (اختیاری)</label>
                  <select
                    value={formData.shiftId}
                    onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                    className="ent-input"
                  >
                    <option value="">بدون شیفت</option>
                    {shifts.map(shift => (
                      <option key={shift.Id} value={shift.Id}>{shift.Name}</option>
                    ))}
                  </select>
                </div>

                <div className="ent-form-group flex items-end pb-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isWorkingDay}
                      onChange={(e) => setFormData({ ...formData, isWorkingDay: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="ent-form-label mb-0">روز کاری است</span>
                  </label>
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
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <span>{editingRule ? 'ذخیره تغییرات' : 'افزودن قانون'}</span>
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
        title="حذف قانون"
        message="آیا از حذف این قانون مطمئن هستید؟ این عملیات قابل بازگشت نیست."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setRuleToDelete(null);
        }}
      />
    </div>
  );
}
