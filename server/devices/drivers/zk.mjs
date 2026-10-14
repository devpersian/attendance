/**
 * ZK Pull Protocol driver (ZKTeco, eSSL, CrossChex, IDTECO, Mythlink, Timerime, RCP...).
 * Classic binary protocol over TCP/4370: login then dump attendance log.
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';

const CMD_LOGIN = 10;
const CMD_LOG_NEW = 13;

function buildCommand(cmd, data = Buffer.alloc(0)) {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt8(cmd & 0xff, 0);
  buf.writeUInt8((cmd >> 8) & 0xff, 1);
  buf.writeUInt16LE(0, 2); // credential
  buf.writeUInt16LE(data.length, 4);
  data.copy(buf, 8);
  return buf;
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 4370;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    sock.write(buildCommand(CMD_LOGIN, Buffer.from(String(config.password ?? '0'), 'utf-8')));
    await sleep(300);
    sock.write(buildCommand(CMD_LOG_NEW, Buffer.from('*', 'utf-8')));
    const body = await readSocket(sock, { idleMs: 4000 });
    return parseLogResponse(body);
  } finally {
    sock.destroy();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parse CSV-ish "PIN,Time,Status" lines returned after the log dump command. */
function parseLogResponse(buf) {
  const text = buf.toString('latin1');
  const records = [];
  for (const line of text.split(/[\r\n]+/)) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const userId = parts[0].replace(/[^\w-]/g, '');
    const timeStr = parts.slice(1).find((p) => /\d{1,4}[/:]\d{2}/.test(p));
    if (!userId || !timeStr) continue;
    const ts = parseFlexibleDate(timeStr);
    if (!ts) continue;
    const status = (parts.find((p) => /^(in|out|i\/o)$/i.test(p)) || '').toLowerCase();
    records.push(normalizeRecord({
      userId,
      timestamp: ts,
      eventType: /out/.test(status) ? 'checkout' : 'checkin',
      verificationMethod: 'zk-pull',
      raw: line,
    }));
  }
  return records;
}

export function parseFlexibleDate(s) {
  const m = s.match(/(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
    || s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
  if (!m) return null;
  let year, month, day, hh = 0, mm = 0, ss = 0;
  if (/^\d{1,2}:\d{2}/.test(s.trim())) {
    [, hh, mm, ss, a, b, c] = pad(m);
    day = +a; month = +b; year = fixYear(c);
  } else {
    let [, a, b, c, h1, m1, s1] = pad(m);
    hh = +h1; mm = +m1; ss = +(s1 || 0);
    if (a.length === 4) { year = +a; month = +b; day = +c; }
    else if (c.length === 4) { day = +a; month = +b; year = +c; }
    else { day = +a; month = +b; year = fixYear(c); }
  }
  const d = new Date(year, month - 1, day, hh, mm, ss);
  return isNaN(d.getTime()) ? null : d;
}

function pad(m) { while (m.length < 7) m.push('0'); return m; }
function fixYear(y) { const n = +y; return n < 100 ? 2000 + n : n; }

export default { name: 'zk', fetchAttendance };
