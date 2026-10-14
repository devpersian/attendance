/**
 * Generic user enrollment API.
 *
 * Enroll fingerprint / face / iris / palm-vein / card / password credentials
 * from the browser (or import them), keep a canonical device-independent copy,
 * and transfer them between any devices controlled by this project.
 *
 * Routes (mounted at /api/enrollments):
 *   GET    /meta                       types, finger slots, transfer adapters
 *   GET    /templates                  ?employeeId=&type=  list templates (+ per-device sync state)
 *   POST   /templates                  create/replace one template (base64 capture)
 *   DELETE /templates/:id              remove a template (and queue device-side removal)
 *   POST   /templates/:id/transfer     push one template to selected devices (dryRun supported)
 *   POST   /transfer                   bulk push: { employeeId?|templateIds[], deviceIds[], dryRun? }
 *   POST   /pull                       pull existing templates off a device into the store
 *   GET    /jobs                       recent enrollment jobs (?limit=)
 *   GET    /jobs/:id                   job + its steps (UI polls this while running)
 */
import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import { Logger } from '../services/logger.mjs';
import { parseConfig } from '../devices/base.mjs';
import {
  TEMPLATE_TYPES, FINGER_SLOTS, SLOT_LABELS_FA,
  buildCanonical, rawTemplateBytes, templateHash,
  listAdapters, adapterForProtocol, transferTemplateToDevice,
  deviceTemplateCapabilities, deviceSupportsTemplateType,
} from '../devices/enrollmentTransfers.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = express.Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

const MAX_TEMPLATE_BYTES = 512 * 1024; // 512 KB per credential — generous for biometric templates

/**
 * Where a capture came from. Stored in the canonical envelope so operators can
 * always tell browser imports apart from local-hardware (enrollment-bridge)
 * captures and device pulls. Kept as NVARCHAR(20) for compatibility with the
 * existing column semantics ('browser' | 'device-pull' | 'import' | ...).
 */
const CAPTURE_SOURCES = ['browser', 'local-sdk', 'local-card', 'device-pull', 'import'];

