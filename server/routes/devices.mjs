import crypto from 'crypto';
import express from 'express';
import { execute, executeInsert } from '../db.mjs';
import * as jalaali from 'jalaali-js';
import { isNonWorkingDay } from '../services/holidays.mjs';
import { Logger } from '../services/logger.mjs';
import { authenticateToken, requirePermission } from '../services/auth.mjs';
import { writeAudit } from '../services/auditLog.mjs';
import { getEffectivePermissionIds, findPermissionIdByName } from '../services/permissionTree.mjs';
import { publish, subscribe } from '../services/realtimeBus.mjs';
import { DEVICE_CATALOG, findDeviceModel } from '../devices/deviceCatalog.mjs';
import { getDriver, supportedProtocols } from '../devices/driverRegistry.mjs';
import { getDeviceService } from '../services/deviceService.mjs';
import { queueCommand, getQueueDepth, takePendingForDelivery, markAcked, formatForWebhook, COMMAND_TYPES } from '../services/deviceCommands.mjs';
import { sendSms } from '../services/notifications.mjs';

const router = express.Router();

// Device management is a privileged area: every endpoint below requires a
// session token EXCEPT the machine-to-machine webhook, which is registered
// first and authenticates with a per-device shared secret instead.
router.post('/webhook', webhookRateGuard, deviceWebhookHandler);
router.use(authenticateToken);

// Simple in-memory throttle for webhook abuse (per IP).
const webhookHits = new Map();
function webhookRateGuard(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const win = 60_000;
  let h = webhookHits.get(ip);
  if (!h || h.resetAt <= now) { h = { count: 0, resetAt: now + win }; webhookHits.set(ip, h); }
  h.count += 1;
  if (h.count > 300) return res.status(429).json({ error: 'Too many webhook events, slow down.' });
  next();
}

