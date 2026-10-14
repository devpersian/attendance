export interface Employee {
  id: string;
  name: string;
  personnelCode: string;
  department: string;
  position: string;
  avatar?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // Jalali date string YYYY/MM/DD
  clockIn: string | null; // HH:MM
  clockOut: string | null; // HH:MM
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  note?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: 'sick' | 'annual' | 'personal' | 'unpaid';
  status: 'pending' | 'approved' | 'rejected';
  description?: string;
}

export type PageView = 'dashboard' | 'clock' | 'history' | 'employees' | 'reports' | 'leaves' | 'devices' | 'enrollments' | 'admin' | 'company' | 'users' | 'roles' | 'units' | 'shifts' | 'shift-patterns' | 'working-hours' | 'employee-shifts' | 'audit-log' | 'device-monitor';

export interface Device {
  id: string;
  name: string;
  type: 'fingerprint' | 'face' | 'card' | 'mixed';
  model: string;
  /** Catalog model key (server/devices/deviceCatalog.mjs) this device was created from. */
  modelId?: string;
  ipAddress?: string;
  port?: number;
  serialNumber?: string;
  /** Protocol keys — mirrors the CK_Devices_Protocol CHECK constraint in attendance.Devices. */
  protocol?: string;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  location?: string;
  lastSync?: string;
  pollingInterval: number;
  webhookEnabled: boolean;
  webhookURL?: string;
  config?: any;
  /** Soft delete — attendance logs of deleted devices are kept in the DB. */
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface DeviceLog {
  id: string;
  deviceId: string;
  eventType: 'sync' | 'error' | 'connection' | 'disconnection' | 'config_change';
  message?: string;
  data?: any;
  createdAt: string;
}

export interface DeviceAttendanceLog {
  id: string;
  deviceId: string;
  employeeId?: string;
  deviceUserId?: string;
  timestamp: string;
  eventType: 'checkin' | 'checkout';
  verificationMethod?: string;
  rawData?: any;
  processed: boolean;
  processedAt?: string;
  attendanceRecordId?: string;
}
