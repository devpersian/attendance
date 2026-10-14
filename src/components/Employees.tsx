import React from 'react';
import { Employee } from '../types';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../utils/storage';
import { toPersianDigits } from '../utils/jalali';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import { Users, Plus, Edit2, Trash2, X, Search, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export default function Employees() {
  const toast = useToast();
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [showModal, setShowModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [employeeToDelete, setEmployeeToDelete] = React.useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formData, setFormData] = React.useState({
    name: '',
    personnelCode: '',
    department: '',
    position: ''
  });
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  const departments = ['فناوری اطلاعات', 'منابع انسانی', 'مالی', 'بازاریابی', 'پشتیبانی', 'مدیریت'];

  React.useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async (forceRefresh = false) => {
    try {
      setLoading(true);
      console.log('📊 Loading employees...', { forceRefresh });
      
      let emps;
      if (forceRefresh) {
        emps = await getEmployees();
      } else {
        emps = await getEmployees();
      }
      
      console.log('✅ Loaded employees:', emps.length);
      setEmployees(emps);
    } catch (error) {
      console.error('❌ Error loading employees:', error);
      toast.error('خطا در بارگذاری کارکنان');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    console.log('🔄 Manual refresh triggered');
    loadEmployees(true);
  };

  const filteredEmployees = employees.filter(emp => {
    const name = emp.name || '';
    const code = emp.personnelCode || '';
    const dept = emp.department || '';
    return name.includes(searchTerm) || code.includes(searchTerm) || dept.includes(searchTerm);
  });

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'نام الزامی است';
    }
    
    if (!formData.personnelCode.trim()) {
      newErrors.personnelCode = 'کد پرسنلی الزامی است';
    } else if (!/^\d+$/.test(formData.personnelCode)) {
      newErrors.personnelCode = 'کد پرسنلی باید عدد باشد';
    } else {
      const duplicate = employees.find(emp => 
        emp.personnelCode === formData.personnelCode && 
        emp.id !== editingEmployee?.id
      );
      if (duplicate) {
        newErrors.personnelCode = 'این کد پرسنلی قبلاً استفاده شده است';
      }
    }
    
    if (!formData.department) {
      newErrors.department = 'دپارتمان الزامی است';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    setFormData({ name: '', personnelCode: '', department: '', position: '' });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name || '',
      personnelCode: emp.personnelCode || '',
      department: emp.department || '',
      position: emp.position || ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: string) => {
    setEmployeeToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!employeeToDelete) return;
    
    try {
      await deleteEmployee(employeeToDelete);
      await loadEmployees();
      toast.success('کارمند با موفقیت حذف شد');
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('خطا در حذف کارمند');
    } finally {
      setShowDeleteConfirm(false);
      setEmployeeToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);
      
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, formData);
        toast.success('اطلاعات کارمند به‌روزرسانی شد');
      } else {
        const newEmp: Employee = {
          id: Date.now().toString(),
          ...formData
        };
        await createEmployee(newEmp);
        toast.success('کارمند جدید اضافه شد');
      }
      
      await loadEmployees();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('خطا در ذخیره اطلاعات');
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
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h2 className="ent-h1 mb-1">کارکنان</h2>
          <p className="ent-body">{toPersianDigits(employees.length)} کارمند</p>
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
          <button onClick={handleAdd} className="ent-btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>افزودن کارمند</span>
          </button>
        </div>
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

      {/* Employee Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-2">
        <table className="ent-table">
          <thead>
            <tr>
              <th>کارمند</th>
              <th>کد پرسنلی</th>
              <th>دپارتمان</th>
              <th>سمت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.map(emp => {
              const empName = emp.name || 'نامشخص';
              const empCode = emp.personnelCode || 'نامشخص';
              const empPos = emp.position || 'نامشخص';
              const empDept = emp.department || 'نامشخص';
              return (
                <tr key={emp.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#0A6ED1] rounded flex items-center justify-center text-white text-sm font-semibold">
                        {empName.charAt(0)}
                      </div>
                      <span className="font-medium">{empName}</span>
                    </div>
                  </td>
                  <td className="font-mono" dir="ltr" style={{ fontFamily: 'Vazir' }}>
                    {toPersianDigits(empCode)}
                  </td>
                  <td>
                    <span className="ent-badge ent-badge-info">
                      {empDept}
                    </span>
                  </td>
                  <td className="ent-body">{empPos}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(emp)}
                        className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                        title="ویرایش"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(emp.id)}
                        className="p-2 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredEmployees.length === 0 && (
          <div className="text-center py-16">
            <Users size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body">
              {searchTerm ? 'کارمندی یافت نشد' : 'هنوز کارمندی اضافه نشده است'}
            </p>
          </div>
        )}
        
        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredEmployees.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingEmployee ? 'ویرایش کارمند' : 'افزودن کارمند جدید'}
              </h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body space-y-4">
              <div className="ent-form-group">
                <label className="ent-form-label">
                  نام و نام خانوادگی <span className="ent-form-required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                  placeholder="مثال: علی احمدی"
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
                  کد پرسنلی <span className="ent-form-required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.personnelCode}
                  onChange={(e) => {
                    setFormData({ ...formData, personnelCode: e.target.value });
                    if (errors.personnelCode) setErrors({ ...errors, personnelCode: '' });
                  }}
                  className={`ent-input ${errors.personnelCode ? 'border-[#BB0000]' : ''}`}
                  placeholder="مثال: 1001"
                  dir="ltr"
                />
                {errors.personnelCode && (
                  <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.personnelCode}
                  </p>
                )}
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">
                  دپارتمان <span className="ent-form-required">*</span>
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => {
                    setFormData({ ...formData, department: e.target.value });
                    if (errors.department) setErrors({ ...errors, department: '' });
                  }}
                  className={`ent-input ${errors.department ? 'border-[#BB0000]' : ''}`}
                >
                  <option value="">انتخاب دپارتمان</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                {errors.department && (
                  <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.department}
                  </p>
                )}
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">سمت</label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="ent-input"
                  placeholder="مثال: توسعه‌دهنده"
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
                  <span>{editingEmployee ? 'ذخیره تغییرات' : 'افزودن کارمند'}</span>
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

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف کارمند"
        message="آیا از حذف این کارمند مطمئن هستید؟"
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setEmployeeToDelete(null);
        }}
      />
    </div>
  );
}