function safeCompare(a = '', b = '') {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function deviceWebhookHandler(req, res) {
  try {
    const { deviceId, userId, timestamp, eventType, verificationMethod, rawData, ackedCommandId, commandFailed } = req.body || {};

    // ── Input validation: reject malformed pushes before touching the DB ──
    const idNum = Number(deviceId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'deviceId must be a positive number' });
    }

    // Validate device exists (never include soft-deleted devices)
    const device = await execute('SELECT * FROM attendance.Devices WHERE Id = @deviceId AND isDeleted = 0', { deviceId: idNum });
    if (device.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Device authentication: the device must present its own secret. We accept
    // it via header `x-device-token` or body `token`, compared against the
    // WebhookURL query param `token=` configured for the device (so each device
    // carries a distinct secret), or the server-wide WEBHOOK_SHARED_SECRET env.
    const presented = req.headers['x-device-token'] || req.body.token || '';
    const configuredSecret = (() => {
      try {
        if (!device[0].WebhookEnabled) return null;
        const u = new URL(device[0].WebhookURL);
        return u.searchParams.get('token');
      } catch { return null; }
    })();
    const envSecret = process.env.WEBHOOK_SHARED_SECRET || '';
    const expected = configuredSecret || envSecret;

    if (!expected) {
      // Refuse unauthenticated webhooks outright unless an operator explicitly
      // opts in (legacy deployments that predate this check).
      if (process.env.WEBHOOK_ALLOW_INSECURE !== '1') {
        return res.status(503).json({ error: 'Webhook authentication is not configured for this device. Set WEBHOOK_SHARED_SECRET or configure a device WebhookURL containing ?token=...' });
      }
    } else if (!safeCompare(presented, expected)) {
      await Logger.log('warning', 'WEBHOOK_AUTH_FAILED', 'devices', deviceId, `Rejected webhook with bad/missing token from ${req.ip}`, { deviceId });
      return res.status(401).json({ error: 'Invalid device token' });
    }

    // Command acknowledgement report from the gateway client (Phase 2 / P2.3):
    // { deviceId, token, ackedCommandId, commandFailed? } — no punch payload.
    if (ackedCommandId != null) {
      await markAcked(ackedCommandId, commandFailed !== true && commandFailed !== 'true');
      return res.json({ message: 'Command ack recorded' });
    }

    const punchTypes = new Set(['checkin', 'checkout', 'attendance', 'access']);
    if (eventType != null && !punchTypes.has(String(eventType))) {
      return res.status(400).json({ error: `eventType must be one of: ${[...punchTypes].join(', ')}` });
    }
    const tsRaw = timestamp ?? new Date().toISOString();
    const ts = new Date(tsRaw);
    if (Number.isNaN(ts.getTime())) {
      return res.status(400).json({ error: 'timestamp is not a valid date' });
    }
    const uid = String(userId ?? '').trim();
    if (!uid || uid.length > 50 || !/^[\w-]+$/.test(uid)) {
      return res.status(400).json({ error: 'userId must be a short alphanumeric device user id' });
    }

    // Any authenticated ping refreshes liveness (offline sweeper baseline)
    // and flips an offline device back to active (P2.6 recovery transition).
    await execute(`UPDATE attendance.Devices
                   SET LastSeen = GETDATE(),
                       Status = CASE WHEN Status = 'offline' THEN 'active' ELSE Status END,
                       OfflineAlerted = CASE WHEN Status = 'offline' OR OfflineAlerted = 1 THEN 0 ELSE OfflineAlerted END
                   WHERE Id = @id`, { id: idNum });

    // Create attendance log and process it using the DB-generated Id
    const normalizedEventType = String(eventType || 'attendance');
    const logId = await executeInsert(`INSERT INTO attendance.DeviceAttendanceLogs (DeviceId, DeviceUserId, Timestamp, EventType, VerificationMethod, RawData, Source)
       VALUES (@deviceId, @deviceUserId, @timestamp, @eventType, @verificationMethod, @rawData, 'webhook')`, { deviceId: idNum, deviceUserId: uid, timestamp: ts, eventType: normalizedEventType, verificationMethod: verificationMethod || null, rawData: rawData ? JSON.stringify(rawData) : null });

    // Process the attendance log
    await processDeviceAttendanceLog(logId);

    // Live stream subscribers see punches the moment they arrive.
    publish('punch', { deviceId: idNum, userId: uid, timestamp: ts.toISOString(), eventType: normalizedEventType, logId });

    // Phase 2 / P2.3: ride queued control commands back in the ACK body
    // (ZK/ADMS pull-from-response pattern). Content type follows the device's
    // Accept header — stock firmware sends text/xml, our bridge accepts JSON.
    const pendingCommands = await takePendingForDelivery(idNum);
    if (pendingCommands.length > 0) {
      await Logger.info('DEVICE_COMMANDS_DELIVERED', 'devices', idNum, `Delivered ${pendingCommands.length} queued command(s) via webhook ACK`, { ids: pendingCommands.map((c) => c.id) });
    }
    const wantsXml = String(req.headers.accept || '').includes('xml');
    if (wantsXml) {
      res.type('application/xml').send(formatForWebhook(pendingCommands, true));
    } else {
      res.json({ message: 'Attendance log received and processed', commands: pendingCommands });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

// ── Webhook secret masking (Phase 0 / P0.5 + Phase 2) ──────────────────────
// The `token=` query param in a device's WebhookURL IS the device's shared
// secret — anyone who can list devices could forge punches with it. GET
// responses therefore show only the last 4 chars; the full URL is revealed
// once, at creation/rotation time, and via ?reveal=1 for holders of
// devices.manage.
const WEBHOOK_BASE = () => process.env.PUBLIC_API_BASE_URL || 'http://localhost:3001';

function maskDevice(d) {
  if (!d || !d.WebhookURL) return d;
  let masked = d.WebhookURL;
  try {
    const u = new URL(d.WebhookURL);
    const tok = u.searchParams.get('token');
    if (tok) u.searchParams.set('token', `${'•'.repeat(8)}${tok.slice(-4)}`);
    masked = u.toString();
  } catch { /* non-URL value stored — leave as-is */ }
  return { ...d, WebhookURL: masked };
}

function generateWebhookUrl() {
  const token = crypto.randomBytes(24).toString('hex');
  return `${WEBHOOK_BASE()}/api/devices/webhook?token=${token}`;
}

/** Reveal the real WebhookURL to an authorized manager (audited). */
async function revealWebhookUrl(req, res, deviceId) {
  const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id: deviceId });
  if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
  await writeAudit({ actorUserId: req.user?.id ?? null, action: 'DEVICE_WEBHOOK_REVEALED', entity: 'device', entityId: Number(deviceId), detail: null, req });
  res.json(rows[0]);
}

// GET /api/devices - Get all devices
router.get('/', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const devices = await execute(
      includeDeleted
        ? 'SELECT * FROM attendance.Devices ORDER BY Name'
        : 'SELECT * FROM attendance.Devices WHERE isDeleted = 0 ORDER BY Name'
    );
    await Logger.info('READ', 'devices', null, `Fetched ${devices.length} devices`);
    res.json(devices.map(maskDevice));
  } catch (error) {
    await Logger.error('READ', 'devices', null, 'Failed to fetch devices', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/devices/catalog - List all known device models (for the "add device" picker)
router.get('/catalog', async (req, res) => {
  try {
    const { brand, category, protocol } = req.query;
    let items = DEVICE_CATALOG.map((d) => ({
      id: d.id, brand: d.brand, model: d.model, category: d.category,
      protocols: d.protocols, biometrics: d.biometrics,
      defaults: d.defaults, fields: d.fields, notes: d.notes,
    }));
    if (brand) items = items.filter((d) => d.brand.toLowerCase() === String(brand).toLowerCase());
    if (category) items = items.filter((d) => d.category === category);
    if (protocol) items = items.filter((d) => d.protocols.includes(protocol));
    res.json(items);
  } catch (error) {
    console.error('Error fetching device catalog:', error);
    res.status(500).json({ error: 'Failed to fetch device catalog' });
  }
});

// POST /api/devices/test-connection - Probe a (possibly unsaved) device config
router.post('/test-connection', async (req, res) => {
  try {
    const { ipAddress, port, modelId, protocol, config } = req.body;
    const model = findDeviceModel(modelId);
    const proto = protocol || (model ? model.protocols[0] : 'tcp');
    const driver = getDriver(proto);
    if (!driver) return res.status(400).json({ ok: false, error: `No driver implemented for protocol "${proto}"` });

    const fakeDevice = { Id: 0, IPAddress: ipAddress, Port: port || (model ? model.defaults.port : undefined), ModelId: modelId, SerialNumber: req.body.serialNumber };
    const records = await driver.fetchAttendance(fakeDevice, config || {});
    res.json({ ok: true, protocol: proto, fetched: records.length, sample: records.slice(0, 3).map((r) => ({ userId: r.userId, timestamp: r.timestamp, eventType: r.eventType })) });
  } catch (error) {
    res.status(200).json({ ok: false, error: error.message, code: error.code || null });
  }
});

// Protocol keys allowed by the DB CHECK constraint CK_Devices_Protocol on attendance.Devices.
// Keep in sync with database/schema.sql — INSERTs with any other value are rejected by SQL Server.
const DB_ALLOWED_PROTOCOLS = [
  'http', 'http-push', 'tcp', 'mqtt', 'zk', 'isapi', 'dws', 'fpvtech',
  'controlianz', 'suprema', 'biostar2', 'sdk600', 'wiegand-gateway',
  'realtime', 'smartplus', 'apex', 'crosschex', 'essl-pull', 'pullsdk',
  'telnet', 'websockets', 'custom',
  'virdi', 'trustone', 'tosan', 'cmitech',
];

// GET /api/devices/meta/protocols - Protocol keys selectable in the UI.
// Returns every key accepted by the DB CHECK constraint; those without a server
// driver yet are still listed so devices can be registered (push/gateway types).
router.get('/meta/protocols', async (req, res) => {
  const implemented = new Set(supportedProtocols());
  res.json({
    protocols: DB_ALLOWED_PROTOCOLS,
    implemented: [...implemented],
    drivers: Object.fromEntries(DB_ALLOWED_PROTOCOLS.map((p) => [p, implemented.has(p)])),
  });
});

// GET /api/devices/meta/catalog-stats - Catalog coverage summary (brand/protocol counts)
router.get('/meta/catalog-stats', async (req, res) => {
  const brands = {};
  const protocols = {};
  const categories = {};
  for (const d of DEVICE_CATALOG) {
    brands[d.brand] = (brands[d.brand] || 0) + 1;
    categories[d.category] = (categories[d.category] || 0) + 1;
    for (const p of d.protocols) protocols[p] = (protocols[p] || 0) + 1;
  }
  res.json({ totalModels: DEVICE_CATALOG.length, brands, protocols, categories });
});

// GET /api/devices/monitor - Health/reachability snapshot of every device
router.get('/monitor', async (req, res) => {
  try {
    const devices = await execute(`
      SELECT d.Id, d.Name, d.Type, d.Model, d.ModelId, d.IPAddress, d.Port, d.Protocol,
             d.Status, d.Location, d.LastSync, d.LastSeen, d.LastError, d.LastErrorCode,
             d.ConsecutiveFailures, d.TotalRecordsReceived, d.PollingInterval,
             (SELECT COUNT(*) FROM attendance.DeviceAttendanceLogs l WHERE l.DeviceId = d.Id) AS TotalLogs,
             (SELECT COUNT(*) FROM attendance.DeviceAttendanceLogs l WHERE l.DeviceId = d.Id AND l.Processed = 0) AS UnprocessedLogs,
             (SELECT MAX(l.Timestamp) FROM attendance.DeviceAttendanceLogs l WHERE l.DeviceId = d.Id) AS LastRecordAt,
             (SELECT TOP 1 lg.Message FROM attendance.DeviceLogs lg WHERE lg.DeviceId = d.Id ORDER BY lg.CreatedAt DESC) AS LastEventMessage,
             (SELECT TOP 1 lg.CreatedAt FROM attendance.DeviceLogs lg WHERE lg.DeviceId = d.Id ORDER BY lg.CreatedAt DESC) AS LastEventAt
      FROM attendance.Devices d
      WHERE d.isDeleted = 0
      ORDER BY d.Name`);

    // Live reachability probe (TCP connect to IP:Port) with short timeout.
    const PROBE_TIMEOUT_MS = 3000;
    const net = await import('net');
    const probed = await Promise.all(devices.map(async (d) => {
      let reachable = null;
      let latencyMs = null;
      if (d.IPAddress && d.Port) {
        const start = Date.now();
        reachable = await new Promise((resolve) => {
          const sock = new net.default.Socket();
          let settled = false;
          const done = (v) => { if (!settled) { settled = true; sock.destroy(); resolve(v); } };
          sock.setTimeout(PROBE_TIMEOUT_MS);
          sock.once('connect', () => done(true));
          sock.once('timeout', () => done(false));
          sock.once('error', () => done(false));
          sock.connect(d.Port, d.IPAddress);
        });
        if (reachable) latencyMs = Date.now() - start;
      }
      return { ...d, reachable, latencyMs };
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        total: probed.length,
        online: probed.filter((d) => d.reachable === true).length,
        unreachable: probed.filter((d) => d.reachable === false).length,
        pushOnly: probed.filter((d) => d.reachable === null).length,
        inError: probed.filter((d) => d.Status === 'error' || d.ConsecutiveFailures > 0).length,
      },
      devices: probed,
    });
  } catch (error) {
    console.error('Error building device monitor snapshot:', error);
    res.status(500).json({ error: 'Failed to build device monitor snapshot' });
  }
});

// POST /api/devices/:id/check - Immediate connectivity check for one device
router.post('/:id/check', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id', { id });
    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    const device = rows[0];

    const service = await getDeviceService();
    const result = await service.checkDevice(device);
    res.json(result);
  } catch (error) {
    console.error('Error checking device:', error);
    res.status(200).json({ ok: false, error: error.message, code: error.code || null });
  }
});

// GET /api/devices/:id - Get device by ID (webhook secret masked unless ?reveal=1)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (req.query.reveal === '1') {
      return revealWebhookUrl(req, res, id);
    }
    const devices = await execute('SELECT * FROM attendance.Devices WHERE Id = @id', { id });
    if (devices.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(maskDevice(devices[0]));
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// POST /api/devices/:id/rotate-secret - new webhook token (Phase 0 / P0.5)
router.post('/:id/rotate-secret', requirePermission('devices'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await execute('SELECT Id, WebhookURL FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id });
    if (existing.length === 0) return res.status(404).json({ error: 'Device not found' });

    const fresh = generateWebhookUrl();
    await execute('UPDATE attendance.Devices SET WebhookURL = @url, WebhookEnabled = 1, UpdatedAt = GETDATE() WHERE Id = @id', { id, url: fresh });
    await writeAudit({ actorUserId: req.user?.id ?? null, action: 'DEVICE_SECRET_ROTATED', entity: 'device', entityId: Number(id), detail: null, req });
    // Full URL returned exactly once — the operator must reconfigure the device now.
    res.json({ message: 'رمز وب‌هوک جدید ساخته شد؛ آن را روی دستگاه تنظیم کنید', webhookURL: fresh });
  } catch (error) {
    console.error('Error rotating device secret:', error);
    res.status(500).json({ error: 'Failed to rotate device secret' });
  }
});

// POST /api/devices - Create new device
router.post('/', async (req, res) => {
  try {
    const { name, type, model, modelId, ipAddress, port, serialNumber, protocol, status, location, pollingInterval, webhookEnabled, webhookURL, config } = req.body;

    // When a catalog model is picked, its supported protocols/defaults win over the client payload.
    const catModel = findDeviceModel(modelId);
    const finalProtocol = protocol || (catModel ? catModel.protocols[0] : undefined);

    // Phase 2 / P2.1 auto-provisioning: the server mints the per-device webhook
    // secret itself — operators never hand-type (or reuse) tokens again. The
    // full URL is returned exactly once in this response.
    const provisioned = webhookURL || generateWebhookUrl();
    const finalWebhookEnabled = webhookURL ? (webhookEnabled || false) : true;

    const newId = await executeInsert(`INSERT INTO attendance.Devices (Name, Type, Model, ModelId, IPAddress, Port, SerialNumber, Protocol, Status, Location, PollingInterval, WebhookEnabled, WebhookURL, Config)
       VALUES (@name, @type, @model, @modelId, @ipAddress, @port, @serialNumber, @protocol, @status, @location, @pollingInterval, @webhookEnabled, @webhookURL, @config)`, { name, type: type || (catModel ? catModel.category : 'fingerprint'), model: model || (catModel ? `${catModel.brand} ${catModel.model}` : null), modelId: modelId || null, ipAddress: ipAddress || null, port: port || (catModel ? catModel.defaults.port : null), serialNumber: serialNumber || null, protocol: finalProtocol, status: status || 'inactive', location: location || null, pollingInterval: pollingInterval || 60, webhookEnabled: finalWebhookEnabled, webhookURL: provisioned, config: config ? JSON.stringify(config) : null });

    await writeAudit({ actorUserId: req.user?.id ?? null, action: 'DEVICE_CREATED', entity: 'device', entityId: Number(newId), detail: { name, serialNumber }, req });
    res.status(201).json({ message: 'Device created successfully', id: newId, webhookURL: provisioned });
  } catch (error) {
    console.error('Error creating device:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// PUT /api/devices/:id - Update device
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, model, modelId, ipAddress, port, serialNumber, protocol, status, location, pollingInterval, webhookEnabled, webhookURL, config } = req.body;

    const catModel = findDeviceModel(modelId);
    const finalProtocol = protocol || (catModel ? catModel.protocols[0] : undefined);

    // Preserve the provisioned secret: the UI only ever shows a masked URL, so
    // an empty/unchanged/masked submission must not wipe the real token.
    let finalWebhookURL = webhookURL || null;
    if (!finalWebhookURL || finalWebhookURL.includes('•')) {
      const cur = await execute('SELECT WebhookURL FROM attendance.Devices WHERE Id = @id', { id });
      finalWebhookURL = cur[0]?.WebhookURL ?? null;
    }

    await execute(
      `UPDATE attendance.Devices
       SET Name = @name, Type = @type, Model = @model, ModelId = @modelId, IPAddress = @ipAddress, Port = @port,
           SerialNumber = @serialNumber, Protocol = @protocol, Status = @status, Location = @location,
           PollingInterval = @pollingInterval, WebhookEnabled = @webhookEnabled, WebhookURL = @webhookURL,
           Config = @config, UpdatedAt = GETDATE()
       WHERE Id = @id`,
      {
        id,
        name,
        type,
        model: model || (catModel ? `${catModel.brand} ${catModel.model}` : null),
        modelId: modelId || null,
        ipAddress: ipAddress || null,
        port: port || (catModel ? catModel.defaults.port : null),
        serialNumber: serialNumber || null,
        protocol: finalProtocol,
        status,
        location: location || null,
        pollingInterval,
        webhookEnabled,
        webhookURL: finalWebhookURL,
        config: config ? JSON.stringify(config) : null
      }
    );
    
    res.json({ message: 'Device updated successfully' });
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// POST /api/devices/:id/restore - Undo a soft delete (attendance logs were never removed)
router.post('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await execute('SELECT Id, isDeleted FROM attendance.Devices WHERE Id = @id', { id });
    if (existing.length === 0) return res.status(404).json({ error: 'Device not found' });
    if (!existing[0].isDeleted) return res.status(400).json({ error: 'Device is not deleted' });

    await execute('UPDATE attendance.Devices SET isDeleted = 0, DeletedAt = NULL, UpdatedAt = GETDATE() WHERE Id = @id', { id });
    res.json({ message: 'Device restored successfully' });
  } catch (error) {
    console.error('Error restoring device:', error);
    res.status(500).json({ error: 'Failed to restore device' });
  }
});

// DELETE /api/devices/:id - Soft-delete a device.
// Attendance logs and device event logs are NEVER deleted physically — they are
// kept for history/audits. The device row is marked isDeleted = 1 and disappears
// from all lists; it can be restored later via POST /api/devices/:id/restore.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await execute('SELECT Id, isDeleted FROM attendance.Devices WHERE Id = @id', { id });
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (existing[0].isDeleted) {
      return res.status(400).json({ error: 'Device is already deleted' });
    }

    await execute(
      `UPDATE attendance.Devices
       SET isDeleted = 1, DeletedAt = GETDATE(), Status = 'inactive', UpdatedAt = GETDATE()
       WHERE Id = @id`,
      { id }
    );
    // Stop any running poller for this device so it is no longer polled/synced.
    try {
      const service = await getDeviceService();
      await service.stopDevicePolling(Number(id));
    } catch { /* polling stop is best-effort */ }

    res.json({ message: 'Device deleted successfully', softDelete: true });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device', details: error.message });
  }
});

