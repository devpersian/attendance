import { execute, executeInsert } from '../db.mjs';
import * as jalaali from 'jalaali-js';
import { findDeviceModel } from '../devices/deviceCatalog.mjs';
import { getDriver } from '../devices/driverRegistry.mjs';
import { parseConfig } from '../devices/base.mjs';
import { publish } from './realtimeBus.mjs';
import { Logger } from './logger.mjs';

// Phase 2 / P2.5-P2.6 tunables (env-overridable).
const OFFLINE_SWEEP_INTERVAL_MS = Number(process.env.DEVICE_OFFLINE_SWEEP_MS || 60_000);
const OFFLINE_FAILURE_THRESHOLD = Number(process.env.DEVICE_OFFLINE_FAILURES || 3);

class DeviceService {
  constructor() {
    this.activePollers = new Map();
    this.connections = new Map();
    this.backfillTimers = new Map(); // deviceId -> timeout handle (P2.5 failure backoff)
    this.start();
  }

  async start() {
    console.log('🔌 Device Service started');
    
    try {
      const devices = await execute('SELECT * FROM attendance.Devices WHERE Status = @status AND isDeleted = 0', { status: 'active' });
      
      for (const device of devices) {
        await this.startDevicePolling(device);
      }
    } catch (error) {
      console.error('Error starting device service:', error);
    }

    // P2.6 offline sweeper: one interval covering every live device, push-mode
    // included (a push device that stops pinging is exactly how it goes away).
    this.sweeperTimer = setInterval(() => {
      this.runOfflineSweeper().catch((e) => console.error('Offline sweeper error:', e));
    }, OFFLINE_SWEEP_INTERVAL_MS);
    if (this.sweeperTimer.unref) this.sweeperTimer.unref();
    setTimeout(() => {
      this.runOfflineSweeper().catch(() => { /* logged by the periodic run */ });
    }, 15_000)?.unref?.();
  }

  async startDevicePolling(device) {
    if (this.activePollers.has(device.Id)) {
      return;
    }

    const protocol = this.effectiveProtocol(device);
    if (protocol === 'http-push' || !device.PollingInterval) {
      await this.logDeviceEvent(device.Id, 'connection', 'Push-mode device — no polling required');
      return;
    }

    console.log(`📡 Starting polling for device: ${device.Name} (${protocol})`);

    const intervalId = setInterval(async () => {
      try {
        await this.pollDevice(device);
      } catch (error) {
        console.error(`Error polling device ${device.Name}:`, error);
        await this.logDeviceEvent(device.Id, 'error', `Polling error: ${error.message}`);
      }
    }, device.PollingInterval * 1000);

    this.activePollers.set(device.Id, intervalId);

    await this.logDeviceEvent(device.Id, 'connection', `Device polling started with interval ${device.PollingInterval}s`);
  }

  async stopDevicePolling(deviceId) {
    const intervalId = this.activePollers.get(deviceId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activePollers.delete(deviceId);
      await this.logDeviceEvent(deviceId, 'disconnection', 'Device polling stopped');
    }
    const bt = this.backfillTimers.get(Number(deviceId));
    if (bt) { clearTimeout(bt); this.backfillTimers.delete(Number(deviceId)); }
  }

