/**
 * CMITech (کی‌ام‌آی‌تک — cmi-tech.com, Korea) driver.
 *
 * Covers the CMI Tech product line of iris / face / combined terminals:
 *   EF-70 / EFM-70    long-range (70 cm) iris + face terminal / module
 *   EF-45NC / EFM-45  dual-iris terminal / kiosk module
 *   NovaFace-3 / NovaFace-2N  face recognition terminals
 *   BMT-20 / EMX-30   desktop enrollment & authentication iris units
 *
 * These devices talk over a proprietary LAN protocol (plus vendor SDKs for
 * desktop capture). Exact frames differ per firmware, so this driver is
 * command-configurable like the Tosan / generic-TCP drivers but defaults to
 * the documented CMI request bytes and parses any lenient date/time log line
 * it receives ("PIN,YYYY/MM/DD,HH:MM:SS,IN|OUT,...").
 *
 * config keys: { loginCommand (hex, optional), dataCommand (hex, default
 *              "ef010000"), timezoneOffsetMinutes }
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';

const hexToBuf = (h) => Buffer.from(String(h || '').replace(/[^0-9a-f]/gi, ''), 'hex');

const DATE_RE = /^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Parse one attendance log line: "PIN,YYYY/MM/DD,HH:MM:SS,IN|OUT,..." */
export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/[|,;\t]+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 3) return null;
  let dateTok = null, timeTok = null;
  for (const t of tokens) {
    if (!dateTok && DATE_RE.test(t)) dateTok = t;
    else if (!timeTok && TIME_RE.test(t)) timeTok = t;
  }
  const userId = tokens.find((t) => /^\d{1,8}$/.test(t) && t !== dateTok && t !== timeTok)
    || tokens.find((t) => /^[A-Za-z][\w-]{0,15}$/.test(t));
  if (!userId || !dateTok || !timeTok) return null;
  const dm = DATE_RE.exec(dateTok);
  const tm = TIME_RE.exec(timeTok);
  const ts = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), tm[3] ? Number(tm[3]) : 0);
  if (Number.isNaN(ts.getTime())) return null;
  const eventType = /\bOUT\b|خروج/i.test(trimmed) ? 'checkout' : 'checkin';
  return normalizeRecord({ userId, timestamp: ts, eventType, verificationMethod: 'cmitech', raw: trimmed });
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 8600;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    if (config.loginCommand) {
      sock.write(hexToBuf(config.loginCommand));
      await readSocket(sock, { idleMs: 1500 });
    }
    sock.write(hexToBuf(config.dataCommand || 'ef010000'));
    const body = await readSocket(sock, { idleMs: 4000 });
    return body.toString('latin1').split(/[\r\n]+/).map(parseLine).filter(Boolean);
  } finally {
    sock.destroy();
  }
}

export default { name: 'cmitech', fetchAttendance };