// POST /api/devices/:id/sync - Trigger manual sync
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const device = await execute('SELECT * FROM attendance.Devices WHERE Id = @id', { id });
    
    if (device.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Update last sync time
    await execute('UPDATE attendance.Devices SET LastSync = GETDATE() WHERE Id = @id', { id });
    
    // Log the sync event (Id is INT IDENTITY — generated by the database)
    await executeInsert(`INSERT INTO attendance.DeviceLogs (DeviceId, EventType, Message)
       VALUES (@deviceId, @eventType, @message)`, { deviceId: id, eventType: 'sync', message: 'Manual sync triggered' });
    
    res.json({ message: 'Sync initiated successfully' });
  } catch (error) {
    console.error('Error syncing device:', error);
    res.status(500).json({ error: 'Failed to sync device' });
  }
});

// GET /api/devices/:id/logs - Get device logs
// ── Device control commands (Phase 2 / P2.4) ───────────────────────────────
// Every command is queued in attendance.DeviceCommands and rides back inside
// the device's next webhook ACK (see deviceWebhookHandler). Pull-mode devices
// get immediate driver-level execution where available.

async function loadLiveDevice(id) {
  const rows = await execute('SELECT * FROM attendance.Devices WHERE Id = @id AND isDeleted = 0', { id });
  return rows[0] || null;
}

