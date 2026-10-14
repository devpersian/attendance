import React, { useState, useEffect } from 'react';
import {
  Shield, Plus, Edit2, Trash2, X, Search, Loader2, AlertCircle,
  UserCheck, UserX, Star, Building2, KeyRound, LogOut,
} from 'lucide-react';
import { rolesAPI, unitsAPI, userRolesAPI, usersAPI, RoleAssignment } from '../utils/api';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import SearchableDropdown from './SearchableDropdown';
import TreeView, { TreeNode, TreeData, CheckState, toTreeNodes, collectNodeIds, descendantIdsOf, buildParentMap, ancestorsOf } from './TreeView';
import { useAuth } from '../contexts/AuthContext';

interface User {
  Id?: number;
  id: string | number;
  username: string;
  email: string;
  role: string;
  employeeId?: string | number | null;
  employeeName?: string;
  isActive: boolean;
}

interface RoleOption extends TreeData {
  Id?: number;
  Name: string;
  ParentId?: number | null;
  IsSystem?: boolean;
  children?: RoleOption[];
}

interface UnitOption extends TreeData {
  Id?: number;
  Name: string;
  ParentId?: number | null;
  children?: UnitOption[];
}

const uid = (u: User): number => Number(u.id ?? u.Id);
const asArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

/** Depth-first flat list of a tree with depth info. */
function flatten<T extends TreeData>(nodes: TreeNode<T>[], depth = 0): Array<{ data: T; depth: number }> {
  const out: Array<{ data: T; depth: number }> = [];
  for (const n of nodes) {
    out.push({ data: n.data, depth });
    if (n.children?.length) out.push(...flatten(n.children as TreeNode<T>[], depth + 1));
  }
  return out;
}

