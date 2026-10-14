/**
 * deviceCommands — queued control commands for push-mode devices (Phase 2 / P2.2–P2.4).
 *
 * ZKeco-style devices that talk to us over the HTTP webhook (ADMS pattern) have
 * no inbound control channel: every command must ride back inside the ACK body
 * of the next ping. Admin endpoints enqueue rows in attendance.DeviceCommands;
 * `takePendingForDelivery()` atomically pops them when a webhook arrives and
 * `formatForWebhook()` renders them in the ADMS `<PushStatus>`/`<Command>` XML
 * envelope understood by stock firmware (and mirrored as JSON for our own
 * bridge/gateway clients).
 */
import { execute, executeInsert } from '../db.mjs';

export const COMMAND_TYPES = ['unlock', 'sync_time', 'push_user', 'delete_user', 'get_user', 'refresh_data'];

/** Enqueue a command for a device. Returns the new row id. Throws on bad type. */
export async function queueCommand({ deviceId, type, payload = null }) {
  if (!COMMAND_TYPES.includes(type)) {
    const err = new Error(`Unknown device command type "${type}"`);
    err.code = 'BAD_COMMAND_TYPE';
    throw err;
  }
  return executeInsert(
    `INSERT INTO attendance.DeviceCommands (DeviceId, Type, Payload, Status)
     VALUES (@deviceId, @type, @payload, 'pending')`,
    { deviceId: Number(deviceId), type, payload: payload ? JSON.stringify(payload) : null }
  );
}

/** Queue depth per status for the status endpoint / monitor cards. */
export async function getQueueDepth(deviceId) {
  const rows = await execute(
    `SELECT Status, COUNT(*) AS Cnt FROM attendance.DeviceCommands
     WHERE DeviceId = @deviceId GROUP BY Status`,
    { deviceId: Number(deviceId) }
  );
  const out = { pending: 0, delivered: 0, acked: 0, failed: 0 };
  for (const r of rows) out[r.Status] = Number(r.Cnt);
  return out;
}

/**
 * Pop everything waiting for this device and mark it delivered.
 * Stale 'delivered' rows (device took them but never came back within 10 min)
 * are re-queued so a flaky link doesn't silently drop commands.
 */
export async function takePendingForDelivery(deviceId) {
  const id = Number(deviceId);
  await execute(
    `UPDATE attendance.DeviceCommands SET Status = 'pending'
     WHERE DeviceId = @id AND Status = 'delivered' AND DeliveredAt < DATEADD(minute, -10, GETDATE())`,
    { id }
  );
  const rows = await execute(
    `SELECT Id, Type, Payload FROM attendance.DeviceCommands
     WHERE DeviceId = @id AND Status = 'pending' ORDER BY Id`,
    { id }
  );
  const commands = [];
  for (const r of rows) {
    let payload = null;
    try { payload = r.Payload ? JSON.parse(r.Payload) : null; } catch { /* raw string payload */ }
    commands.push({ id: Number(r.Id), type: r.Type, payload });
  }
  if (commands.length > 0) {
    const ids = commands.map((c) => c.id).join(','); // all validated integers
    await execute(
      `UPDATE attendance.DeviceCommands
       SET Status = 'delivered', DeliveredAt = GETDATE(), Attempts = Attempts + 1
       WHERE Id IN (${ids})`,
      {}
    );
  }
  return commands;
}

/** Mark one command acked (client reports execution) or failed (gave up after 5 tries). */
export async function markAcked(commandId, ok = true) {
  const id = Number(commandId);
  if (!Number.isFinite(id)) return;
  if (ok) {
    await execute(
      `UPDATE attendance.DeviceCommands SET Status = 'acked', AckedAt = GETDATE() WHERE Id = @id AND Status = 'delivered'`,
      { id }
    );
  } else {
    await execute(
      `UPDATE attendance.DeviceCommands
       SET Status = CASE WHEN Attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
           Attempts = Attempts + 1
       WHERE Id = @id`,
      { id }
    );
  }
}

// ADMS command verbs per our internal type (stock ZK firmware vocabulary).
const ADMS_VERB = {
  unlock: 'FREE',
  sync_time: 'CHECK',            // CHECK carries <Time> → device sets its clock
  push_user: 'UPDATEUSER',
  delete_user: 'DELUSER',
  get_user: 'DOWNLOADUSER',
  refresh_data: 'ATTPULL',       // ask device to push pending logs immediately
};

function xmlEscape(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function isoNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Render queued commands for the webhook ACK response.
 * Content-type is chosen by the device's Accept header (ZK devices send
 * `Accept: text/xml`; JSON gateways accept application/json).
 */
export function formatForWebhook(commands, wantsXml = true) {
  if (!commands || commands.length === 0) {
    return wantsXml
      ? '<?xml version="1.0" encoding="utf-8"?>\n<PushResult><ReturnResult>OK</ReturnResult></PushResult>'
      : { ok: true, commands: [] };
  }
  if (!wantsXml) return { ok: true, commands };
  const parts = commands.map((c) => {
    const verb = ADMS_VERB[c.type] || 'CHECK';
    switch (c.type) {
      case 'sync_time':
        return `<Command Value="${verb}" Name="${verb}"><Time>${isoNow()}</Time></Command>`;
      case 'push_user':
      case 'delete_user':
        return `<Command Value="${verb}" Name="${verb}"><PIN>${xmlEscape(c.payload?.pin ?? '')}</PIN></Command>`;
      default:
        return `<Command Value="${verb}" Name="${verb}" />`;
    }
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<PushResult>',
    '<ReturnResult>OK</ReturnResult>',
    ...parts,
    '</PushResult>',
  ].join('\n');
}
