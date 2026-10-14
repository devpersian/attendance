#!/usr/bin/env node

/**
 * One-off codemod: qualify every table reference in all server .mjs SQL
 * statements with the `attendance` schema.
 *
 * Handles FROM / INTO / UPDATE / JOIN keywords, plus aliased table names
 * inside JOIN ... ON clauses (e.g. "ON up.PermissionId = p.Id").
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Directories/files to scan (code first, then docs).
const targets = [
  path.join(__dirname, '..', 'server'),
  path.join(__dirname, '..', 'scripts'),
];

// Extra files passed on the command line (e.g. markdown docs).
const extraFiles = process.argv.slice(2).filter((f) => fs.existsSync(f));

// Tables that live in the `attendance` schema (see database/schema.sql),
// plus UserPermissions which is referenced by the auth/permissions code.
const tables = [
  'Employees',
  'AttendanceRecords',
  'LeaveRequests',
  'Devices',
  'DeviceLogs',
  'DeviceAttendanceLogs',
  'SystemLogs',
  'CompanyInfo',
  'Users',
  'Roles',
  'Permissions',
  'RolePermissions',
  'UserRoles',
  'UserPermissions',
  'Shifts',
  'ShiftPatterns',
  'ShiftPatternPeriods',
  'WorkingHoursRules',
  'EmployeeShifts',
];

// Longest names first so e.g. DeviceAttendanceLogs is matched before Devices.
tables.sort((a, b) => b.length - a.length);

const TABLE_ALT = tables.join('|');

// 1) keyword-qualified references: FROM|INTO|UPDATE|JOIN <Table>
const kwRe = new RegExp(
  `\\b(FROM|INTO|UPDATE|JOIN)(\\s+)(\\[?)(${TABLE_ALT})(\\]?)(?!\\w)`,
  'gi'
);

// 1b) foreign-key targets: REFERENCES <Table> (same table list, case-insensitive)
const refRe = new RegExp(
  `\\b(REFERENCES)(\\s+)(\\[?)(${TABLE_ALT})(\\]?)(?!\\w)`,
  'gi'
);

// 2) alias-qualified references inside conditions: <alias>.<Table>.<Column>
const aliasRe = new RegExp(
  `\\b([A-Za-z_]\\w*)(\\.)(\\[?)(${TABLE_ALT})(\\]?)(\\.)(?=[A-Za-z_]\\w*\\b)`,
  'g'
);

const EXTS = ['.mjs', '.js', '.sql', '.md'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return EXTS.some((e) => d.name.endsWith(e)) ? [p] : [];
  });
}

// Never rewrite this codemod's own table list / regex source.
const SELF = fileURLToPath(import.meta.url);

let totalChanges = 0;
for (const file of [...targets.flatMap(walk), ...extraFiles].filter((f) => f !== SELF)) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;

  content = content.replace(kwRe, (m, kw, ws, ob, tbl, cb) => {
    // Already schema-qualified? The negative check: preceding text ends with "attendance."
    // Since \b(FROM...) matched the keyword itself, a prior "attendance." can't be part
    // of this match; but "FROM attendance.X" would have keyword followed by attendance —
    // attendance is not in our table list, so it never matches. Safe.
    return `${kw}${ws}${ob}attendance.${tbl}${cb}`;
  });

  content = content.replace(refRe, (m, kw, ws, ob, tbl, cb) => {
    return `${kw}${ws}${ob}attendance.${tbl}${cb}`;
  });

  content = content.replace(aliasRe, (m, alias, dot1, ob, tbl, cb, dot2) => {
    if (alias.toLowerCase() === 'attendance') return m; // already qualified
    return `${alias}.attendance.${tbl}${cb}${dot2}`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content);
    const n = (content.match(/attendance\./g) || []).length -
              (original.match(/attendance\./g) || []).length;
    totalChanges += n;
    console.log(`updated ${path.relative(process.cwd(), file)} (+${n} refs)`);
  }
}
console.log(`done, ${totalChanges} table references qualified`);
