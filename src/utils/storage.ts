/**
 * Data-access layer for employees, attendance records, leaves, devices, users
 * and company info. All reads/writes go through the REST API — there is no
 * localStorage persistence (removed in v11; the offline dual-write layer was
 * the source of stale clock-out bugs and oversized bundle chunks).
 */

import { Employee, AttendanceRecord, LeaveRequest } from '../types';
import {
  employeesAPI,
  recordsAPI,
  leavesAPI,
  devicesAPI,
  companyAPI,
  usersAPI,
  EntityId,
} from './api';

// ---------------------------------------------------------------------------
// Normalizers (SQL Server PascalCase → camelCase)
// ---------------------------------------------------------------------------

function pick(value: any, fallback: any): any {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function normalizeEmployee(emp: any): Employee {
  return {
    id: emp.Id ?? emp.id,
    name: pick(emp.Name, emp.name ?? ''),
    personnelCode: pick(emp.PersonnelCode, emp.personnelCode ?? ''),
    department: pick(emp.Department, emp.department ?? ''),
    position: pick(emp.Position, emp.position ?? ''),
    avatar: emp.Avatar ?? emp.avatar,
  };
}

function normalizeRecord(record: any): AttendanceRecord {
  return {
    id: pick(record.Id, record.id ?? ''),
    employeeId: pick(record.EmployeeId, record.employeeId ?? ''),
    date: pick(record.Date, record.date ?? ''),
    clockIn: record.ClockIn ?? record.clockIn ?? null,
    clockOut: record.ClockOut ?? record.clockOut ?? null,
    status: pick(record.Status, record.status ?? 'absent'),
    note: record.Note ?? record.note,
  };
}

function normalizeLeave(leave: any): LeaveRequest {
  return {
    id: leave.Id ?? leave.id,
    employeeId: leave.EmployeeId ?? leave.employeeId,
    startDate: leave.StartDate ?? leave.startDate,
    endDate: leave.EndDate ?? leave.endDate,
    type: leave.Type ?? leave.type,
    status: leave.Status ?? leave.status,
    description: leave.Description ?? leave.description,
  };
}

function normalizeUser(user: any): any {
  return {
    id: user.Id ?? user.id,
    username: pick(user.Username, user.username ?? ''),
    email: pick(user.Email, user.email ?? ''),
    role: pick(user.Role, user.role ?? 'employee'),
    employeeId: user.EmployeeId ?? user.employeeId,
    employeeName: user.EmployeeName ?? user.employeeName,
    isActive: user.IsActive ?? user.isActive ?? true,
  };
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function getEmployees(): Promise<Employee[]> {
  const raw = await employeesAPI.getAll();
  return raw.map(normalizeEmployee);
}

export async function createEmployee(employee: Employee): Promise<void> {
  await employeesAPI.create(employee);
}

export async function updateEmployee(id: string, employee: Partial<Employee>): Promise<void> {
  await employeesAPI.update(id, employee);
}

export async function deleteEmployee(id: string): Promise<void> {
  await employeesAPI.delete(id);
}

// ---------------------------------------------------------------------------
// Attendance records
// ---------------------------------------------------------------------------

interface RecordFilters {
  date?: string;
  employeeId?: string;
  month?: string;
  status?: string;
}

export async function getRecords(filters?: RecordFilters): Promise<AttendanceRecord[]> {
  const records = await recordsAPI.getAll(filters);
  return records.map(normalizeRecord);
}

export async function addRecord(record: AttendanceRecord): Promise<void> {
  await recordsAPI.create(record);
}

export async function updateRecord(id: string, updates: Partial<AttendanceRecord>): Promise<void> {
  await recordsAPI.update(id, updates);
}

export async function getRecordByDateAndEmployee(
  date: string,
  employeeId: string,
): Promise<AttendanceRecord | undefined> {
  const record = await recordsAPI.getByDateAndEmployee(date, employeeId);
  return record ? normalizeRecord(record) : undefined;
}

/** Get ALL records for a date/employee (supports multiple in/out punches per day). */
export async function getRecordsByDateAndEmployee(
  date: string,
  employeeId: string,
): Promise<AttendanceRecord[]> {
  const records = await recordsAPI.getAll({ date, employeeId });
  return (records ?? []).map(normalizeRecord);
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

interface LeaveFilters {
  employeeId?: string;
  status?: string;
}

export async function getLeaves(filters?: LeaveFilters): Promise<LeaveRequest[]> {
  const leaves = await leavesAPI.getAll(filters);
  return leaves.map(normalizeLeave);
}

export async function addLeave(leave: LeaveRequest): Promise<void> {
  await leavesAPI.create(leave);
}

export async function updateLeave(id: string, updates: Partial<LeaveRequest>): Promise<void> {
  await leavesAPI.update(id, updates);
}

// ---------------------------------------------------------------------------
// Devices (pass-through, errors surface as empty results)
// ---------------------------------------------------------------------------

async function safeFetch<T>(fetcher: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fetcher();
  } catch (error) {
    console.error(`Error fetching ${label}:`, error);
    return fallback;
  }
}

export const getDevices = (includeDeleted?: boolean) =>
  safeFetch(() => devicesAPI.getAll(includeDeleted ? { includeDeleted: '1' } : undefined), [], 'devices');
/** Protocol keys accepted by attendance.Devices (server registry mirrors the DB CHECK constraint). */
export const getDeviceProtocols = () =>
  safeFetch(
    async () => {
      const res = await devicesAPI.getProtocols();
      return Array.isArray(res) ? res : res?.protocols ?? [];
    },
    ['tcp', 'http', 'zk'],
    'device protocols'
  );
/** Full protocol registry from server: { protocols, implemented, drivers } — used to flag protocols without a driver. */
export const getDeviceProtocolRegistry = () =>
  safeFetch(
    () => devicesAPI.getProtocols(),
    null as unknown as { protocols: string[]; implemented: string[]; drivers: Record<string, boolean> },
    'device protocol registry'
  );
/** Known device models catalog (brands/protocols/defaults) for the "add device" model picker. */
export const getDeviceCatalog = (filters?: { brand?: string; category?: string; protocol?: string }) =>
  safeFetch(() => devicesAPI.getCatalog(filters), [], 'device catalog');
export const getDeviceLogs = (id: string, limit?: number) =>
  safeFetch(() => devicesAPI.getLogs(id, limit), [], `device ${id} logs`);
export const getDeviceAttendance = (id: string, limit?: number, processed?: boolean) =>
  safeFetch(() => devicesAPI.getAttendance(id, limit, processed), [], `device ${id} attendance`);

export const createDevice = (device: any) => devicesAPI.create(device);
export const updateDevice = (id: string, device: any) => devicesAPI.update(id, device);
export const deleteDevice = (id: string) => devicesAPI.delete(id);
export const syncDevice = (id: string) => devicesAPI.sync(id);
export const restoreDevice = (id: EntityId) => devicesAPI.restore(id);

// ---------------------------------------------------------------------------
// Company info
// ---------------------------------------------------------------------------

export const getCompanyInfo = () => safeFetch(() => companyAPI.get(), null, 'company info');

export async function updateCompanyInfo(data: any): Promise<void> {
  try {
    await companyAPI.update(data);
  } catch (error) {
    console.error('Error updating company info:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export const getUsers = () =>
  safeFetch(async () => (await usersAPI.getAll()).map(normalizeUser), [], 'users');

export const createUser = (data: any) => usersAPI.register(data);
export const updateUser = (id: EntityId, data: any) => usersAPI.update(id, data);
export const deleteUser = (id: EntityId) => usersAPI.delete(id);
