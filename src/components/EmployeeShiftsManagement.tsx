import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, X, Loader2, AlertCircle, Clock } from 'lucide-react';
import { employeeShiftsAPI, shiftsAPI } from '../utils/api';
import { getEmployees } from '../utils/storage';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import PersianDatePicker from './PersianDatePicker';
import SearchableDropdown from './SearchableDropdown';

interface EmployeeShift {
  Id: string;
  EmployeeId: string;
  ShiftId: string;
  StartDate: string;
  EndDate: string;
  DaysOfWeek: string;
  IsActive: boolean;
  EmployeeName?: string;
  ShiftName?: string;
  StartTime?: string;
  EndTime?: string;
}

interface Shift {
  Id: string;
  Name: string;
  Color: string;
}

interface Employee {
  id: string;
  name: string;
  personnelCode: string;
  department: string;
}

export default function EmployeeShiftsManagement() {
  const toast = useToast();
  const [assignments, setAssignments] = useState<EmployeeShift[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<EmployeeShift | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    employeeId: '',
    shiftId: '',
    startDate: '',
    endDate: '',
    daysOfWeek: ''
  });

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
      const [assignmentsData, shiftsData, employeesData] = await Promise.all([
        employeeShiftsAPI.getAll(),
        shiftsAPI.getAll(),
        getEmployees()
      ]);
      setAssignments(assignmentsData);
      setShifts(shiftsData);
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error loading ', error);
      toast.error('خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.employeeId) {
      newErrors.employeeId = 'انتخاب کارمند الزامی است';
    }
    
    if (!formData.shiftId) {
      newErrors.shiftId = 'انتخاب شیفت الزامی است';
    }
    
    if (!formData.startDate) {
      newErrors.startDate = 'تاریخ شروع الزامی است';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingAssignment(null);
    setFormData({
      employeeId: '',
      shiftId: '',
      startDate: '',
      endDate: '',
      daysOfWeek: ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (assignment: EmployeeShift) => {
    setEditingAssignment(assignment);
    setFormData({
      employeeId: assignment.EmployeeId,
      shiftId: assignment.ShiftId,
      startDate: assignment.StartDate,
      endDate: assignment.EndDate || '',
      daysOfWeek: assignment.DaysOfWeek || ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: string) => {
    setAssignmentToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!assignmentToDelete) return;
    
    try {
      await employeeShiftsAPI.delete(assignmentToDelete);
      await loadData();
      toast.success('تخصیص شیفت با موفقیت حذف شد');
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast.error('خطا در حذف تخصیص شیفت');
    } finally {
      setShowDeleteConfirm(false);
      setAssignmentToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      
      if (editingAssignment) {
        await employeeShiftsAPI.update(editingAssignment.Id, formData);
        toast.success('تخصیص شیفت با موفقیت به‌روزرسانی شد');
      } else {
        const newAssignment = {
          id: `es-${Date.now()}`,
          ...formData
        };
        await employeeShiftsAPI.assign(newAssignment);
        toast.success('شیفت با موفقیت تخصیص داده شد');
      }
      
      await loadData();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving assignment:', error);
      toast.error('خطا در ذخیره تخصیص شیفت');
    } finally {
      setSaving(false);
    }
  };

  const handleDayToggle = (day: number) => {
    const currentDays = formData.daysOfWeek ? formData.daysOfWeek.split(',').map(Number) : [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    
    setFormData({ ...formData, daysOfWeek: newDays.join(',') });
  };

  const getSelectedDays = () => {
    if (!formData.daysOfWeek) return [];
    return formData.daysOfWeek.split(',').map(Number);
  };

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? emp.name : 'نامشخص';
  };

  const getShiftColor = (shiftId: string) => {
    const shift = shifts.find(s => s.Id === shiftId);
    return shift ? shift.Color : '#10B981';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-slide-up">
        <div>
          <h2 className="text-3xl font-bold gradient-text mb-2">تخصیص شیفت به کارکنان</h2>
          <p className="text-gray-500">مدیریت شیفت‌های کاری کارکنان</p>
        </div>
        <button
          onClick={handleAdd}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          <span>تخصیص شیفت جدید</span>
        </button>
      </div>

      {/* Assignments Table */}
      <div className="premium-card overflow-hidden animate-slide-up stagger-1">
        <table className="w-full">
          <thead className="bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">کارمند</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">شیفت</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">تاریخ شروع</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">تاریخ پایان</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">روزهای کاری</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assignments.map(assignment => (
              <tr key={assignment.Id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md"
                      style={{ backgroundColor: getShiftColor(assignment.ShiftId) }}
                    >
                      {getEmployeeName(assignment.EmployeeId).charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{getEmployeeName(assignment.EmployeeId)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getShiftColor(assignment.ShiftId) }}
                    />
                    <span className="text-sm text-gray-600">{assignment.ShiftName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{assignment.StartDate}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{assignment.EndDate || 'ادامه‌دار'}</td>
                <td className="px-6 py-4">
                  {assignment.DaysOfWeek ? (
                    <div className="flex flex-wrap gap-1">
                      {assignment.DaysOfWeek.split(',').map(day => (
                        <span key={day} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                          {daysOfWeek[parseInt(day)]?.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">همه روزها</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(assignment)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
                      title="ویرایش"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(assignment.Id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
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
        {assignments.length === 0 && (
          <div className="text-center py-16">
            <Users size={64} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg mb-2">هنوز شیفتی تخصیص داده نشده است</p>
            <button
              onClick={handleAdd}
              className="mt-4 text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              اولین تخصیص شیفت را ایجاد کنید
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">
                {editingAssignment ? 'ویرایش تخصیص شیفت' : 'تخصیص شیفت جدید'}
              </h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <SearchableDropdown
                  label="کارمند *"
                  options={employees.map(emp => ({
                    value: emp.id,
                    label: emp.name,
                    sublabel: `${emp.personnelCode} | ${emp.department}`
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

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  شیفت <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.shiftId}
                  onChange={(e) => {
                    setFormData({ ...formData, shiftId: e.target.value });
                    if (errors.shiftId) setErrors({ ...errors, shiftId: '' });
                  }}
                  className={`input-field ${errors.shiftId ? 'border-red-300 bg-red-50' : ''}`}
                >
                  <option value="">انتخاب شیفت</option>
                  {shifts.map(shift => (
                    <option key={shift.Id} value={shift.Id}>
                      {shift.Name}
                    </option>
                  ))}
                </select>
                {errors.shiftId && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.shiftId}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
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
                </div>
                <div>
                  <PersianDatePicker
                    value={formData.endDate}
                    onChange={(date) => setFormData({ ...formData, endDate: date })}
                    label="تاریخ پایان (اختیاری)"
                    placeholder="1403/12/29"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">روزهای کاری</label>
                <div className="grid grid-cols-7 gap-2">
                  {daysOfWeek.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handleDayToggle(day.value)}
                      className={`py-3 px-2 rounded-xl text-sm font-medium transition-all ${
                        getSelectedDays().includes(day.value)
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  اگر هیچ روزی انتخاب نشود، شیفت برای همه روزها اعمال می‌شود
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <span>{editingAssignment ? 'ذخیره تغییرات' : 'تخصیص شیفت'}</span>
                )}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1 btn-secondary disabled:opacity-50"
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
        title="حذف تخصیص شیفت"
        message="آیا از حذف این تخصیص شیفت مطمئن هستید؟ این عملیات قابل بازگشت نیست."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setAssignmentToDelete(null);
        }}
      />
    </div>
  );
}
