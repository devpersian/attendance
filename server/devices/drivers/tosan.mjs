/**
 * Tosan (توسان) driver — Iranian attendance terminals, e.g. TSP-450 sold by
 * spersia.com ("دستگاه حضور و غیاب ایرانی").
 *
 * Tosan terminals expose a LAN protocol on TCP port 8590: the host sends a
 * short binary/ASCII request frame and the device streams log rows back as
 * delimited text lines ("PIN,YYYY/MM/DD,HH:MM:SS,IN|OUT,..."). Because exact
 * frames differ per firmware, this driver is command-configurable like the
 * generic TCP driver but defaults to the documented Tosan request bytes and
 * parses any lenient date/time line it receives.
 *
 * config keys: { loginCommand (hex, optional), dataCommand (hex, default
 *              "ef010000" — Tosan GETLOG frame), timezoneOffsetMinutes }
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';

const hexToBuf = (h) => Buffer.from(String(h || '').replace(/[^0-9a-f]/gi, ''), 'hex');

const DATE_RE = /^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

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
  return normalizeRecord({ userId, timestamp: ts, eventType, verificationMethod: 'tosan', raw: trimmed });
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 8590;
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

export default { name: 'tosan', fetchAttendance };