function normSource(value) {
  const s = String(value || 'browser').toLowerCase();
  return CAPTURE_SOURCES.includes(s) ? s : 'browser';
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function badRequest(res, message) { return res.status(400).json({ error: message }); }

async function getEmployeeOr404(employeeId) {
  const rows = await execute('SELECT Id, Name, PersonnelCode FROM attendance.Employees WHERE Id = @employeeId', { employeeId });
  return rows[0] || null;
}

async function getDeviceRow(deviceId) {
  const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @deviceId AND isDeleted = 0', { deviceId });
  return rows[0] || null;
}

/** base64 -> Buffer, validating size. Returns { buf } or { error }. */
function decodeTemplateBase64(b64) {
  if (!b64) return { buf: null };
  const cleaned = String(b64).replace(/^data:[^;]+;base64,/, '');
  let buf;
  try {
    buf = Buffer.from(cleaned, 'base64');
  } catch {
    return { error: 'Template data is not valid base64' };
  }
  if (buf.length === 0) return { error: 'Template data decoded to zero bytes' };
  if (buf.length > MAX_TEMPLATE_BYTES) return { error: `Template too large (${buf.length} bytes, max ${MAX_TEMPLATE_BYTES})` };
  return { buf };
}

const normalizeRow = (r) => ({
  id: r.Id,
  employeeId: r.EmployeeId,
  employeeName: r.EmployeeName ?? null,
  personnelCode: r.PersonnelCode ?? null,
  templateType: r.TemplateType,
  slot: r.Slot,
  value: r.Value,
  algorithm: r.Algorithm,
  quality: r.Quality,
  sourceDeviceId: r.SourceDeviceId,
  status: r.Status,
  createdAt: r.CreatedAt,
  updatedAt: r.UpdatedAt,
  size: r.DataLength ?? 0,
  hash: r.TemplateHashOut ?? null,
});

// ---------------------------------------------------------------------------
// GET /meta — capability discovery for the UI
// ---------------------------------------------------------------------------
router.get('/meta', async (req, res) => {
  try {
    const devices = await execute(`SELECT Id, Name, Protocol, ModelId, Type, Status FROM attendance.Devices WHERE isDeleted = 0 ORDER BY Name`);
    res.json({
      templateTypes: TEMPLATE_TYPES,
      fingerSlots: FINGER_SLOTS.map((s) => ({ id: s, labelFa: SLOT_LABELS_FA[s] || s })),
      adapters: listAdapters(),
      devices: devices.map((d) => ({
        id: d.Id, name: d.Name, protocol: d.Protocol, modelId: d.ModelId, type: d.Type, status: d.Status,
        adapter: adapterForProtocol(d.Protocol)?.protocol ?? null,
        capabilities: deviceTemplateCapabilities({ protocol: d.Protocol, modelId: d.ModelId }),
      })),
    });
  } catch (error) {
    console.error('enrollment meta error:', error);
    res.status(500).json({ error: 'Failed to load enrollment metadata' });
  }
});

// ---------------------------------------------------------------------------
// GET /devices?type=fingerprint — devices that can enroll/store the given
// credential kind. Used by the "ثبت شناسایی" page so an operator picks the
// enrollment terminal first and only sees compatible capture options.
// ---------------------------------------------------------------------------
router.get('/devices', async (req, res) => {
  try {
    const templateType = String(req.query.type || '').trim() || null;
    if (templateType && !TEMPLATE_TYPES.includes(templateType)) {
      return res.status(400).json({ error: `type must be one of: ${TEMPLATE_TYPES.join(', ')}` });
    }
    const devices = await execute(`SELECT Id, Name, Protocol, ModelId, Type, Status FROM attendance.Devices WHERE isDeleted = 0 ORDER BY Name`);
    const all = devices.map((d) => ({
      id: d.Id, name: d.Name, protocol: d.Protocol, modelId: d.ModelId, type: d.Type, status: d.Status,
      adapter: adapterForProtocol(d.Protocol)?.protocol ?? null,
      capabilities: deviceTemplateCapabilities({ protocol: d.Protocol, modelId: d.ModelId }),
    }));
    const compatible = templateType
      ? all.filter((d) => deviceSupportsTemplateType(d, templateType))
      : all;
    res.json(compatible);
  } catch (error) {
    console.error('enrollment devices list error:', error);
    res.status(500).json({ error: 'Failed to load enrollment-capable devices' });
  }
});

// ---------------------------------------------------------------------------
// GET /templates — list canonical templates with per-device sync matrix
// ---------------------------------------------------------------------------
router.get('/templates', async (req, res) => {
  try {
    const { employeeId, type } = req.query;
    let sqlText = `
      SELECT t.*, e.Name AS EmployeeName, e.PersonnelCode,
             DATALENGTH(t.TemplateData) AS DataLength,
             HASHBYTES('SHA2_256', ISNULL(t.CanonicalData, CAST(t.TemplateData AS VARBINARY(MAX)))) AS TemplateHashOut
      FROM attendance.EnrollmentTemplates t
      JOIN attendance.Employees e ON e.Id = t.EmployeeId`;
    const params = {};
    const where = [];
    if (employeeId) { where.push('t.EmployeeId = @employeeId'); params.employeeId = employeeId; }
    if (type) { where.push('t.TemplateType = @type'); params.type = type; }
    if (where.length) sqlText += ' WHERE ' + where.join(' AND ');
    sqlText += ' ORDER BY e.Name, t.TemplateType, t.Slot';

    const templates = await execute(sqlText, params);

    // device sync state for these templates
    const syncRows = await execute(`
      SELECT de.TemplateId, de.DeviceId, d.Name AS DeviceName, de.SyncStatus, de.SyncMessage, de.SyncedAt
      FROM attendance.DeviceEnrollments de
      JOIN attendance.Devices d ON d.Id = de.DeviceId
      WHERE d.isDeleted = 0`);

    const byTemplate = new Map();
    for (const s of syncRows) {
      if (!byTemplate.has(s.TemplateId)) byTemplate.set(s.TemplateId, []);
      byTemplate.get(s.TemplateId).push({ deviceId: s.DeviceId, deviceName: s.DeviceName, syncStatus: s.SyncStatus, syncMessage: s.SyncMessage, syncedAt: s.SyncedAt });
    }

    res.json(templates.map((t) => ({ ...normalizeRow(t), devices: byTemplate.get(t.Id) || [] })));
  } catch (error) {
    console.error('enrollment list error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment templates' });
  }
});

