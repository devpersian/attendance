import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Trash2, X, Search, Loader2, AlertCircle, Clock, Play } from 'lucide-react';
import { shiftPatternsAPI, shiftsAPI } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface ShiftPattern {
  Id: string;
  Name: string;
  Description: string;
  TotalCycleHours: number;
  IsActive: boolean;
  PeriodCount?: number;
  periods?: ShiftPatternPeriod[];
}

interface ShiftPatternPeriod {
  [key: string]: any;
}

interface Shift {
  Id: string;
  Name: string;
  Color: string;
}

export default function ShiftPatternsManagement() {
  const toast = useToast();
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCalculateModal, setShowCalculateModal] = useState(false);
  const [patternToDelete, setPatternToDelete] = useState<string | null>(null);
  const [editingPattern, setEditingPattern] = useState<ShiftPattern | null>(null);
  const [selectedPatternForCalc, setSelectedPatternForCalc] = useState<ShiftPattern | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [calculation, setCalculation] = useState<any>(null);
  const [calcStartDate, setCalcStartDate] = useState('');
  const [calcCurrentDate, setCalcCurrentDate] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    totalCycleHours: 0
  });
  
  const [periods, setPeriods] = useState<ShiftPatternPeriod[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [patternsData, shiftsData] = await Promise.all([
        shiftPatternsAPI.getAll(),
        shiftsAPI.getAll()
      ]);
      setPatterns(patternsData);
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
      newErrors.name = 'نام الگو الزامی است';
    }
    
    if (!formData.totalCycleHours || formData.totalCycleHours <= 0) {
      newErrors.totalCycleHours = 'مدت چرخه باید بیشتر از صفر باشد';
    }
    
    if (periods.length === 0) {
      newErrors.periods = 'حداقل یک دوره باید تعریف شود';
    } else {
      const totalDuration = periods.reduce((sum, p) => sum + p.durationHours, 0);
      if (totalDuration !== formData.totalCycleHours) {
        newErrors.totalCycleHours = `مجموع مدت دوره‌ها (${totalDuration} ساعت) با مدت چرخه (${formData.totalCycleHours} ساعت) مطابقت ندارد`;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingPattern(null);
    setFormData({
      name: '',
      description: '',
      totalCycleHours: 24
    });
    setPeriods([
      { periodOrder: 1, periodType: 'work', durationHours: 12, shiftId: '', description: '' },
      { periodOrder: 2, periodType: 'rest', durationHours: 12, description: '' }
    ]);
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = async (pattern: ShiftPattern) => {
    try {
      const patternDetails = await shiftPatternsAPI.getById(pattern.Id);
      setEditingPattern(patternDetails);
      setFormData({
        name: patternDetails.Name,
        description: patternDetails.Description || '',
        totalCycleHours: patternDetails.TotalCycleHours
      });
      setPeriods(patternDetails.periods.map((p: any) => ({
        id: p.Id,
        periodOrder: p.PeriodOrder,
        periodType: p.PeriodType,
        durationHours: p.DurationHours,
        shiftId: p.ShiftId || '',
        description: p.Description || ''
      })));
      setErrors({});
      setShowModal(true);
    } catch (error) {
      console.error('Error loading pattern:', error);
      toast.error('خطا در بارگذاری الگو');
    }
  };

  const handleDeleteClick = (id: string) => {
    setPatternToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!patternToDelete) return;
    
    try {
      await shiftPatternsAPI.delete(patternToDelete);
      await loadData();
      toast.success('الگو با موفقیت حذف شد');
    } catch (error: any) {
      console.error('Error deleting pattern:', error);
      toast.error(error.message || 'خطا در حذف الگو');
    } finally {
      setShowDeleteConfirm(false);
      setPatternToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      
      const patternData = {
        ...formData,
        periods: periods.map((p, idx) => ({
          ...p,
          periodOrder: idx + 1,
          shiftId: p.periodType === 'work' ? p.shiftId : null
        }))
      };
      
      if (editingPattern) {
        await shiftPatternsAPI.update(editingPattern.Id, patternData);
        toast.success('الگو با موفقیت به‌روزرسانی شد');
      } else {
        const newPattern = {
          id: `pattern-${Date.now()}`,
          ...patternData
        };
        await shiftPatternsAPI.create(newPattern);
        toast.success('الگوی جدید با موفقیت ایجاد شد');
      }
      
      await loadData();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving pattern:', error);
      toast.error('خطا در ذخیره الگو');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = async () => {
    if (!selectedPatternForCalc || !calcStartDate || !calcCurrentDate) {
      toast.warning('لطفاً تمام فیلدها را پر کنید');
      return;
    }

    try {
      const result = await shiftPatternsAPI.calculate(
        selectedPatternForCalc.Id,
        calcStartDate,
        calcCurrentDate
      );
      setCalculation(result);
    } catch (error) {
      console.error('Error calculating:', error);
      toast.error('خطا در محاسبه');
    }
  };

  const addPeriod = () => {
    setPeriods([
      ...periods,
      { periodOrder: periods.length + 1, periodType: 'work', durationHours: 8, shiftId: '', description: '' }
    ]);
  };

  const removePeriod = (index: number) => {
    setPeriods(periods.filter((_, i) => i !== index).map((p, i) => ({ ...p, periodOrder: i + 1 })));
  };

  const updatePeriod = (index: number, field: keyof ShiftPatternPeriod, value: any) => {
    const newPeriods = [...periods];
    newPeriods[index] = { ...newPeriods[index], [field]: value };
    setPeriods(newPeriods);
  };

  const getPeriodTypeLabel = (type: string) => {
    switch (type) {
      case 'work': return 'کاری';
      case 'rest': return 'استراحت';
      case 'break': return 'توقف';
      default: return type;
    }
  };

  const getPeriodTypeBadge = (type: string) => {
    switch (type) {
      case 'work': return 'ent-badge-success';
      case 'rest': return 'ent-badge-info';
      case 'break': return 'ent-badge-warning';
      default: return 'ent-badge-neutral';
    }
  };

  const filteredPatterns = patterns.filter(pattern => {
    const term = searchTerm.trim();
    if (!term) return true;
    return (pattern.Name || '').includes(term) || (pattern.Description || '').includes(term);
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
          <h2 className="ent-h1 mb-1">الگوهای شیفت چرخشی</h2>
          <p className="ent-body">{patterns.length} الگو ثبت شده</p>
        </div>
        <button
          onClick={handleAdd}
          className="ent-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>افزودن الگو</span>
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

      {/* Patterns Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-2">
        <table className="ent-table">
          <thead>
            <tr>
              <th>نام الگو</th>
              <th>چرخه</th>
              <th>دوره‌ها</th>
              <th>توضیحات</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatterns.map(pattern => (
              <tr key={pattern.Id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#8B5CF6] rounded flex items-center justify-center text-white">
                      <Clock size={16} />
                    </div>
                    <span className="font-medium">{pattern.Name}</span>
                  </div>
                </td>
                <td className="ent-body" dir="ltr">{pattern.TotalCycleHours} ساعت</td>
                <td>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pattern.periods ? (
                      pattern.periods.map((period, idx) => (
                        <span key={period.Id || idx} className={`ent-badge ${getPeriodTypeBadge(period.PeriodType)}`}>
                          {getPeriodTypeLabel(period.PeriodType)}: {period.DurationHours}س
                        </span>
                      ))
                    ) : (
                      <span className="ent-body">{pattern.PeriodCount ?? '-'} دوره</span>
                    )}
                  </div>
                </td>
                <td className="ent-body">{pattern.Description || '-'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setSelectedPatternForCalc(pattern);
                        setCalcStartDate('');
                        setCalcCurrentDate('');
                        setCalculation(null);
                        setShowCalculateModal(true);
                      }}
                      className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                      title="محاسبه دوره فعلی"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => handleEdit(pattern)}
                      className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                      title="ویرایش"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(pattern.Id)}
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
        {filteredPatterns.length === 0 && (
          <div className="text-center py-16">
            <Clock size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body">
              {searchTerm ? 'الگویی یافت نشد' : 'هنوز الگویی اضافه نشده است'}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingPattern ? `ویرایش الگو — ${editingPattern.Name}` : 'افزودن الگوی جدید'}
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
                    نام الگو <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (errors.name) setErrors({ ...errors, name: '' });
                    }}
                    className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                    placeholder="مثال: 24 ساعت کار / 36 ساعت استراحت"
                  />
                  {errors.name && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.name}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">
                    مدت چرخه (ساعت) <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.totalCycleHours}
                    onChange={(e) => {
                      setFormData({ ...formData, totalCycleHours: parseInt(e.target.value) });
                      if (errors.totalCycleHours) setErrors({ ...errors, totalCycleHours: '' });
                    }}
                    className={`ent-input ${errors.totalCycleHours ? 'border-[#BB0000]' : ''}`}
                    min="1"
                    dir="ltr"
                  />
                  {errors.totalCycleHours && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.totalCycleHours}
                    </p>
                  )}
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

              <div className="ent-form-group">
                <div className="flex items-center justify-between mb-2">
                  <label className="ent-form-label mb-0">
                    دوره‌ها <span className="ent-form-required">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={addPeriod}
                    className="ent-btn-secondary text-sm flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>افزودن دوره</span>
                  </button>
                </div>

                {errors.periods && (
                  <p className="text-[#BB0000] text-xs mb-2 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.periods}
                  </p>
                )}

                <div className="space-y-3">
                  {periods.map((period, idx) => (
                    <div key={idx} className="p-4 border border-[#E5E5E5] rounded-lg bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">{`دوره ${idx + 1}`}</span>
                        {periods.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePeriod(idx)}
                            className="p-1 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                            title="حذف دوره"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="ent-form-group">
                          <label className="ent-form-label">نوع دوره</label>
                          <select
                            value={period.periodType}
                            onChange={(e) => updatePeriod(idx, 'periodType', e.target.value)}
                            className="ent-input"
                          >
                            <option value="work">کاری</option>
                            <option value="rest">استراحت</option>
                            <option value="break">توقف</option>
                          </select>
                        </div>

                        <div className="ent-form-group">
                          <label className="ent-form-label">مدت (ساعت)</label>
                          <input
                            type="number"
                            value={period.durationHours}
                            onChange={(e) => updatePeriod(idx, 'durationHours', parseInt(e.target.value))}
                            className="ent-input"
                            min="1"
                            dir="ltr"
                          />
                        </div>

                        {period.periodType === 'work' && (
                          <div className="ent-form-group">
                            <label className="ent-form-label">شیفت (اختیاری)</label>
                            <select
                              value={period.shiftId || ''}
                              onChange={(e) => updatePeriod(idx, 'shiftId', e.target.value)}
                              className="ent-input"
                            >
                              <option value="">بدون شیفت</option>
                              {shifts.map(shift => (
                                <option key={shift.Id} value={shift.Id}>{shift.Name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className={`ent-form-group ${period.periodType === 'work' ? '' : 'md:col-span-2'}`}>
                          <label className="ent-form-label">توضیحات</label>
                          <input
                            type="text"
                            value={period.description || ''}
                            onChange={(e) => updatePeriod(idx, 'description', e.target.value)}
                            className="ent-input"
                            placeholder="توضیحات اختیاری..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {periods.length > 0 && (
                  <div className="mt-3 p-3 bg-[#F0F6FF] rounded border border-[#9CC7EA]">
                    <p className="ent-body">
                      مجموع مدت دوره‌ها: <strong>{periods.reduce((sum, p) => sum + p.durationHours, 0)} ساعت</strong>
                      {periods.reduce((sum, p) => sum + p.durationHours, 0) !== formData.totalCycleHours && (
                        <span className="text-[#BB0000] mr-2">
                          (باید {formData.totalCycleHours} ساعت باشد)
                        </span>
                      )}
                    </p>
                  </div>
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
                  <span>{editingPattern ? 'ذخیره تغییرات' : 'افزودن الگو'}</span>
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

      {/* Calculate Modal */}
      {showCalculateModal && selectedPatternForCalc && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">محاسبه دوره فعلی</h3>
              <button
                onClick={() => setShowCalculateModal(false)}
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body space-y-4 overflow-y-auto flex-1">
              <div className="p-4 bg-[#F0F6FF] rounded border border-[#9CC7EA]">
                <p className="ent-caption mb-1">الگو:</p>
                <p className="font-bold">{selectedPatternForCalc.Name}</p>
                <p className="ent-body mt-1">چرخه {selectedPatternForCalc.TotalCycleHours} ساعته</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ent-form-group">
                  <label className="ent-form-label">تاریخ شروع الگو</label>
                  <input
                    type="datetime-local"
                    value={calcStartDate}
                    onChange={(e) => setCalcStartDate(e.target.value)}
                    className="ent-input"
                    dir="ltr"
                  />
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">تاریخ فعلی</label>
                  <input
                    type="datetime-local"
                    value={calcCurrentDate}
                    onChange={(e) => setCalcCurrentDate(e.target.value)}
                    className="ent-input"
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                onClick={handleCalculate}
                className="ent-btn-primary flex items-center gap-2"
              >
                <Play size={16} />
                <span>محاسبه</span>
              </button>

              {calculation && (
                <div className="p-4 bg-[#F1F8F1] rounded border border-[#87CD87] space-y-3">
                  <h4 className="font-bold">نتیجه محاسبه:</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                      <p className="ent-caption mb-1">دوره فعلی:</p>
                      <p className="font-bold">
                        {getPeriodTypeLabel(calculation.currentPeriod.PeriodType)}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                      <p className="ent-caption mb-1">مدت دوره:</p>
                      <p className="font-bold">
                        {calculation.currentPeriod.DurationHours} ساعت
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                      <p className="ent-caption mb-1">زمان سپری شده:</p>
                      <p className="font-bold text-[#0A6ED1]">
                        {calculation.hoursIntoPeriod} ساعت
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                      <p className="ent-caption mb-1">زمان باقی‌مانده:</p>
                      <p className="font-bold text-[#107E3E]">
                        {calculation.hoursRemainingInPeriod} ساعت
                      </p>
                    </div>
                  </div>

                  {calculation.currentPeriod.ShiftName && (
                    <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                      <p className="ent-caption mb-1">شیفت مرتبط:</p>
                      <p className="font-bold">
                        {calculation.currentPeriod.ShiftName}
                      </p>
                    </div>
                  )}

                  <div className="p-3 bg-white rounded border border-[#E5E5E5]">
                    <p className="ent-caption mb-1">دوره بعدی:</p>
                    <p className="font-bold">
                      {getPeriodTypeLabel(calculation.nextPeriod.PeriodType)}
                      {calculation.nextPeriod.ShiftName && ` (${calculation.nextPeriod.ShiftName})`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="ent-modal-footer">
              <button
                onClick={() => setShowCalculateModal(false)}
                className="ent-btn-secondary"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف الگو"
        message="آیا از حذف این الگو مطمئن هستید؟ این عملیات قابل بازگشت نیست."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPatternToDelete(null);
        }}
      />
    </div>
  );
}
