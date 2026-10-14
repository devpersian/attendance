/**
 * Virdi (Virdicore) driver — UNX-200/UNX-300 series and AC-7000 family.
 *
 * Two integration paths are supported:
 *  1. Preferred: the "HTTP Push" webhook — devices/VirdiCore configured with
 *     an IP-server URL POST attendance JSON to /api/devices/webhook.
 *  2. Pull (this driver): the documented VirdiCore TCP command protocol,
 *     used by the AccessManager/VirdiCore server to talk to terminals on
 *     port 7777. Commands are ASCII lines terminated with CRLF:
 *       LOGIN <id> <password>        -> OK ...
 *       GETLOG <serial|0>            -> one record per line, e.g.:
 *            1001|20261007|083015|IN          (EmpID | YYYYMMDD | HHMMSS | direction)
 *     Firmware variants differ slightly in field layout, so parsing is
 *     lenient: a line becomes a record when it contains an employee id plus
 *     a date and/or time token (date/time tokens are never taken as the id).
 *
 * config keys: { username (terminal id, default 1), password, serialStart }
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';

const DATE_RE = /^(20\d{2})[-/.]?(\d{2})[-/.]?(\d{2})$/;
const TIME_RE = /^(\d{1,2})[:.]?(\d{2})[:.]?(\d{2})?$/;

function buildCommands(config) {
  const id = String(config.username ?? '1');
  const pwd = String(config.password ?? '0');
  return [
    `LOGIN ${id} ${pwd}`,
    `GETLOG ${config.serialStart ?? 0}`,
  ];
}

/** Lenient parse of one text line into a record (or null). */
export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(';')) return null;
  // ignore command echoes / status frames
  if (/^(OK|ERR|END|BYE|LOGIN|GETLOG)/i.test(trimmed)) return null;
  const tokens = trimmed.split(/[|,;\t]+|\s+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 2) return null;

  let dateTok = null;
  const timeTokIdx = new Set();
  tokens.forEach((t, i) => {
    if (!dateTok && DATE_RE.test(t)) { dateTok = t; return; }
    if (TIME_RE.test(t)) timeTokIdx.add(i);
  });
  const timeTok = timeTokIdx.size ? tokens[[...timeTokIdx][0]] : null;
  // employee id = first token that is neither the date nor a time-like token
  const userId = tokens.find((t, i) => i !== tokens.indexOf(dateTok) && !timeTokIdx.has(i) && /^[\w-]{1,16}$/.test(t));
  if (!userId || (!dateTok && !timeTok)) return null;

  const d = dateTok ? DATE_RE.exec(dateTok) : null;
  const now = new Date();
  const y = d ? Number(d[1]) : now.getFullYear();
  const mo = d ? Number(d[2]) - 1 : now.getMonth();
  const day = d ? Number(d[3]) : now.getDate();
  const tm = timeTok ? TIME_RE.exec(timeTok) : null;
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  const ss = tm && tm[3] ? Number(tm[3]) : 0;
  const ts = new Date(y, mo, day, hh, mm, ss);
  if (Number.isNaN(ts.getTime())) return null;

  const eventType = /\bOUT\b|خروج/i.test(trimmed) ? 'checkout' : 'checkin';
  return normalizeRecord({ userId, timestamp: ts, eventType, verificationMethod: 'virdi', raw: trimmed });
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 7777;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    for (const cmd of buildCommands(config)) sock.write(cmd + '\r\n');
    const body = await readSocket(sock, { idleMs: 4000 });
    const records = body.toString('latin1').split(/[\r\n]+/).map(parseLine).filter(Boolean);
    sock.write('BYE\r\n');
    return records;
  } finally {
    sock.destroy();
  }
}

export default { name: 'virdi', fetchAttendance };