async function enqueueAndRespond(req, res, { deviceId, type, payload }) {
  const cmdId = await queueCommand({ deviceId, type, payload });
  await writeAudit({ actorUserId: req.user?.id ?? null, action: `DEVICE_CMD_${type.toUpperCase()}`, entity: 'device', entityId: Number(deviceId), detail: payload, req });
  publish('device-command', { deviceId: Number(deviceId), commandId: cmdId, type });
  res.status(202).json({ message: 'فرمان در صف قرار گرفت و در اولین تماس دستگاه ارسال می‌شود', commandId: cmdId });
}

router.post('/:id/unlock', requirePermission('devices.control'), async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    await enqueueAndRespond(req, res, { deviceId: device.Id, type: 'unlock' });
  } catch (error) {
    console.error('Error queueing unlock:', error);
    res.status(500).json({ error: 'Failed to queue unlock command' });
  }
});

router.post('/:id/sync-time', requirePermission('devices.control'), async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    await enqueueAndRespond(req, res, { deviceId: device.Id, type: 'sync_time' });
  } catch (error) {
    console.error('Error queueing sync-time:', error);
    res.status(500).json({ error: 'Failed to queue sync-time command' });
  }
});

// Resolve an employee's device-side user id (PersonnelCode is the mapping used
// by the punch processor — see processDeviceAttendanceLog).
async function devicePinForEmployee(employeeId) {
  const emp = await execute('SELECT PersonnelCode FROM attendance.Employees WHERE Id = @id', { id: employeeId });
  if (emp.length === 0) return null;
  return String(emp[0].PersonnelCode ?? '').trim() || null;
}

