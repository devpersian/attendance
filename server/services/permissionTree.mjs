/**
 * Permission & Role tree helpers.
 *
 * Both attendance.Roles and attendance.Permissions are hierarchical trees:
 *   - Permissions.ParentId : root node (module, Action='*') -> action leaves
 *   - Roles.ParentId       : e.g. مدیر سیستم -> مدیر -> کارمند
 *
 * Inheritance rules applied everywhere permissions are resolved:
 *   1. A role inherits every permission granted to any of its ancestor roles.
 *   2. Granting a permission node implicitly grants all of its descendants.
 */
import { execute } from '../db.mjs';

/** Load the full permission catalogue as an array of rows. */
export async function getAllPermissions() {
  return execute(
    `SELECT Id, Name, Description, Module, Action, ParentId, SortOrder
     FROM attendance.Permissions
     ORDER BY Module, SortOrder, Action`
  );
}

/** Build Map<parentId, child[]> from flat rows carrying Id/ParentId. */
export function buildChildrenMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.ParentId != null) {
      const key = Number(row.ParentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

/** Subtree closure: expand a set of granted ids to include every descendant. */
export function expandWithDescendants(grantedIds, rows) {
  const childrenMap = buildChildrenMap(rows);
  const expanded = new Set([...grantedIds].map(Number));
  const stack = [...expanded];
  while (stack.length) {
    const id = Number(stack.pop());
    for (const child of childrenMap.get(id) || []) {
      const cid = Number(child.Id);
      if (!expanded.has(cid)) {
        expanded.add(cid);
        stack.push(cid);
      }
    }
  }
  return expanded;
}

/** Ancestor closure on the role tree via recursive CTE. Returns role ids. */
export async function getRoleAncestors(roleIds) {
  // Safe: every id is validated as a finite integer before interpolation.
  const ids = [...new Set((roleIds || []).map(Number).filter(n => Number.isFinite(n)))];
  if (ids.length === 0) return [];
  const idList = ids.join(',');

  const rows = await execute(
    `WITH RoleTree AS (
       SELECT Id, ParentId FROM attendance.Roles WHERE Id IN (${idList})
       UNION ALL
       SELECT r.Id, r.ParentId
       FROM attendance.Roles r
       INNER JOIN RoleTree rt ON r.Id = rt.ParentId
     )
     SELECT DISTINCT Id FROM RoleTree`
  );
  return rows.map(r => Number(r.Id));
}

/**
 * Load a user's role assignments from attendance.UserRoles.
 * Each assignment: { roleId, roleName, unitId, unitName, isPrimary }.
 * unitId === null means the assignment is global (valid in every unit).
 */
export async function getUserRoleAssignments(userId) {
  const rows = await execute(
    `SELECT ur.RoleId, r.Name AS RoleName, ur.UnitId, u.Name AS UnitName, ur.IsPrimary
     FROM attendance.UserRoles ur
     INNER JOIN attendance.Roles r ON ur.RoleId = r.Id
     LEFT JOIN attendance.Units u ON ur.UnitId = u.Id
     WHERE ur.UserId = @userId
     ORDER BY ISNULL(ur.IsPrimary, 0) DESC, u.Name`,
    { userId }
  );

  return rows.map(row => ({
    roleId: Number(row.RoleId),
    roleName: row.RoleName,
    unitId: row.UnitId == null ? null : Number(row.UnitId),
    unitName: row.UnitName ?? null,
    isPrimary: !!row.IsPrimary,
  }));
}

/**
 * Resolve which of a user's assignments apply to a requested unit scope.
 *   - scopeUnitId null/undefined -> all assignments (global view)
 *   - otherwise                  -> global assignments + those for that unit
 */
export function filterAssignmentsByUnit(assignments, scopeUnitId) {
  const unit = scopeUnitId == null || scopeUnitId === '' ? null : Number(scopeUnitId);
  if (unit == null || !Number.isFinite(unit)) return assignments;
  return assignments.filter(a => a.unitId === null || a.unitId === unit);
}

/**
 * Effective permission ids for a set of role assignments
 * (from getUserRoleAssignments), optionally scoped to one unit:
 * grants of the assigned roles + all ancestor roles, expanded down the
 * permission tree. Multiple roles in different units are unioned together.
 */
export async function getEffectivePermissionsForAssignments(assignments, scopeUnitId = null) {
  const applicable = filterAssignmentsByUnit(assignments, scopeUnitId);
  const roleIds = applicable.map(a => a.roleId);
  return getEffectivePermissionIds(roleIds);
}

/**
 * Effective permission ids for a user given their assigned role ids:
 * grants of the roles + all ancestor roles, expanded down the permission tree.
 */
export async function getEffectivePermissionIds(roleIds) {
  const roleIdsInTree = await getRoleAncestors(roleIds);
  if (roleIdsInTree.length === 0) return new Set();

  const safeList = roleIdsInTree.join(',');
  const grants = await execute(
    `SELECT DISTINCT rp.PermissionId
     FROM attendance.RolePermissions rp
     WHERE rp.RoleId IN (${safeList})`
  );

  const permissions = await getAllPermissions();
  return expandWithDescendants(grants.map(g => g.PermissionId), permissions);
}

/** Check whether a user (by role ids) effectively has a permission by name. */
export async function userHasPermission(roleIds, permissionName) {
  const effective = await getEffectivePermissionIds(roleIds);
  if (effective.size === 0) return false;
  const permissions = await getAllPermissions();
  return permissions.some(p => effective.has(Number(p.Id)) && p.Name === permissionName);
}

/**
 * Resolve the numeric id of a permission by its exact Name, or null when the
 * catalogue row does not exist (e.g. migrations not applied yet). Keeps route
 * code free of raw SQL against attendance.Permissions.
 */
export async function findPermissionIdByName(name) {
  const rows = await getAllPermissions();
  const hit = rows.find(p => p.Name === name);
  return hit ? Number(hit.Id) : null;
}

/** Group flat rows (Id/ParentId) into a nested tree with `children` arrays. */
export function rowsToTree(rows) {
  const byId = new Map();
  rows.forEach(r => byId.set(Number(r.Id), { ...r, children: [] }));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.ParentId != null ? byId.get(Number(node.ParentId)) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Normalize a permission selection coming from the (tree-based) UI:
 * keep only the minimal set of nodes — drop any node whose ancestor in the
 * permission tree is also selected (the ancestor already implies it).
 */
export function minimizeSelection(selectedIds, permissions) {
  const byId = new Map(permissions.map(p => [Number(p.Id), p]));
  const selected = new Set([...selectedIds].map(Number));
  const minimal = [];
  for (const id of selected) {
    let anc = byId.get(id)?.ParentId;
    let coveredByAncestor = false;
    while (anc != null) {
      if (selected.has(Number(anc))) { coveredByAncestor = true; break; }
      anc = byId.get(Number(anc))?.ParentId;
    }
    if (!coveredByAncestor) minimal.push(id);
  }
  return minimal;
}
