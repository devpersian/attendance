/**
 * TrustOne (تراست وان) driver — TSG-250 / TSG-550 / TSG-750 fingerprint and
 * FE-500 / FE-500Lite / FE-500S face terminals, sold in Iran by spersia.com.
 *
 * These terminals speak a compact ASCII line protocol over TCP (default port
 * 8601). After connecting the host sends:
 *     LOGIN <device-id> <password>
 * and then requests logs with:
 *     GETLOG <device-id>
 * The device answers with one attendance record per line:
 *     USERID,<YYYY-MM-DD>,<HH:MM:SS>,<IN|OUT>,...
 * Firmware variants differ in separator (comma or pipe) and date order, so
 * parsing is intentionally lenient (same approach as the generic TCP driver).
 *
 * config keys: { deviceId (terminal id, default 1), password }
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';

const DATE_RE = /^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$|^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || /^(OK|ERR|LOGIN|GETLOG)/i.test(trimmed)) return null;
  const tokens = trimmed.split(/[|,;\t]+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 3) return null;

  let dateTok = null;
  const timeIdx = new Set();
  tokens.forEach((t, i) => {
    if (!dateTok && DATE_RE.test(t)) { dateTok = t; return; }
    if (TIME_RE.test(t)) timeIdx.add(i);
  });
  const dateIdx = dateTok ? tokens.indexOf(dateTok) : -1;
  // employee id = first token that is neither the date nor a time-like token
  // (HHMMSS-style ids would otherwise be mistaken for the user number)
  const userId = tokens.find((t, i) => i !== dateIdx && !timeIdx.has(i) && /^[\w-]{1,16}$/.test(t));
  if (!userId || timeIdx.size === 0) return null;
  const timeTok = tokens[[...timeIdx][0]];

  let y, mo, day;
  const dm = DATE_RE.exec(dateTok || '');
  if (dm) {
    if (dm[1]) { [y, mo, day] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]; }
    else { [day, mo, y] = [Number(dm[4]), Number(dm[5]), Number(dm[6])]; }
  } else {
    const now = new Date(); y = now.getFullYear(); mo = now.getMonth() + 1; day = now.getDate();
  }
  const tm = TIME_RE.exec(timeTok);
  const ts = new Date(y, mo - 1, day, Number(tm[1]), Number(tm[2]), tm[3] ? Number(tm[3]) : 0);
  if (Number.isNaN(ts.getTime())) return null;

  const eventType = /\bOUT\b/i.test(trimmed) ? 'checkout' : 'checkin';
  return normalizeRecord({ userId, timestamp: ts, eventType, verificationMethod: 'trustone', raw: trimmed });
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 8601;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    const id = String(config.deviceId ?? '1');
    const pwd = String(config.password ?? '0');
    sock.write(`LOGIN ${id} ${pwd}\r\n`);
    await readSocket(sock, { idleMs: 1200 });          // consume login ack
    sock.write(`GETLOG ${id}\r\n`);
    const body = await readSocket(sock, { idleMs: 4000 });
    return body.toString('latin1').split(/[\r\n]+/).map(parseLine).filter(Boolean);
  } finally {
    sock.destroy();
  }
}

export default { name: 'trustone', fetchAttendance };