router.post('/:id/push-user/:employeeId', requirePermission('devices.control'), async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const pin = await devicePinForEmployee(req.params.employeeId);
    if (!pin) return res.status(400).json({ error: 'کارمند یافت نشد یا کد پرسنلی ندارد' });
    await enqueueAndRespond(req, res, { deviceId: device.Id, type: 'push_user', payload: { pin, employeeId: Number(req.params.employeeId) } });
  } catch (error) {
    console.error('Error queueing push-user:', error);
    res.status(500).json({ error: 'Failed to queue push-user command' });
  }
});

router.post('/:id/delete-user/:employeeId', requirePermission('devices.control'), async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const pin = await devicePinForEmployee(req.params.employeeId);
    if (!pin) return res.status(400).json({ error: 'کارمند یافت نشد یا کد پرسنلی ندارد' });
    await enqueueAndRespond(req, res, { deviceId: device.Id, type: 'delete_user', payload: { pin, employeeId: Number(req.params.employeeId) } });
  } catch (error) {
    console.error('Error queueing delete-user:', error);
    res.status(500).json({ error: 'Failed to queue delete-user command' });
  }
});

router.post('/:id/refresh-data', requirePermission('devices.control'), async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    // Pull-mode devices with a driver: fetch immediately instead of queueing.
    const service = await getDeviceService();
    const protocol = service.effectiveProtocol(device);
    const driver = getDriver(protocol);
    if (driver) {
      const ingested = await service.pollDevice(device);
      return res.json({ message: 'داده فوراً از دستگاه گرفته شد', pulled: ingested });
    }
    await enqueueAndRespond(req, res, { deviceId: device.Id, type: 'refresh_data' });
  } catch (error) {
    console.error('Error refreshing device data:', error);
    res.status(500).json({ error: 'Failed to refresh device data' });
  }
});

