import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Plus, Edit2, Trash2, X, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import { rolesAPI, permissionsAPI } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import TreeView, {
  TreeNode,
  TreeData,
  CheckState,
  toTreeNodes,
  collectNodeIds,
  descendantIdsOf,
  ancestorIdsOf,
  computeCheckStates,
  applySubtreeCheck,
} from './TreeView';

interface Role extends TreeData {
  Id: number;
  Name: string;
  Description: string | null;
  ParentId: number | null;
  ParentName?: string | null;
  IsSystem: boolean;
  UserCount: number;
  PermissionCount: number;
  children?: Role[];
}

interface Permission extends TreeData {
  Id: number;
  Name: string;
  Description: string | null;
  Module: string;
  Action: string;
  ParentId: number | null;
  children?: Permission[];
}

const asArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

/** Depth-first flat list of a tree with depth info (for parent-select options). */
function flatten<T extends { id: number }>(
  nodes: TreeNode<T>[],
  depth = 0
): Array<{ data: T; depth: number }> {
  const out: Array<{ data: T; depth: number }> = [];
  for (const n of nodes) {
    out.push({ data: n.data, depth });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

export default function RoleManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [roleTree, setRoleTree] = useState<TreeNode<Role>[]>([]);
  const [permissionTree, setPermissionTree] = useState<TreeNode<Permission>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());
  const [expandedPerms, setExpandedPerms] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rolesRes, permissionsRes] = await Promise.all([
        rolesAPI.getAll(),
        permissionsAPI.getAll()
      ]);

      // The API returns either the role tree directly or { roles, tree }.
      const rawRoles: any = Array.isArray(rolesRes) ? rolesRes : rolesRes?.tree ?? rolesRes?.roles;
      const nodes = toTreeNodes<Role>(rawRoles);
      setRoleTree(nodes);
      setPermissionTree(toTreeNodes<Permission>(asArray(permissionsRes)));

      // Expand all role branches by default so the hierarchy is visible.
      setExpandedRoles(prev => {
        const next = new Set(prev);
        for (const id of collectNodeIds(nodes)) next.add(id);
        return next;
      });
    } catch (error: any) {
      console.error('Error loading data:', error);

      // Check if it's a 403 error (permission denied)
      if (error.message && error.message.includes('403')) {
        toast.error('شما دسترسی به مدیریت نقش‌ها ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.');
      } else {
        toast.error('خطا در بارگذاری اطلاعات');
      }
    } finally {
      setLoading(false);
    }
  };

  const flatRoles = useMemo(() => flatten(roleTree), [roleTree]);

  const handleAdd = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', parentId: '' });
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.Name,
      description: role.Description || '',
      parentId: role.ParentId != null ? String(role.ParentId) : ''
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (id: number) => {
    setRoleToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (roleToDelete == null) return;

    try {
      await rolesAPI.delete(roleToDelete);
      await loadData();
      toast.success('نقش با موفقیت حذف شد');
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast.error('خطا در حذف نقش', error.message);
    } finally {
      setShowDeleteConfirm(false);
      setRoleToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setErrors({ name: 'نام نقش الزامی است' });
      toast.warning('لطفاً نام نقش را وارد کنید');
      return;
    }

    const payload: Record<string, any> = {
      name: formData.name,
      description: formData.description
    };
    if (!editingRole && formData.parentId) {
      payload.parentId = Number(formData.parentId);
    }

    try {
      setSaving(true);

      if (editingRole) {
        await rolesAPI.update(editingRole.Id, payload);
        toast.success('نقش با موفقیت به‌روزرسانی شد');
      } else {
        await rolesAPI.create(payload);
        toast.success('نقش جدید با موفقیت ایجاد شد');
      }

      await loadData();
      setShowModal(false);
    } catch (error: any) {
      console.error('Error saving role:', error);
      toast.error('خطا در ذخیره نقش', error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRoleExpanded = (id: number) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Permission tree selection logic -------------------------------------
  // Tri-state rollup is now computed once per render by the shared helper in
  // TreeView (single pass, memoized) instead of the old recursive
  // permStateById() that was O(n²) and could not un-check indeterminate parents.

  /** id -> checked/unchecked/indeterminate for every permission node. */
  const permStates = useMemo(
    () => computeCheckStates(permissionTree, selectedPermissions),
    [permissionTree, selectedPermissions]
  );

  /** Stable id extraction (camel `id` first, then Pascal `Id`; NaN-safe). */
  const permIdOf = (perm: any): number => {
    const c = perm?.id;
    const n = Number(c !== undefined && c !== null ? c : perm?.Id);
    return Number.isFinite(n) ? n : NaN;
  };

  const togglePermNode = (id: number) => {
    const state = permStates.get(id) ?? 'unchecked';
    setSelectedPermissions(prev => applySubtreeCheck(permissionTree, prev, id, state !== 'checked'));
  };

  /** "Select all / deselect all" for the whole permission tree. */
  const togglePermSelectAll = () => {
    const anyChecked = [...permStates.values()].some(s => s !== 'unchecked');
    setSelectedPermissions(anyChecked ? [] : collectNodeIds(permissionTree));
  };

  /** Rollup state of the entire forest, for the select-all header checkbox. */
  const permAllState: CheckState = useMemo(() => {
    if (!permissionTree.length) return 'unchecked';
    let any = false;
    let all = true;
    const visit = (node: TreeNode<any>): CheckState => {
      const id = Number(node.data.id ?? node.data.Id);
      const own = permStates.get(id) ?? 'unchecked';
      if (own !== 'unchecked') any = true;
      if (own !== 'checked') all = false;
      for (const k of node.children ?? []) visit(k);
      return own;
    };
    for (const root of permissionTree) visit(root);
    return any ? (all ? 'checked' : 'indeterminate') : 'unchecked';
  }, [permStates, permissionTree]);

  const togglePermExpanded = (id: number) => {
    setExpandedPerms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleManagePermissions = async (role: Role) => {
    setSelectedRoleForPermissions(role);
    try {
      const roleDetails = await rolesAPI.getById(role.Id);
      const granted = asArray<Permission>(roleDetails?.permissions).map(p => Number(p.Id));
      setSelectedPermissions(granted);
      // Auto-expand branches that contain at least one grant
      const ids = new Set<number>();
      for (const gid of granted) {
        ids.add(gid);
        for (const anc of ancestorIdsOf(permissionTree, gid)) ids.add(anc);
      }
      setExpandedPerms(ids);
      setShowPermissionsModal(true);
    } catch (error) {
      console.error('Error loading role permissions:', error);
      toast.error('خطا در بارگذاری دسترسی‌ها');
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleForPermissions) return;

    try {
      setSaving(true);
      await rolesAPI.updatePermissions(selectedRoleForPermissions.Id, selectedPermissions);
      toast.success('دسترسی‌های نقش با موفقیت به‌روزرسانی شد');
      await loadData();
      setShowPermissionsModal(false);
    } catch (error: any) {
      console.error('Error saving permissions:', error);
      toast.error('خطا در ذخیره دسترسی‌ها', error.message);
    } finally {
      setSaving(false);
    }
  };

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="ent-card p-8 text-center max-w-md">
          <Shield size={64} className="text-[#BB0000] mx-auto mb-4" />
          <h3 className="ent-h2 mb-2">دسترسی محدود</h3>
          <p className="ent-body mb-4">
            شما دسترسی به مدیریت نقش‌ها ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.
          </p>
          <p className="ent-caption">
            نقش فعلی شما: <span className="font-semibold">{user?.role || 'نامشخص'}</span>
          </p>
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
          <h2 className="ent-h1 mb-1">مدیریت نقش‌ها</h2>
          <p className="ent-body">{flatRoles.length} نقش تعریف شده</p>
        </div>
        <button onClick={handleAdd} className="ent-btn-primary flex items-center gap-2">
          <Plus size={16} />
          <span>ایجاد نقش جدید</span>
        </button>
      </div>

      {/* Roles Tree (real tree component) */}
      <div className="ent-card p-5 animate-fade-in">
        <TreeView<Role>
          nodes={roleTree}
          expandedIds={expandedRoles}
          onToggleExpand={toggleRoleExpanded}
          emptyMessage="نقشی تعریف نشده است"
          renderNode={(role, _depth, node) => (
            <div className="flex items-center gap-2 flex-wrap py-0.5">
              <span className="font-semibold text-[13px]">{role.Name}</span>
              {role.IsSystem && (
                <span className="ent-badge ent-badge-info text-[10px] px-1.5 py-0">سیستمی</span>
              )}
              {role.Description && (
                <span className="ent-caption hidden md:inline">{role.Description}</span>
              )}
              <span className="ent-caption">
                {role.UserCount} کاربر · {role.PermissionCount} دسترسی
                {node.children?.length ? ` · ${collectNodeIds(node.children).length} نقش فرزند` : ''}
              </span>
            </div>
          )}
          renderActions={(role) => (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleManagePermissions(role); }}
                className="p-1.5 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                title="مدیریت دسترسی‌ها"
              >
                <KeyRound size={15} />
              </button>
              {!role.IsSystem && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(role); }}
                    className="p-1.5 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                    title="ویرایش"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(Number(role.Id)); }}
                    className="p-1.5 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded transition-colors"
                    title="حذف"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </>
          )}
        />
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingRole ? 'ویرایش نقش' : 'ایجاد نقش جدید'}
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
                  نام نقش <span className="ent-form-required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`ent-input ${errors.name ? 'border-[#BB0000]' : ''}`}
                  placeholder="مثال: مدیر فروش"
                  disabled={!!editingRole}
                />
                {errors.name && (
                  <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.name}
                  </p>
                )}
              </div>

              {!editingRole && (
                <div className="ent-form-group">
                  <label className="ent-form-label">نقش والد</label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="ent-input"
                  >
                    <option value="">— بدون والد (نقش پایه) —</option>
                    {flatRoles.map(r => (
                      <option key={r.data.Id} value={r.data.Id}>
                        {'— '.repeat(r.depth)}{r.data.Name}
                      </option>
                    ))}
                  </select>
                  <p className="ent-caption mt-1">
                    نقش جدید تمام دسترسی‌های نقش والد و اجداد آن را به ارث می‌برد.
                  </p>
                </div>
              )}

              <div className="ent-form-group">
                <label className="ent-form-label">توضیحات</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="ent-input resize-none h-24"
                  placeholder="توضیحات نقش..."
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
                  <span>{editingRole ? 'ذخیره تغییرات' : 'ایجاد نقش'}</span>
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

      {/* Permissions Modal — permission tree with tri-state checkboxes */}
      {showPermissionsModal && selectedRoleForPermissions && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="ent-modal-header flex items-center justify-between">
              <div>
                <h3 className="ent-h2">مدیریت دسترسی‌ها</h3>
                <p className="ent-caption mt-1">نقش: {selectedRoleForPermissions.Name}</p>
              </div>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="p-2 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ent-modal-body overflow-y-auto flex-1">
              <p className="ent-body mb-4">
                درخت دسترسی‌ها را انتخاب کنید؛ انتخاب یک گره، تمام زیرمجموعه‌های آن را هم شامل می‌شود:
              </p>

              {/* Select-all header */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#E5E5E5]">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={permAllState === 'checked'}
                    ref={el => {
                      if (el) el.indeterminate = permAllState === 'indeterminate';
                    }}
                    onChange={() => togglePermSelectAll()}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  انتخاب همه ({collectNodeIds(permissionTree).length})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedPerms(new Set(collectNodeIds(permissionTree)))}
                    className="ent-caption hover:text-[#0A6ED1] transition-colors"
                  >
                    باز کردن همه
                  </button>
                  <span className="text-[#E5E5E5]">|</span>
                  <button
                    type="button"
                    onClick={() => setExpandedPerms(new Set())}
                    className="ent-caption hover:text-[#0A6ED1] transition-colors"
                  >
                    بستن همه
                  </button>
                </div>
              </div>

              <TreeView<Permission>
                nodes={permissionTree}
                expandedIds={expandedPerms}
                onToggleExpand={togglePermExpanded}
                checkStateOf={(perm) => permStates.get(permIdOf(perm)) ?? 'unchecked'}
                onToggleCheck={(perm) => togglePermNode(permIdOf(perm))}
                emptyMessage="دسترسی‌ای تعریف نشده است"
                renderNode={(perm) => (
                  <div className="py-0.5">
                    <span className="font-medium text-[13px]">{perm.Name}</span>
                    {perm.Description && (
                      <span className="ent-caption mr-2 hidden md:inline">{perm.Description}</span>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="ent-modal-footer">
              <button
                onClick={handleSavePermissions}
                disabled={saving}
                className="ent-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <span>ذخیره دسترسی‌ها</span>
                )}
              </button>
              <button
                onClick={() => setShowPermissionsModal(false)}
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
        title="حذف نقش"
        message="آیا از حذف این نقش مطمئن هستید؟ نقوش فرزند باید ابتدا حذف شوند."
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setRoleToDelete(null);
        }}
      />
    </div>
  );
}
