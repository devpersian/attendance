import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, Edit2, Trash2, X, Loader2, AlertCircle, Users } from 'lucide-react';
import { unitsAPI } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import TreeView, { TreeNode, TreeData, toTreeNodes, collectNodeIds } from './TreeView';

interface Unit extends TreeData {
  Id: number;
  Name: string;
  Description: string | null;
  ParentId: number | null;
  ParentName?: string | null;
  SortOrder?: number | null;
  AssignmentCount?: number;
  children?: Unit[];
}

/** Depth-first flat list with depth info (for parent-select options). */
function flatten(nodes: TreeNode<Unit>[], depth = 0): Array<{ data: Unit; depth: number }> {
  const out: Array<{ data: Unit; depth: number }> = [];
  for (const n of nodes) {
    out.push({ data: n.data, depth });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

export default function UnitManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [unitTree, setUnitTree] = useState<TreeNode<Unit>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<number | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: ''
  });

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    try {
      setLoading(true);
      // The API returns { units, tree } — nested children under `children`.
      const res: any = await unitsAPI.getAll();
      const raw = Array.isArray(res) ? res : res?.tree ?? res?.units;
      const nodes = toTreeNodes<Unit>(raw);
      setUnitTree(nodes);
      setExpanded(prev => {
        const next = new Set(prev);
        for (const id of collectNodeIds(nodes)) next.add(id);
        return next;
      });
    } catch (error: any) {
      console.error('Error loading units:', error);
      if (error.message && error.message.includes('403')) {
        toast.error('شما دسترسی به مدیریت واحدها ندارید.');
      } else {
        toast.error('خطا در بارگذاری واحدها');
      }
    } finally {
      setLoading(false);
    }
  };

  const flatUnits = useMemo(() => flatten(unitTree), [unitTree]);

  /** The row highlighted via selection (resolved from the tree, NaN-safe). */
  const selectedUnit = useMemo(
    () => (selectedUnitId == null ? null : flatUnits.find(u => Number(u.data.id ?? u.data.Id) === selectedUnitId)?.data ?? null),
    [flatUnits, selectedUnitId]
  );

  // If the selected unit was deleted or re-parented out of view, drop the stale id.
  useEffect(() => {
    if (selectedUnitId != null && !flatUnits.some(u => Number(u.data.id ?? u.data.Id) === selectedUnitId)) {
      setSelectedUnitId(null);
    }
  }, [flatUnits, selectedUnitId]);

  const handleAdd = (parent?: Unit) => {
    setEditingUnit(null);
    setFormData({
      name: '',
      description: '',
      parentId: parent ? String(parent.Id) : ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.Name,
      description: unit.Description || '',
      parentId: unit.ParentId != null ? String(unit.ParentId) : ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: number) => {
    setUnitToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (unitToDelete == null) return;
    try {
      await unitsAPI.delete(unitToDelete);
      await loadUnits();
      toast.success('واحد با موفقیت حذف شد');
    } catch (error: any) {
      console.error('Error deleting unit:', error);
      toast.error('خطا در حذف واحد', error.message);
    } finally {
      setShowDeleteConfirm(false);
      setUnitToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setErrors({ name: 'نام واحد الزامی است' });
      toast.warning('لطفاً نام واحد را وارد کنید');
      return;
    }

    const payload: Record<string, any> = {
      name: formData.name,
      description: formData.description || null,
      parentId: formData.parentId ? Number(formData.parentId) : null,
    };

    try {
      setSaving(true);
      if (editingUnit) {
        await unitsAPI.update(editingUnit.Id, payload);
        toast.success('واحد با موفقیت به‌روزرسانی شد');
      } else {
        await unitsAPI.create(payload);
        toast.success('واحد جدید با موفقیت ایجاد شد');
      }
      await loadUnits();
      setShowModal(false);
    } catch (error: any) {
      console.error('Error saving unit:', error);
      toast.error(error.message || 'خطا در ذخیره واحد');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="ent-card p-8 text-center max-w-md">
          <Building2 size={64} className="text-[#BB0000] mx-auto mb-4" />
          <h3 className="ent-h2 mb-2">دسترسی محدود</h3>
          <p className="ent-body">شما دسترسی به مدیریت واحدهای سازمانی ندارید.</p>
        </div>
      </div>
    );
  }

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
          <h2 className="ent-h1 mb-1">مدیریت واحدهای سازمانی</h2>
          <p className="ent-body">{flatUnits.length} واحد — ساختار درختی (هلدینگ ← شرکت ← شعبه)</p>
        </div>
        <button onClick={() => handleAdd()} className="ent-btn-primary flex items-center gap-2">
          <Plus size={16} />
          <span>ایجاد واحد جدید</span>
        </button>
      </div>

      {/* Units tree (real tree component) */}
      <div className="ent-card p-5 animate-fade-in">
        {/* Toolbar: selection + bulk expand/collapse — TreeView is controlled, so
            these live here and drive `selectedUnitId` / `expanded`. */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#F0F0F0]">
          <span className="ent-caption">
            {selectedUnit
              ? `انتخاب شده: ${selectedUnit.Name}`
              : 'برای مشاهده، روی یک واحد کلیک کنید'}
            {selectedUnit && (
              <button
                type="button"
                onClick={() => setSelectedUnitId(null)}
                className="mr-2 text-[#0A6ED1] hover:underline"
              >
                لغو انتخاب
              </button>
            )}
          </span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setExpanded(prev => new Set([...prev, ...collectNodeIds(unitTree)]))}
              className="ent-caption hover:text-[#0A6ED1] transition-colors"
            >
              باز کردن همه
            </button>
            <span className="text-[#E5E5E5]">|</span>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="ent-caption hover:text-[#0A6ED1] transition-colors"
            >
              بستن همه
            </button>
          </div>
        </div>

        <TreeView<Unit>
          nodes={unitTree}
          expandedIds={expanded}
          onToggleExpand={toggleExpanded}
          selectedId={selectedUnitId}
          onSelect={(unit) => {
            // Single click selects; clicking the already-selected unit deselects.
            const id = Number(unit.id ?? unit.Id);
            setSelectedUnitId(prev => (prev === id ? null : id));
          }}
          emptyMessage="هنوز واحدی تعریف نشده است — یک شرکت مادر بسازید"
          renderNode={(unit, _depth, node) => (
            <div className="flex items-center gap-2 flex-wrap py-0.5">
              <span className="font-semibold text-[13px]">{unit.Name}</span>
              {unit.Description && (
                <span className="ent-caption hidden md:inline">{unit.Description}</span>
              )}
              <span className="ent-caption">
                <Users size={11} className="inline ml-1" />
                {unit.AssignmentCount ?? 0} تخصیص نقش
                {node.children?.length ? ` · ${collectNodeIds(node.children).length} زیرمجموعه` : ''}
              </span>
            </div>
          )}
          renderActions={(unit, _depth, node) => (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleAdd(node.data); }}
                className="p-1.5 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                title="افزودن زیرواحد"
              >
                <Plus size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(unit); }}
                className="p-1.5 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                title="ویرایش"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(Number(unit.Id)); }}
                className="p-1.5 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                title="حذف"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        />
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">{editingUnit ? 'ویرایش واحد' : 'ایجاد واحد جدید'}</h3>
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
                  نام واحد <span className="ent-form-required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                  placeholder="مثال: شرکت پارس (زیرمجموعه هلدینگ)"
                />
                {errors.name && (
                  <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">واحد والد</label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="ent-input"
                  disabled={!!editingUnit}
                >
                  <option value="">— بدون والد (سازمان مادر) —</option>
                  {flatUnits
                    .filter(r => !editingUnit || Number(r.data.Id) !== Number(editingUnit.Id))
                    .map(r => (
                      <option key={r.data.Id} value={r.data.Id}>
                        {'— '.repeat(r.depth)}{r.data.Name}
                      </option>
                    ))}
                </select>
                <p className="ent-caption mt-1">
                  ساختار مانند هلدینگ است: سازمان مادر ← شرکت ← شعبه/دپارتمان.
                </p>
              </div>

              <div className="ent-form-group">
                <label className="ent-form-label">توضیحات</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="ent-input resize-none h-24"
                  placeholder="توضیحات واحد..."
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
                  <span>{editingUnit ? 'ذخیره تغییرات' : 'ایجاد واحد'}</span>
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
        title="حذف واحد"
        message="آیا از حذف این واحد مطمئن هستید؟ واحدهای فرزند و تخصیص‌های نقش باید ابتدا حذف/لغو شوند."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setUnitToDelete(null);
        }}
      />
    </div>
  );
}