// GET /api/devices/:id/status - queue depth + liveness for monitor cards
router.get('/:id/status', async (req, res) => {
  try {
    const device = await loadLiveDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const queue = await getQueueDepth(device.Id);
    res.json({
      id: device.Id,
      name: device.Name,
      status: device.Status,
      lastSeen: device.LastSeen,
      lastSync: device.LastSync,
      lastPulledAt: device.LastPulledAt ?? null,
      pollingInterval: device.PollingInterval,
      queue,
    });
  } catch (error) {
    console.error('Error fetching device status:', error);
    res.status(500).json({ error: 'Failed to fetch device status' });
  }
});

// GET /api/devices/:id/commands - recent command history for this device
router.get('/:id/commands', async (req, res) => {
  try {
    const rows = await execute(
      `SELECT TOP 50 Id, Type, Payload, Status, CreatedAt, DeliveredAt, AckedAt, Attempts
       FROM attendance.DeviceCommands WHERE DeviceId = @id ORDER BY Id DESC`,
      { id: Number(req.params.id) }
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching device commands:', error);
    res.status(500).json({ error: 'Failed to fetch device commands' });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const logs = await execute(
      `SELECT TOP (@limit) * FROM attendance.DeviceLogs 
       WHERE DeviceId = @deviceId 
       ORDER BY CreatedAt DESC`,
      { deviceId: id, limit: parseInt(limit) }
    );
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching device logs:', error);
    res.status(500).json({ error: 'Failed to fetch device logs' });
  }
});

// GET /api/devices/:id/attendance - Get device attendance logs
router.get('/:id/attendance', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, processed } = req.query;
    
    let query = `SELECT TOP (@limit) * FROM attendance.DeviceAttendanceLogs WHERE DeviceId = @deviceId`;
    const params = { deviceId: id, limit: parseInt(limit) };
    
    if (processed !== undefined) {
      query += ` AND Processed = @processed`;
      params.processed = processed === 'true' ? 1 : 0;
    }
    
    query += ` ORDER BY Timestamp DESC`;
    
    const logs = await execute(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching device attendance logs:', error);
    res.status(500).json({ error: 'Failed to fetch device attendance logs' });
  }
});