  /**
   * P2.5 backfill: re-poll a device after an escalating backoff (up to 3
   * retries) so records buffered on the device after a transient outage are
   * pulled as soon as it becomes reachable again.
   */
  scheduleBackfill(device, attempt = 1) {
    if (attempt > 3) return;
    const id = Number(device.Id);
    if (this.backfillTimers.has(id)) return; // one pending retry per device
    const delayMs = Math.min(30_000 * 2 ** (attempt - 1), 5 * 60_000);
    const timer = setTimeout(async () => {
      this.backfillTimers.delete(id);
      try {
        const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id });
        if (!rows.length) return;
        const ingested = await this.pollDevice(rows[0]);
        await this.logDeviceEvent(id, 'sync', `Backfill pass ${attempt} complete (${ingested} new records)`);
      } catch (error) {
        await this.logDeviceEvent(id, 'error', `Backfill pass ${attempt} failed: ${error.message}`);
        const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id }).catch(() => []);
        if (rows.length) this.scheduleBackfill(rows[0], attempt + 1);
      }
    }, delayMs);
    if (timer.unref) timer.unref();
    this.backfillTimers.set(id, timer);
  }

  effectiveProtocol(device) {
    const model = findDeviceModel(device.ModelId);
    if (model && model.protocols.length) {
      const cfg = parseConfig(device.Config);
      if (cfg.protocol && model.protocols.includes(cfg.protocol)) return cfg.protocol;
      return model.protocols[0];
    }
    return device.Protocol || 'tcp';
  }

  /**
   * Poll a device through its catalog driver and ingest any new records.
   * Returns the number of newly-ingested logs.
   */
  async pollDevice(device) {
    const protocol = this.effectiveProtocol(device);
    const driver = getDriver(protocol);
    if (!driver) {
      console.log(`No driver for protocol: ${protocol}`);
      return 0;
    }

    const config = parseConfig(device.Config);
    let records = [];
    try {
      records = await driver.fetchAttendance(device, config);
    } catch (error) {
      await this.recordFailure(device.Id, error);
      throw error;
    }

    const ingested = await this.processDeviceData(device.Id, records);
    // P2.5 bookkeeping: LastPulledAt marks the completed poll pass. Recovery
    // transition mirrors the webhook path (offline -> active, P2.6).
    await execute(`UPDATE attendance.Devices
                   SET LastSync = GETDATE(), LastSeen = GETDATE(), LastPulledAt = GETDATE(),
                       ConsecutiveFailures = 0, LastError = NULL, LastErrorCode = NULL,
                       OfflineAlerted = CASE WHEN Status = 'offline' THEN 0 ELSE OfflineAlerted END,
                       Status = CASE WHEN Status = 'offline' THEN 'active' ELSE Status END,
                       TotalRecordsReceived = TotalRecordsReceived + @ingested
                   WHERE Id = @id`, { id: device.Id, ingested });
    if (device.Status === 'offline') {
      publish('device-status', { deviceId: Number(device.Id), status: 'online', reason: 'poll-recovered' });
      await Logger.info('DEVICE_ONLINE_RECOVERED', 'devices', device.Id,
        `Device recovered via successful poll`, { protocol });
    }
    await this.logDeviceEvent(device.Id, 'sync', `${protocol} polling successful (${ingested} new of ${records.length} fetched)`);
    return ingested;
  }

  /**
   * One-shot connectivity check used by the monitoring screen and
   * POST /api/devices/:id/check. Updates the health columns on success/failure.
   */
  async checkDevice(device) {
    const protocol = this.effectiveProtocol(device);
    const driver = getDriver(protocol);
    if (!driver) {
      const msg = `No driver implemented for protocol "${protocol}"`;
      await this.recordFailure(device.Id, new Error(msg));
      return { ok: false, protocol, error: msg, code: 'NO_DRIVER' };
    }

    const config = parseConfig(device.Config);
    const start = Date.now();
    try {
      const records = await driver.fetchAttendance(device, config);
      const latencyMs = Date.now() - start;
      await execute(`UPDATE attendance.Devices
                     SET LastSeen = GETDATE(), ConsecutiveFailures = 0,
                         LastError = NULL, LastErrorCode = NULL
                     WHERE Id = @id`, { id: device.Id });
      await this.logDeviceEvent(device.Id, 'connection', `Manual check OK via ${protocol} (${records.length} records readable, ${latencyMs}ms)`);
      return { ok: true, protocol, latencyMs, recordsReadable: records.length };
    } catch (error) {
      await this.recordFailure(device.Id, error);
      return { ok: false, protocol, error: error.message, code: error.code || null, latencyMs: Date.now() - start };
    }
  }

  /** Persist a failed contact: mark device in error state after repeated failures. */
  async recordFailure(deviceId, error) {
    try {
      await execute(`UPDATE attendance.Devices
                     SET ConsecutiveFailures = ConsecutiveFailures + 1,
                         LastError = @msg, LastErrorCode = @code,
                         Status = CASE WHEN ConsecutiveFailures + 1 >= 3 THEN 'error' ELSE Status END
                     WHERE Id = @id`,
        { id: deviceId, msg: String(error.message || error).slice(0, 500), code: String(error.code || '').slice(0, 50) || null });
      await this.logDeviceEvent(deviceId, 'error', error.message || String(error));
      // P2.5: queue a delayed backfill pass for polled (non-push) devices so
      // records left on the device after a transient network blip get pulled.
      const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id: deviceId });
      if (rows.length) {
        const proto = this.effectiveProtocol(rows[0]);
        if (proto !== 'http-push' && rows[0].PollingInterval) this.scheduleBackfill(rows[0]);
      }
    } catch (e) {
      console.error('Error recording device failure:', e);
    }
  }

  async processDeviceData(deviceId, data) {
    let ingested = 0;
    try {
      for (const record of data || []) {
        const timestamp = new Date(record.timestamp || record.Timestamp);
        if (isNaN(timestamp.getTime())) continue;

        // De-duplicate against raw log store
        const dupe = await execute(
          `SELECT TOP 1 Id FROM attendance.DeviceAttendanceLogs
           WHERE DeviceId = @deviceId AND DeviceUserId = @userId AND Timestamp = @ts`,
          { deviceId, userId: String(record.userId ?? record.UserId ?? ''), ts: timestamp }
        );
        if (dupe.length > 0) continue;

        // Insert the log and process it using the DB-generated Id (INT IDENTITY)
        const logId = await executeInsert(`INSERT INTO attendance.DeviceAttendanceLogs (DeviceId, DeviceUserId, Timestamp, EventType, VerificationMethod, RawData, Source)
           VALUES (@deviceId, @deviceUserId, @timestamp, @eventType, @verificationMethod, @rawData, 'device')`, { deviceId, deviceUserId: record.userId || record.UserId, timestamp, eventType: record.type || record.EventType || 'checkin', verificationMethod: record.verificationMethod || record.VerificationMethod || null, rawData: JSON.stringify(record.raw ?? record) });

        publish('punch', {
          logId,
          deviceId: Number(deviceId),
          deviceUserId: String(record.userId ?? record.UserId ?? ''),
          timestamp,
          eventType: record.type || record.EventType || 'checkin',
          verificationMethod: record.verificationMethod || record.VerificationMethod || null,
        });

        await this.processAttendanceLog(logId);
        ingested++;
      }
    } catch (error) {
      console.error('Error processing device ', error);
      throw error;
    }
    return ingested;
  }

  async processAttendanceLog(logId) {
    try {
      const log = await execute('SELECT * FROM attendance.DeviceAttendanceLogs WHERE Id = @id', { id: logId });
      if (log.length === 0) return;

      const attendanceLog = log[0];

      const employee = await execute(
        `SELECT TOP 1 * FROM attendance.Employees WHERE PersonnelCode = @deviceUserId`,
        { deviceUserId: attendanceLog.DeviceUserId }
      );

      if (employee.length === 0) {
        await this.logDeviceEvent(attendanceLog.DeviceId, 'error', `Unknown device user ID: ${attendanceLog.DeviceUserId}`);
        return;
      }

      const employeeId = employee[0].Id;
      const date = new Date(attendanceLog.Timestamp);
      const j = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
      const dateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      const existingRecord = await execute(
        `SELECT * FROM attendance.AttendanceRecords WHERE Date = @date AND EmployeeId = @employeeId`,
        { date: dateStr, employeeId }
      );

      let recordId;

      if (existingRecord.length === 0) {
        // Id is INT IDENTITY — generated by the database
        recordId = await executeInsert(`INSERT INTO attendance.AttendanceRecords (EmployeeId, Date, ClockIn, ClockOut, Status)
           VALUES (@employeeId, @date, @clockIn, @clockOut, @status)`, { employeeId, date: dateStr, clockIn: attendanceLog.EventType === 'checkin' ? timeStr : null, clockOut: attendanceLog.EventType === 'checkout' ? timeStr : null, status: 'present' });
      } else {
        recordId = existingRecord[0].Id;
        const updates = {};

        if (attendanceLog.EventType === 'checkin' && !existingRecord[0].ClockIn) {
          updates.clockIn = timeStr;
        } else if (attendanceLog.EventType === 'checkout' && !existingRecord[0].ClockOut) {
          updates.clockOut = timeStr;
        }

        if (Object.keys(updates).length > 0) {
          const setClause = Object.keys(updates).map(key => `${key.charAt(0).toUpperCase() + key.slice(1)} = @${key}`).join(', ');
          await execute(
            `UPDATE attendance.AttendanceRecords SET ${setClause} WHERE Id = @id`,
            { id: recordId, ...updates }
          );
        }
      }

      await execute(
        `UPDATE attendance.DeviceAttendanceLogs SET Processed = 1, ProcessedAt = GETDATE(), AttendanceRecordId = @recordId, EmployeeId = @employeeId WHERE Id = @id`,
        { id: logId, recordId, employeeId }
      );

    } catch (error) {
      console.error('Error processing attendance log:', error);
    }
  }

  async logDeviceEvent(deviceId, eventType, message, data = null) {
    try {
      await executeInsert(`INSERT INTO attendance.DeviceLogs (DeviceId, EventType, Message, Data)
         VALUES (@deviceId, @eventType, @message, @data)`, { deviceId, eventType, message, data: data ? JSON.stringify(data) : null });
      publish('device-event', { deviceId: Number(deviceId), eventType, message });
    } catch (error) {
      console.error('Error logging device event:', error);
    }
  }

  /**
   * P2.6 offline detection. Every sweep:
   *  - Active devices whose last contact (webhook ping OR poll pull) is older
   *    than max(PollingInterval x OFFLINE_FAILURE_THRESHOLD, 5 min) — or that
   *    accumulated >= threshold consecutive poll failures — flip to 'offline',
   *    emit a realtime 'device-status' event, log a DeviceLog row and write a
   *    security-audit entry. OfflineAlerted guarantees ONE alert per episode.
   *  - Devices already marked offline but seen again (recovery handled in the
   *    poll/webhook paths) have their dedupe flag reset here as a safety net.
   */
  async runOfflineSweeper() {
    const flipped = await execute(`UPDATE attendance.Devices
        SET Status = 'offline', OfflineAlerted = 1, UpdatedAt = GETDATE()
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.LastSeen, INSERTED.LastPulledAt,
              INSERTED.ConsecutiveFailures, INSERTED.PollingInterval
        WHERE isDeleted = 0 AND Status <> 'offline' AND OfflineAlerted = 0
          AND (
                ConsecutiveFailures >= @threshold
             OR (ISNULL(LastSeen, '1900-01-01') < DATEADD(minute, -@minWindow, GETDATE())
                 AND ISNULL(LastPulledAt, '1900-01-01') < DATEADD(minute, -@minWindow, GETDATE()))
          )`,
      { threshold: OFFLINE_FAILURE_THRESHOLD, minWindow: Math.max(OFFLINE_SWEEP_INTERVAL_MS / 1000, 300) });

    for (const d of flipped) {
      const silentForSec = d.LastPulledAt || d.LastSeen
        ? Math.floor((Date.now() - new Date(Math.max(new Date(d.LastSeen || 0), new Date(d.LastPulledAt || 0))).getTime()) / 1000)
        : null;
      publish('device-status', { deviceId: Number(d.Id), status: 'offline', silentForSec });
      await this.logDeviceEvent(d.Id, 'connection',
        `Device marked offline${silentForSec != null ? ` (no contact for ${Math.round(silentForSec / 60)} min)` : ' (no recorded contact)'}`,
        { consecutiveFailures: d.ConsecutiveFailures });
      await Logger.warning('DEVICE_OFFLINE', 'devices', d.Id,
        `Device "${d.Name}" marked offline by sweeper`, { silentForSec });
    }

    // Safety net: an offline device that has since been seen again should be
    // eligible for a fresh alert on its next offline episode.
    await execute(`UPDATE attendance.Devices
        SET OfflineAlerted = 0, Status = 'active'
        WHERE isDeleted = 0 AND Status = 'offline' AND OfflineAlerted = 1
          AND (LastSeen > DATEADD(minute, -@window, GETDATE())
               OR LastPulledAt > DATEADD(minute, -@window, GETDATE()))`,
      { window: Math.max(OFFLINE_SWEEP_INTERVAL_MS / 1000, 300) });

    return flipped.length;
  }

  async restartDevice(deviceId) {
    await this.stopDevicePolling(deviceId);
    const device = await execute('SELECT * FROM attendance.Devices WHERE Id = @id', { id: deviceId });
    if (device.length > 0) {
      await this.startDevicePolling(device[0]);
    }
  }

  stop() {
    console.log('🔌 Device Service stopping');
    if (this.sweeperTimer) clearInterval(this.sweeperTimer);
    for (const timer of this.backfillTimers.values()) clearTimeout(timer);
    this.backfillTimers.clear();
    for (const [deviceId, intervalId] of this.activePollers) {
      clearInterval(intervalId);
    }
    this.activePollers.clear();
  }
}

let deviceServiceInstance = null;

export function getDeviceService() {
  if (!deviceServiceInstance) {
    deviceServiceInstance = new DeviceService();
  }
  return deviceServiceInstance;
}

export { DeviceService };