// ---------------------------------------------------------------------------
// POST /templates — capture/create/replace one credential
// body: { employeeId, templateType, slot?, value?, algorithm?, quality?,
//         templateBase64?, imageBase64?, sourceDeviceId?, status?, replace? }
// ---------------------------------------------------------------------------
router.post('/templates', async (req, res) => {
  try {
    const { employeeId, templateType, slot, value, algorithm, quality, templateBase64, sourceDeviceId, status, replace } = req.body;
    // captureSource: 'browser' (default) | 'local-sdk' | 'local-card' — set by the
    // enrollment-bridge when a native reader/SDK on the operator PC produced the data.
    const captureSource = normSource(req.body.captureSource);

    if (!employeeId) return badRequest(res, 'employeeId is required');
    if (!TEMPLATE_TYPES.includes(templateType)) return badRequest(res, `templateType must be one of: ${TEMPLATE_TYPES.join(', ')}`);
    if ((templateType === 'card' || templateType === 'password') && !value) {
      return badRequest(res, 'card/password credentials require a "value" (card number or PIN)');
    }
    if (['fingerprint', 'face', 'irisscan', 'palmvein'].includes(templateType) && !templateBase64) {
      return badRequest(res, `biometric credential "${templateType}" requires template data (templateBase64)`);
    }

    const employee = await getEmployeeOr404(employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // when the operator picked an enrollment device, verify that hardware can
    // actually hold this credential kind (catalog capabilities + adapter map)
    if (sourceDeviceId) {
      const srcDevice = await getDeviceRow(sourceDeviceId);
      if (!srcDevice) return badRequest(res, 'دستگاه مبدأ یافت نشد یا حذف شده است');
      if (!deviceSupportsTemplateType({ protocol: srcDevice.Protocol, modelId: srcDevice.ModelId }, templateType)) {
        return badRequest(res, `دستگاه «${srcDevice.Name}» (${srcDevice.Protocol}) از نوع شناسایی «${templateType}» پشتیبانی نمی‌کند`);
      }
    }

    const normSlot = ['fingerprint', 'irisscan', 'palmvein'].includes(templateType) ? (slot || null) : null;
    const { buf, error: decodeError } = decodeTemplateBase64(templateBase64);
    if (decodeError) return badRequest(res, decodeError);

    const qualityScore = Number.isFinite(+quality) ? Math.max(0, Math.min(100, +quality)) : null;
    const canonical = buildCanonical({
      templateType, slot: normSlot, value: value ? String(value) : null,
      algorithm: algorithm || `generic-${templateType}`,
      quality: qualityScore,
      rawBytes: buf, source: sourceDeviceId ? 'device-pull' : 'browser',
      meta: { capturedVia: 'web-ui', fileName: req.body.fileName || null },
    });

    // uniqueness pre-check (SQL Server unique constraint treats NULL slot loosely)
    const existing = await execute(
      `SELECT Id FROM attendance.EnrollmentTemplates WHERE EmployeeId = @employeeId AND TemplateType = @templateType AND ISNULL(Slot,'') = ISNULL(@slot,'')`,
      { employeeId, templateType, slot: normSlot });

    let templateId;
    if (existing.length > 0) {
      if (!replace) return badRequest(res, 'A template already exists for this employee/type/slot (pass replace=true to overwrite)');
      templateId = existing[0].Id;
      await execute(
        `UPDATE attendance.EnrollmentTemplates
         SET Value = @value, Algorithm = @algorithm, Quality = @quality,
             TemplateData = @templateData, CanonicalData = @canonicalData,
             SourceDeviceId = @sourceDeviceId, Status = @status, UpdatedAt = GETDATE()
         WHERE Id = @id`,
        { id: templateId, value: value || null, algorithm: algorithm || null, quality: qualityScore, templateData: buf, canonicalData: canonical, sourceDeviceId: sourceDeviceId || null, status: status || 'active' });
      // previous copies on devices are now stale
      await execute(`UPDATE attendance.DeviceEnrollments SET SyncStatus = 'pending', UpdatedAt = GETDATE() WHERE TemplateId = @id`, { id: templateId });
    } else {
      templateId = await executeInsert(
        `INSERT INTO attendance.EnrollmentTemplates
           (EmployeeId, TemplateType, Slot, Value, Algorithm, Quality, TemplateData, CanonicalData, SourceDeviceId, Status)
         VALUES (@employeeId, @templateType, @slot, @value, @algorithm, @quality, @templateData, @canonicalData, @sourceDeviceId, @status)`,
        { employeeId, templateType, slot: normSlot, value: value || null, algorithm: algorithm || null, quality: qualityScore, templateData: buf, canonicalData: canonical, sourceDeviceId: sourceDeviceId || null, status: status || 'active' });
    }

    await Logger.success('CREATE', 'enrollment', templateId, `Enrollment saved for ${employee.Name} (${templateType}${normSlot ? ':' + normSlot : ''})`);
    res.status(201).json({ message: 'Enrollment saved', id: templateId });
  } catch (error) {
    console.error('enrollment create error:', error);
    res.status(500).json({ error: 'Failed to save enrollment', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /templates/:id — drop template + mark device copies removed
// ---------------------------------------------------------------------------
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await execute('SELECT Id FROM attendance.EnrollmentTemplates WHERE Id = @id', { id });
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });

    await execute('DELETE FROM attendance.DeviceEnrollments WHERE TemplateId = @id', { id });
    await execute('DELETE FROM attendance.EnrollmentTemplates WHERE Id = @id', { id });
    await Logger.info('DELETE', 'enrollment', id, 'Enrollment template deleted');
    res.json({ message: 'Enrollment deleted' });
  } catch (error) {
    console.error('enrollment delete error:', error);
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ---------------------------------------------------------------------------
// Transfer engine (shared by /templates/:id/transfer and /transfer)
// ---------------------------------------------------------------------------
async function runTransfer({ templateIds, deviceIds, dryRun }) {
  const placeholders = templateIds.map((_, i) => `@t${i}`).join(',');
  const tParams = Object.fromEntries(templateIds.map((id, i) => [`t${i}`, id]));
  const tplRows = await execute(`SELECT * FROM attendance.EnrollmentTemplates WHERE Id IN (${placeholders})`, tParams);

  const results = [];
  const jobPayload = { templateIds, deviceIds, dryRun: !!dryRun };
  const jobId = await executeInsert(
    `INSERT INTO attendance.EnrollmentJobs (JobType, Payload, Status, TotalSteps)
     VALUES (@jobType, @payload, @status, @totalSteps)`,
    { jobType: dryRun ? 'transfer' : 'push', payload: JSON.stringify(jobPayload), status: 'running', totalSteps: tplRows.length * deviceIds.length });
  await execute('UPDATE attendance.EnrollmentJobs SET StartedAt = GETDATE() WHERE Id = @id', { id: jobId });

  let done = 0, errors = 0;
  for (const template of tplRows) {
    const devices = [];
    for (const deviceId of deviceIds) {
      const device = await getDeviceRow(deviceId);
      if (!device) {
        results.push({ templateId: template.Id, deviceId, status: 'failed', message: 'Device not found or deleted' });
        errors++;
        continue;
      }
      const cfg = parseConfig(device.Config);
      const step = await transferTemplateToDevice(device, cfg, template, { dryRun });
      results.push(step);
      done++;

      if (!dryRun) {
        // upsert per-device sync state
        const hash = templateHash(template);
        const existing = await execute('SELECT Id FROM attendance.DeviceEnrollments WHERE DeviceId = @deviceId AND TemplateId = @templateId', { deviceId, templateId: template.Id });
        const syncStatus = step.status === 'success' ? 'synced' : step.status === 'failed' ? 'failed' : 'pending';
        if (existing.length) {
          await execute(`UPDATE attendance.DeviceEnrollments SET SyncStatus = @syncStatus, SyncMessage = @msg, TemplateHash = @hash, SyncedAt = CASE WHEN @syncStatus = 'synced' THEN GETDATE() ELSE SyncedAt END, UpdatedAt = GETDATE() WHERE Id = @id`,
            { id: existing[0].Id, syncStatus, msg: step.message?.slice(0, 500) || null, hash });
        } else {
          await executeInsert(`INSERT INTO attendance.DeviceEnrollments (DeviceId, TemplateId, TemplateHash, SyncStatus, SyncMessage) VALUES (@deviceId, @templateId, @hash, @syncStatus, @msg)`,
            { deviceId, templateId: template.Id, hash, syncStatus, msg: step.message?.slice(0, 500) || null });
        }
      }

      await executeInsert(`INSERT INTO attendance.EnrollmentJobSteps (JobId, DeviceId, TemplateId, Action, Status, Message)
         VALUES (@jobId, @deviceId, @templateId, @action, @status, @message)`,
        { jobId, deviceId, templateId: template.Id, action: 'push', status: step.status === 'skipped' ? 'skipped' : step.status, message: (step.message || '').slice(0, 500) });

      devices.push({ deviceId, status: step.status, adapter: step.adapter || null, message: step.message });
    }
    results.filter((r) => r.templateId === template.Id).forEach((r) => { r.templateType = template.TemplateType; });
  }

  const status = errors === 0 ? (dryRun ? 'completed' : 'completed') : (errors === done ? 'failed' : 'partial');
  await execute(`UPDATE attendance.EnrollmentJobs SET Status = @status, DoneSteps = @done, ErrorCount = @errors, FinishedAt = GETDATE(), UpdatedAt = GETDATE() WHERE Id = @id`,
    { id: jobId, status, done, errors });

  return { jobId, status, totalSteps: done, errorCount: errors, results };
}

// POST /templates/:id/transfer — { deviceIds: [], dryRun?: bool }
router.post('/templates/:id/transfer', async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceIds, dryRun } = req.body;
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return badRequest(res, 'deviceIds[] is required');
    const exists = await execute('SELECT Id FROM attendance.EnrollmentTemplates WHERE Id = @id', { id });
    if (exists.length === 0) return res.status(404).json({ error: 'Template not found' });

    const out = await runTransfer({ templateIds: [Number(id)], deviceIds: deviceIds.map(Number), dryRun });
    res.json(out);
  } catch (error) {
    console.error('single transfer error:', error);
    res.status(500).json({ error: 'Transfer failed', details: error.message });
  }
});

// POST /transfer — bulk: { employeeId? , templateIds? , deviceIds: [], dryRun? }
router.post('/transfer', async (req, res) => {
  try {
    const { employeeId, templateIds, deviceIds, dryRun } = req.body;
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return badRequest(res, 'deviceIds[] is required');

    let ids = Array.isArray(templateIds) ? templateIds.map(Number) : null;
    if (!ids && employeeId) {
      const rows = await execute('SELECT Id FROM attendance.EnrollmentTemplates WHERE EmployeeId = @employeeId AND Status = @status', { employeeId, status: 'active' });
      ids = rows.map((r) => r.Id);
    }
    if (!ids || ids.length === 0) return badRequest(res, 'No templates selected (provide templateIds[] or employeeId with enrolled templates)');

    const out = await runTransfer({ templateIds: ids, deviceIds: deviceIds.map(Number), dryRun });
    res.json(out);
  } catch (error) {
    console.error('bulk transfer error:', error);
    res.status(500).json({ error: 'Transfer failed', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /pull — import templates that already exist on a device
// body: { deviceId, userId? }
// ---------------------------------------------------------------------------
router.post('/pull', async (req, res) => {
  try {
    const { deviceId, userId } = req.body;
    if (!deviceId) return badRequest(res, 'deviceId is required');
    const device = await getDeviceRow(deviceId);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const cfg = parseConfig(device.Config);
    const adapter = adapterForProtocol(cfg.protocol || device.Protocol, null);
    if (!adapter || typeof adapter.pull !== 'function') {
      return res.status(200).json({ ok: false, error: `Pulling templates is not supported yet for protocol "${device.Protocol}"` });
    }

    let items;
    try {
      items = await adapter.pull(device, cfg, userId || null);
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }

    let imported = 0, skipped = 0;
    for (const it of items) {
      // map device user id -> employee via PersonnelCode
      const emp = await execute('SELECT Id FROM attendance.Employees WHERE PersonnelCode = @code', { code: String(it.userId ?? userId ?? '') });
      if (emp.length === 0) { skipped++; continue; }
      const canonical = buildCanonical({ templateType: it.templateType, slot: it.slot || null, algorithm: it.algorithm, rawBytes: it.rawBytes, source: 'device-pull', meta: { deviceId, pulledBy: 'web-ui' } });
      const existing = await execute(`SELECT Id FROM attendance.EnrollmentTemplates WHERE EmployeeId = @employeeId AND TemplateType = @templateType AND ISNULL(Slot,'') = ISNULL(@slot,'')`,
        { employeeId: emp[0].Id, templateType: it.templateType, slot: it.slot || null });
      if (existing.length) {
        await execute(`UPDATE attendance.EnrollmentTemplates SET TemplateData = @data, CanonicalData = @canonical, SourceDeviceId = @deviceId, Algorithm = @algorithm, UpdatedAt = GETDATE() WHERE Id = @id`,
          { id: existing[0].Id, data: it.rawBytes, canonical, deviceId, algorithm: it.algorithm || null });
      } else {
        await executeInsert(`INSERT INTO attendance.EnrollmentTemplates (EmployeeId, TemplateType, Slot, Algorithm, TemplateData, CanonicalData, SourceDeviceId, Status)
           VALUES (@employeeId, @templateType, @slot, @algorithm, @data, @canonical, @deviceId, 'active')`,
          { employeeId: emp[0].Id, templateType: it.templateType, slot: it.slot || null, algorithm: it.algorithm || null, data: it.rawBytes, canonical, deviceId });
      }
      imported++;
    }

    await Logger.info('CREATE', 'enrollment', deviceId, `Pulled ${imported} templates from device ${device.Name}`);
    res.json({ ok: true, pulled: items.length, imported, skippedUnknownUser: skipped });
  } catch (error) {
    console.error('enrollment pull error:', error);
    res.status(500).json({ error: 'Pull failed', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
router.get('/jobs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const jobs = await execute(`SELECT TOP (@limit) * FROM attendance.EnrollmentJobs ORDER BY Id DESC`, { limit });
    res.json(jobs.map((j) => ({ id: j.Id, jobType: j.JobType, status: j.Status, totalSteps: j.TotalSteps, doneSteps: j.DoneSteps, errorCount: j.ErrorCount, message: j.Message, startedAt: j.StartedAt, finishedAt: j.FinishedAt, createdAt: j.CreatedAt })));
  } catch (error) {
    console.error('jobs list error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const jobs = await execute('SELECT * FROM attendance.EnrollmentJobs WHERE Id = @id', { id });
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });
    const steps = await execute(`
      SELECT s.*, d.Name AS DeviceName FROM attendance.EnrollmentJobSteps s
      LEFT JOIN attendance.Devices d ON d.Id = s.DeviceId
      WHERE s.JobId = @jobId ORDER BY s.Id`, { jobId: id });
    res.json({
      ...jobs[0],
      steps: steps.map((s) => ({ id: s.Id, deviceId: s.DeviceId, deviceName: s.DeviceName, templateId: s.TemplateId, action: s.Action, status: s.Status, message: s.Message })),
    });
  } catch (error) {
    console.error('job detail error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

export default router;