// GET /api/devices/stream — Server-Sent Events live feed of device punches.
// Requires a session token; EventSource can't set headers, so the token is
// accepted via ?token= query param as a fallback (see authenticateToken usage).
// Same authorization rule as GET /api/stream: `devices.realtime` permission
// (admins bypass) — see migration 008-realtime-permission.sql.
async function canViewRealtime(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permId = await findPermissionIdByName('devices.realtime');
  if (permId == null) return false; // catalogue row missing -> fail closed
  const roleIds = (user.roleAssignments || []).map(a => a.roleId);
  if (roleIds.length === 0) return false;
  const effective = await getEffectivePermissionIds(roleIds);
  return effective.has(permId);
}

router.get('/stream', async (req, res) => {
  try {
    if (!(await canViewRealtime(req.user))) {
      await Logger.log(
        'warning',
        'REALTIME_STREAM_DENIED',
        'devices',
        null,
        `User ${req.user?.username} attempted to open /api/devices/stream without devices.realtime`,
        { userId: req.user?.id },
        req.user?.id
      );
      return res.status(403).json({ error: 'شما دسترسی به فید زنده تردد دستگاه‌ها را ندارید' });
    }
  } catch (error) {
    await Logger.logError('STREAM', 'authorize', null, 'Realtime permission check failed', error, { userId: req.user?.id });
    return res.status(500).json({ error: 'خطا در بررسی دسترسی فید زنده' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsubscribe = publish ? subscribe((event) => {
    try { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
  }) : null;

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* ignore */ }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    if (unsubscribe) unsubscribe();
  });
});

// Helper function to process device attendance log
async function processDeviceAttendanceLog(logId) {
  try {
    const log = await execute('SELECT * FROM attendance.DeviceAttendanceLogs WHERE Id = @id', { id: logId });
    if (log.length === 0) return;
    
    const attendanceLog = log[0];
    
    // Find employee by device user ID
    const employee = await execute(
      `SELECT TOP 1 * FROM attendance.Employees WHERE PersonnelCode = @deviceUserId`,
      { deviceUserId: attendanceLog.DeviceUserId }
    );
    
    if (employee.length === 0) {
      // Log error
      await executeInsert(`INSERT INTO attendance.DeviceLogs (DeviceId, EventType, Message)
         VALUES (@deviceId, @eventType, @message)`, { deviceId: attendanceLog.DeviceId, eventType: 'error', message: `Unknown device user ID: ${attendanceLog.DeviceUserId}` });
      return;
    }
    
    const employeeId = employee[0].Id;
    const date = new Date(attendanceLog.Timestamp);
    const j = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const dateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    // Check if attendance record exists
    const existingRecord = await execute(
      `SELECT * FROM attendance.AttendanceRecords WHERE Date = @date AND EmployeeId = @employeeId`,
      { date: dateStr, employeeId }
    );
    
    let recordId;
    
    if (existingRecord.length === 0) {
      // Create new record (Id is INT IDENTITY — generated by the database)
      recordId = await executeInsert(`INSERT INTO attendance.AttendanceRecords (EmployeeId, Date, ClockIn, ClockOut, Status)
         VALUES (@employeeId, @date, @clockIn, @clockOut, @status)`, { employeeId, date: dateStr, clockIn: attendanceLog.EventType === 'checkin' ? timeStr : null, clockOut: attendanceLog.EventType === 'checkout' ? timeStr : null, status: 'present' });
    } else {
      // Update existing record
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
    
    // Mark log as processed
    await execute(
      `UPDATE attendance.DeviceAttendanceLogs SET Processed = 1, ProcessedAt = GETDATE(), AttendanceRecordId = @recordId, EmployeeId = @employeeId WHERE Id = @id`,
      { id: logId, recordId, employeeId }
    );
    
  } catch (error) {
    console.error('Error processing attendance log:', error);
  }
}

export default router;