export default function UserManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [users, setUsers] = React.useState<User[]>([]);
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [roleTree, setRoleTree] = useState<TreeNode<RoleOption>[]>([]);
  const [unitTree, setUnitTree] = useState<TreeNode<UnitOption>[]>([]);
  const [showModal, setShowModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = React.useState({
    username: '',
    password: '',
    email: '',
    role: 'employee',
    employeeId: '',
    isActive: true
  });

  // --- Role-in-unit assignments (draft while the modal is open) -------------
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());
  const [pickRoleId, setPickRoleId] = useState<string>('');
  const [pickUnitId, setPickUnitId] = useState<string>(''); // '' = global
  const [assignBusy, setAssignBusy] = React.useState(false);

  const roles = [
    { value: 'admin', label: 'مدیر سیستم' },
    { value: 'manager', label: 'مدیر بخش' },
    { value: 'employee', label: 'کارمند' }
  ];

  useEffect(() => {
    loadUsers();
    loadEmployees();
    loadRolesAndUnits();
  }, []);

  const loadEmployees = async () => {
    try {
      const { getEmployees } = await import('../utils/storage');
      const emps = await getEmployees();
      setEmployees(emps);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadRolesAndUnits = async () => {
    try {
      const [rolesRes, unitsRes]: any[] = await Promise.all([
        rolesAPI.getAll(),
        unitsAPI.getAll(),
      ]);
      const rawRoles = Array.isArray(rolesRes) ? rolesRes : rolesRes?.tree ?? rolesRes?.roles;
      const rNodes = toTreeNodes<RoleOption>(rawRoles);
      setRoleTree(rNodes);

      const rawUnits = Array.isArray(unitsRes) ? unitsRes : unitsRes?.tree ?? unitsRes?.units;
      const uNodes = toTreeNodes<UnitOption>(rawUnits);
      setUnitTree(uNodes);
      setExpandedUnits(new Set(collectNodeIds(uNodes)));
    } catch (error) {
      console.error('Error loading roles/units:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { getUsers } = await import('../utils/storage');
      const usersData = await getUsers();
      setUsers(usersData);
    } catch (error: any) {
      console.error('Error loading users:', error);

      // Check if it's a 403 error (permission denied)
      if (error.message && error.message.includes('403')) {
        toast.error('شما دسترسی به مدیریت کاربران ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.');
      } else {
        toast.error('خطا در بارگذاری کاربران');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const username = user.username || '';
    const email = user.email || '';
    const role = user.role || '';
    return username.includes(searchTerm) || email.includes(searchTerm) || role.includes(searchTerm);
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'نام کاربری الزامی است';
    }

    if (!editingUser && !formData.password) {
      newErrors.password = 'رمز عبور الزامی است';
    }

    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'رمز عبور باید حداقل 6 کاراکتر باشد';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'فرمت ایمیل نامعتبر است';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      email: '',
      role: 'employee',
      employeeId: '',
      isActive: true
    });
    setAssignments([]);
    setPickRoleId('');
    setPickUnitId('');
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = async (u: User) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '',
      email: u.email || '',
      role: u.role,
      employeeId: String(u.employeeId ?? ''),
      isActive: u.isActive
    });
    setPickRoleId('');
    setPickUnitId('');
    setErrors({});
    setShowModal(true);

    // Load this user's role-per-unit assignments
    try {
      setAssignBusy(true);
      const list = await userRolesAPI.getUserRoles(uid(u));
      setAssignments(asArray<RoleAssignment>(list));
    } catch (error) {
      console.error('Error loading user role assignments:', error);
      setAssignments([]);
    } finally {
      setAssignBusy(false);
    }
  };

  // Phase 1 / P1.5 — force-logout (revoke all refresh-token sessions)
  const handleRevokeSessions = async (u: User) => {
    try {
      await usersAPI.revokeSessions(uid(u));
      toast.success('همه نشست‌های این کاربر خاتمه یافت');
    } catch (e: any) {
      toast.error(e?.message || 'خطا در ابطال نشست‌ها');
    }
  };

  const handleDeleteClick = (id: string) => {
    setUserToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      const { deleteUser } = await import('../utils/storage');
      await deleteUser(String(userToDelete));
      await loadUsers();
      toast.success('کاربر با موفقیت حذف شد');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('خطا در حذف کاربر');
    } finally {
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setSaving(true);

      // Convert empty employeeId to null
      const dataToSave = {
        ...formData,
        employeeId: formData.employeeId || null
      };

      let savedUserId: number | null = editingUser ? uid(editingUser) : null;

      if (editingUser) {
        const { updateUser } = await import('../utils/storage');
        await updateUser(editingUser.id, dataToSave);
        toast.success('کاربر با موفقیت به‌روزرسانی شد');
      } else {
        const { createUser } = await import('../utils/storage');
        const created: any = await createUser(dataToSave);
        savedUserId = Number(created?.id ?? created?.Id ?? created?.userId ?? 0) || null;
        toast.success('کاربر جدید با موفقیت ایجاد شد');
      }

      // Persist role-per-unit assignments (only for existing / newly-created users)
      if (savedUserId) {
        try {
          await userRolesAPI.updateUserRoles(
            savedUserId,
            assignments.map(a => ({
              roleId: a.roleId,
              unitId: a.unitId ?? null,
              isPrimary: a.isPrimary,
            }))
          );
        } catch (err: any) {
          console.error('Error saving role assignments:', err);
          toast.error('اطلاعات کاربر ذخیره شد اما نقش‌ها ثبت نشدند', err.message);
        }
      } else if (assignments.length > 0) {
        toast.warning('کاربر ساخته شد؛ لطفاً برای اختصاص نقش، دوباره او را ویرایش کنید');
      }

      await loadUsers();
      setShowModal(false);
    } catch (error: any) {
      console.error('Error saving user:', error);

      // Show detailed error message
      let errorMessage = 'خطا در ذخیره کاربر';
      if (error.message) {
        if (error.message.includes('FOREIGN KEY')) {
          errorMessage = 'کارمند انتخاب شده معتبر نیست';
        } else if (error.message.includes('duplicate') || error.message.includes('تکراری')) {
          errorMessage = 'این نام کاربری قبلاً ثبت شده است';
        } else if (error.details) {
          errorMessage = error.details;
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // --- Assignment editor helpers --------------------------------------------

  const addAssignment = () => {
    if (!pickRoleId) {
      toast.warning('ابتدا یک نقش انتخاب کنید');
      return;
    }
    const roleId = Number(pickRoleId);
    const unitId = pickUnitId === '' ? null : Number(pickUnitId);
    if (assignments.some(a => a.roleId === roleId && a.unitId === unitId)) {
      toast.warning('این نقش برای این واحد قبلاً اختصاص یافته است');
      return;
    }
    const role = flatRoles.find(r => Number(r.data.id ?? r.data.Id) === roleId)?.data;
    const unitName = unitId == null ? null : unitFlat.find(u => Number(u.data.id ?? u.data.Id) === unitId)?.data.Name ?? null;
    const next: RoleAssignment[] = [
      ...assignments,
      {
        roleId,
        roleName: role?.Name ?? String(roleId),
        unitId,
        unitName,
        isPrimary: assignments.length === 0,
      },
    ];
    setAssignments(next);
    setPickRoleId('');
    setPickUnitId('');
  };

  const removeAssignment = (index: number) => {
    const next = assignments.filter((_, i) => i !== index);
    // keep exactly one primary if possible
    if (next.length > 0 && !next.some(a => a.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    setAssignments(next);
  };

  const setPrimary = (index: number) => {
    setAssignments(assignments.map((a, i) => ({ ...a, isPrimary: i === index })));
  };

  const toggleUnitExpanded = (id: number) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Assign the picked role to this unit and every descendant unit (subtree). */
  const addAssignmentToSubtree = (unitId: number) => {
    if (!pickRoleId) {
      toast.warning('ابتدا یک نقش انتخاب کنید');
      return;
    }
    const roleId = Number(pickRoleId);
    const role = flatRoles.find(r => Number(r.data.id ?? r.data.Id) === roleId)?.data;
    const targets = [unitId, ...descendantIdsOf(unitTree, unitId)];
    const next = [...assignments];
    let added = 0;
    for (const tid of targets) {
      if (next.some(a => a.roleId === roleId && a.unitId === tid)) continue;
      const unitName = unitFlat.find(u => Number(u.data.id ?? u.data.Id) === tid)?.data.Name ?? String(tid);
      next.push({
        roleId,
        roleName: role?.Name ?? String(roleId),
        unitId: tid,
        unitName,
        isPrimary: next.length === 0,
      });
      added++;
    }
    if (added === 0) {
      toast.warning('این نقش برای همه واحدهای این زیردرخت از قبل اختصاص یافته است');
      return;
    }
    setAssignments(next);
    setPickRoleId('');
    setPickUnitId('');
  };

  /** Remove the picked role from this unit and all descendant units. */
  const removeRoleFromSubtree = (unitId: number, roleId: number) => {
    const targets = new Set([unitId, ...descendantIdsOf(unitTree, unitId)]);
    const next = assignments.filter(a => !(a.roleId === roleId && a.unitId != null && targets.has(Number(a.unitId))));
    if (next.length > 0 && !next.some(a => a.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    setAssignments(next);
  };

  // --- Unit-tree checkbox rollup helpers -------------------------------------
  // The picker's "checked" notion is per-role (assignments are (role, unit)
  // pairs). These memoized helpers give single-pass semantics: ancestor
  // implication plus a bottom-up indeterminate rollup for the picked role.

  /** roleId -> set of unit ids explicitly assigned that role (finite ids only). */
  const roleUnitSets = React.useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const a of assignments) {
      if (a.unitId == null) continue; // global assignment — not part of the tree
      const uid = Number(a.unitId);
      if (!Number.isFinite(uid)) continue;
      if (!map.has(a.roleId)) map.set(a.roleId, new Set());
      map.get(a.roleId)!.add(uid);
    }
    return map;
  }, [assignments]);

  /** Stable unit id extraction (camel `id` first, then Pascal `Id`; NaN-safe). */
  const unitIdOf = (unit: any): number => {
    const c = unit?.id;
    const n = Number(c !== undefined && c !== null ? c : unit?.Id);
    return Number.isFinite(n) ? n : NaN;
  };

  /** Bottom-up rollup for one role over the whole unit tree. */
  const unitRoleStates = React.useMemo(() => {
    const cache = new Map<number, Map<number, CheckState>>();
    return (roleId: number): Map<number, CheckState> => {
      const hit = cache.get(roleId);
      if (hit) return hit;
      const explicit = roleUnitSets.get(roleId) ?? new Set<number>();
      const states = new Map<number, CheckState>();
      const visit = (node: TreeNode<UnitOption>, ancestors: number[]): CheckState => {
        const id = unitIdOf(node.data);
        let anyKid = false;
        let allKids = true;
        for (const k of node.children ?? []) {
          const s = visit(k, [...ancestors, id]);
          if (s !== 'unchecked') anyKid = true;
          if (s !== 'checked') allKids = false;
        }
        const mine = explicit.has(id) || ancestors.some(a => explicit.has(a));
        const st: CheckState = mine ? 'checked' : anyKid ? (allKids ? 'checked' : 'indeterminate') : 'unchecked';
        if (Number.isFinite(id)) states.set(id, st);
        return st;
      };
      for (const root of unitTree) visit(root, []);
      cache.set(roleId, states);
      return states;
    };
  }, [unitTree, roleUnitSets]);

  /** True when some *descendant* of `id` carries the picked role (explicit or implied). */
  const hasCheckedDescendant = (id: number): boolean => {
    const kids = descendantIdsOf(unitTree, id);
    if (pickRoleId) {
      const states = unitRoleStates(Number(pickRoleId));
      return kids.some(k => (states.get(k) ?? 'unchecked') !== 'unchecked');
    }
    // Read-only mode (no role picked): any assignment anywhere in the subtree counts.
    return kids.some(k => (assignmentsByUnit.get(k) || []).length > 0);
  };

  const flatRoles = React.useMemo(() => flatten(roleTree), [roleTree]);
  const unitFlat = React.useMemo(() => flatten(unitTree), [unitTree]);

  const assignmentsByUnit = React.useMemo(() => {
    const map = new Map<number | 'global', RoleAssignment[]>();
    for (const a of assignments) {
      const key = a.unitId == null ? 'global' : Number(a.unitId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignments]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return <span className="ent-badge ent-badge-danger">مدیر سیستم</span>;
      case 'manager': return <span className="ent-badge ent-badge-warning">مدیر بخش</span>;
      case 'employee': return <span className="ent-badge ent-badge-info">کارمند</span>;
      default: return <span className="ent-badge ent-badge-neutral">{role}</span>;
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
            شما دسترسی به مدیریت کاربران ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.
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

  /** Render the per-unit role chips under each unit node in the picker tree. */
  const renderUnitNode = (unit: UnitOption, _depth: number, node: TreeNode<UnitOption>) => {
    const id = unitIdOf(unit);
    const chips = assignmentsByUnit.get(id) || [];
    const canApplySubtree = !!pickRoleId && !!(node.children?.length || chips.length);
    return (
      <div className="flex items-center gap-2 flex-wrap py-0.5">
        <span className="font-medium text-[13px]">{unit.Name}</span>
        {chips.map(chip => (
          <span
            key={`${chip.roleId}-${chip.unitId}`}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
              chip.isPrimary
                ? 'border-[#F0B429] bg-[#FFF8E6] text-[#7A5B00]'
                : 'border-[#9CC7EA] bg-[#F0F6FF] text-[#0A4E91]'
            }`}
          >
            <KeyRound size={10} />
            {chip.roleName}
            {chip.isPrimary && <Star size={10} className="fill-current" />}
            {node.children?.length && (
              <button
                type="button"
                title="حذف این نقش از همه واحدهای زیرمجموعه"
                onClick={(e) => { e.stopPropagation(); removeRoleFromSubtree(id, chip.roleId); }}
                className="mr-0.5 text-[#BB0000] hover:underline"
              >
                ×کل زیردرخت
              </button>
            )}
          </span>
        ))}
        {canApplySubtree && (
          <button
            type="button"
            title="اختصاص نقش انتخاب‌شده به این واحد و همه زیرمجموعه‌ها"
            onClick={(e) => { e.stopPropagation(); addAssignmentToSubtree(id); }}
            className="text-[11px] px-2 py-0.5 rounded border border-dashed border-[#0A6ED1] text-[#0A6ED1] hover:bg-[#EEF5FF] transition-colors"
          >
            + نقش انتخابی در کل زیردرخت
          </button>
        )}
        {!node.children?.length && chips.length === 0 && (
          <span className="ent-caption text-[11px]">— بدون نقش —</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h2 className="ent-h1 mb-1">مدیریت کاربران</h2>
          <p className="ent-body">{users.length} کاربر ثبت شده</p>
        </div>
        <button
          onClick={handleAdd}
          className="ent-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>افزودن کاربر</span>
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

      {/* Users Table */}
      <div className="ent-card overflow-hidden animate-fade-in stagger-2">
        <table className="ent-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>ایمیل</th>
              <th>نقش</th>
              <th>کارمند</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={String(user.id)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#0A6ED1] rounded flex items-center justify-center text-white text-sm font-semibold">
                      {user.username.charAt(0)}
                    </div>
                    <span className="font-medium">{user.username}</span>
                  </div>
                </td>
                <td className="ent-body" dir="ltr">{user.email || '-'}</td>
                <td>{getRoleBadge(user.role)}</td>
                <td className="ent-body">{user.employeeName || '-'}</td>
                <td>
                  {user.isActive ? (
                    <span className="ent-badge ent-badge-success flex items-center gap-1">
                      <UserCheck size={12} />
                      فعال
                    </span>
                  ) : (
                    <span className="ent-badge ent-badge-neutral flex items-center gap-1">
                      <UserX size={12} />
                      غیرفعال
                    </span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-2 text-[#5A5E63] hover:text-[#0A6ED1] hover:bg-[#F0F6FF] rounded transition-colors"
                      title="ویرایش"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleRevokeSessions(user)}
                      className="p-2 text-[#5A5E63] hover:text-[#D9820B] hover:bg-[#FFF8F0] rounded transition-colors"
                      title="خاتمه همه نشست‌ها (Force Logout)"
                    >
                      <LogOut size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(String(user.id))}
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
        {filteredUsers.length === 0 && (
          <div className="text-center py-16">
            <Shield size={56} className="mx-auto mb-3 text-[#8A8E93]" />
            <p className="ent-body">
              {searchTerm ? 'کاربری یافت نشد' : 'هنوز کاربری اضافه نشده است'}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="ent-modal max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="ent-modal-header flex items-center justify-between">
              <h3 className="ent-h2">
                {editingUser ? `ویرایش کاربر — ${editingUser.username}` : 'افزودن کاربر جدید'}
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
                    نام کاربری <span className="ent-form-required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => {
                      setFormData({ ...formData, username: e.target.value });
                      if (errors.username) setErrors({ ...errors, username: '' });
                    }}
                    className={`ent-input ${errors.username ? 'border-[#BB0000]' : ''}`}
                    placeholder="username"
                    disabled={!!editingUser}
                    dir="ltr"
                  />
                  {errors.username && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.username}
                    </p>
                  )}
                </div>

                {!editingUser && (
                  <div className="ent-form-group">
                    <label className="ent-form-label">
                      رمز عبور <span className="ent-form-required">*</span>
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => {
                        setFormData({ ...formData, password: e.target.value });
                        if (errors.password) setErrors({ ...errors, password: '' });
                      }}
                      className={`ent-input ${errors.password ? 'border-[#BB0000]' : ''}`}
                      placeholder="••••••••"
                      dir="ltr"
                    />
                    {errors.password && (
                      <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {errors.password}
                      </p>
                    )}
                  </div>
                )}

                <div className="ent-form-group">
                  <label className="ent-form-label">ایمیل</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (errors.email) setErrors({ ...errors, email: '' });
                    }}
                    className={`ent-input ${errors.email ? 'border-[#BB0000]' : ''}`}
                    placeholder="user@company.com"
                    dir="ltr"
                  />
                  {errors.email && (
                    <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="ent-form-group">
                  <label className="ent-form-label">نقش پایه (Legacy)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="ent-input"
                  >
                    {roles.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>

                <div className="ent-form-group">
                  <SearchableDropdown
                    label="کارمند مرتبط (اختیاری)"
                    options={employees.map(emp => ({
                      value: emp.id,
                      label: emp.name || 'نامشخص',
                      sublabel: emp.personnelCode || '---'
                    }))}
                    value={formData.employeeId}
                    onChange={(value) => setFormData({ ...formData, employeeId: value })}
                    placeholder="-- انتخاب کارمند --"
                  />
                </div>

                <div className="ent-form-group flex items-end pb-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="ent-form-label mb-0">حساب فعال</span>
                  </label>
                </div>
              </div>

              {/* --- Roles in units (tree-based assignment) --- */}
              <div className="ent-card border border-[#E5E5E5] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-[#0A6ED1]" />
                  <h4 className="ent-h3">نقش‌های در واحدهای سازمانی</h4>
                </div>
                <p className="ent-caption">
                  یک کاربر می‌تواند نقش‌های متفاوت در واحدهای متفاوت داشته باشد (مثلاً «مدیر» در یک شرکت و
                  «کارمند» در زیرواحدی دیگر). نقش بدون واحد = سراسری (اعتبار در همه واحدها). starred = نقش اصلی.
                </p>

                {/* Add-assignment row */}
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="ent-form-label">نقش</label>
                    <select
                      value={pickRoleId}
                      onChange={(e) => setPickRoleId(e.target.value)}
                      className="ent-input"
                    >
                      <option value="">— انتخاب نقش —</option>
                      {flatRoles.map(r => (
                        <option key={Number(r.data.id ?? r.data.Id)} value={Number(r.data.id ?? r.data.Id)}>
                          {'— '.repeat(r.depth)}{r.data.Name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="ent-form-label">واحد</label>
                    <select
                      value={pickUnitId}
                      onChange={(e) => setPickUnitId(e.target.value)}
                      className="ent-input"
                    >
                      <option value="">سراسری (همه واحدها)</option>
                      {unitFlat.map(u => (
                        <option key={Number(u.data.id ?? u.data.Id)} value={Number(u.data.id ?? u.data.Id)}>
                          {'— '.repeat(u.depth)}{u.data.Name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={addAssignment}
                    className="ent-btn-secondary flex items-center gap-1 justify-center shrink-0"
                  >
                    <Plus size={14} />
                    افزودن
                  </button>
                </div>

                {/* Global assignments */}
                {(assignmentsByUnit.get('global') || []).length > 0 && (
                  <div className="space-y-1">
                    <p className="ent-label">سراسری</p>
                    {(assignmentsByUnit.get('global') || []).map(a => (
                      <AssignmentRow
                        key={`g-${a.roleId}`}
                        assignment={a}
                        index={assignments.indexOf(a)}
                        onRemove={removeAssignment}
                        onPrimary={setPrimary}
                      />
                    ))}
                  </div>
                )}

                {/* Units tree with per-unit role chips (checkbox mode) */}
                <div className="border border-[#E5E5E5] rounded p-2 max-h-64 overflow-y-auto">
                  {/* Select-all / expand-collapse header for the unit tree */}
                  <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-[#F0F0F0]">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={unitTree.length > 0 && collectNodeIds(unitTree).every(id => (assignmentsByUnit.get(id) || []).length > 0)}
                        onChange={(e) => {
                          if (!pickRoleId) {
                            toast.warning('ابتدا یک نقش انتخاب کنید');
                            return;
                          }
                          const roleId = Number(pickRoleId);
                          const role = flatRoles.find(r => Number(r.data.id ?? r.data.Id) === roleId)?.data;
                          if (e.target.checked) {
                            // Assign picked role to every unit in the tree
                            const next = [...assignments];
                            for (const id of collectNodeIds(unitTree)) {
                              if (next.some(a => a.roleId === roleId && a.unitId === id)) continue;
                              const unitName = unitFlat.find(u => Number(u.data.id ?? u.data.Id) === id)?.data.Name ?? String(id);
                              next.push({ roleId, roleName: role?.Name ?? String(roleId), unitId: id, unitName, isPrimary: next.length === 0 });
                            }
                            setAssignments(next);
                          } else {
                            // Remove picked role from all units (keep global)
                            setAssignments(assignments.filter(a => !(a.roleId === roleId && a.unitId != null)));
                          }
                          setPickRoleId('');
                          setPickUnitId('');
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      همه واحدها ({collectNodeIds(unitTree).length})
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setExpandedUnits(new Set(collectNodeIds(unitTree)))}
                        className="ent-caption hover:text-[#0A6ED1] transition-colors"
                      >
                        باز کردن همه
                      </button>
                      <span className="text-[#E5E5E5]">|</span>
                      <button
                        type="button"
                        onClick={() => setExpandedUnits(new Set())}
                        className="ent-caption hover:text-[#0A6ED1] transition-colors"
                      >
                        بستن همه
                      </button>
                    </div>
                  </div>

                  <TreeView<UnitOption>
                    nodes={unitTree}
                    expandedIds={expandedUnits}
                    onToggleExpand={toggleUnitExpanded}
                    emptyMessage="واحدی تعریف نشده است — ابتدا از «واحدهای سازمانی» بسازید"
                    renderNode={renderUnitNode}
                    checkStateOf={(unit) => {
                      const id = unitIdOf(unit);
                      if (!pickRoleId) {
                        // Read-only indication: this unit or its subtree holds any role.
                        const chips = assignmentsByUnit.get(id) || [];
                        if (chips.length) return 'checked';
                        return hasCheckedDescendant(id) ? 'indeterminate' : 'unchecked';
                      }
                      return unitRoleStates(Number(pickRoleId)).get(id) ?? 'unchecked';
                    }}
                    onToggleCheck={(unit) => {
                      if (!pickRoleId) {
                        toast.warning('ابتدا یک نقش انتخاب کنید تا بتوانید واحد را تیک بزنید');
                        return;
                      }
                      const id = unitIdOf(unit);
                      const roleId = Number(pickRoleId);
                      const hasRole = (assignmentsByUnit.get(id) || []).some(c => c.roleId === roleId);
                      if (hasRole) {
                        removeRoleFromSubtree(id, roleId);
                      } else {
                        addAssignmentToSubtree(id);
                      }
                    }}
                  />
                </div>

                {/* All assignments list (manage/remove/set primary) */}
                {assignments.length > 0 && (
                  <div className="space-y-1">
                    <p className="ent-label">اختصاص‌ها ({assignments.length})</p>
                    {assignments.map((a, i) => (
                      <AssignmentRow
                        key={`${a.roleId}-${a.unitId ?? 'g'}-${i}`}
                        assignment={a}
                        index={i}
                        onRemove={removeAssignment}
                        onPrimary={setPrimary}
                      />
                    ))}
                  </div>
                )}
                {assignBusy && (
                  <p className="ent-caption flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> در حال بارگذاری نقش‌ها...
                  </p>
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
                  <span>{editingUser ? 'ذخیره تغییرات' : 'افزودن کاربر'}</span>
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
        title="حذف کاربر"
        message="آیا از حذف این کاربر مطمئن هستید؟"
        confirmText="حذف"
        cancelText="انصراف"
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setUserToDelete(null);
        }}
      />
    </div>
  );
}

function AssignmentRow({
  assignment,
  index,
  onRemove,
  onPrimary,
}: {
  assignment: RoleAssignment;
  index: number;
  onRemove: (index: number) => void;
  onPrimary: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm border border-[#E5E5E5] rounded px-2 py-1.5 bg-white">
      <button
        type="button"
        onClick={() => onPrimary(index)}
        title="تنظیم به‌عنوان نقش اصلی"
        className={assignment.isPrimary ? 'text-[#F0B429]' : 'text-[#C2C6CB] hover:text-[#F0B429]'}
      >
        <Star size={14} className={assignment.isPrimary ? 'fill-current' : ''} />
      </button>
      <KeyRound size={13} className="text-[#0A6ED1] shrink-0" />
      <span className="font-medium">{assignment.roleName}</span>
      <span className="ent-caption">
        در: {assignment.unitId == null ? 'سراسری (همه واحدها)' : assignment.unitName || `واحد #${assignment.unitId}`}
      </span>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mr-auto p-1 text-[#5A5E63] hover:text-[#BB0000] hover:bg-[#FFF5F5] rounded"
        title="لغو اختصاص"
      >
        <X size={14} />
      </button>
    </div>
  );
}
