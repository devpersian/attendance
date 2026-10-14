/**
 * Generic TCP driver for custom/unknown protocols.
 * config: { loginCommand (hex), dataCommand (hex) } — sent verbatim; the raw
 * reply is parsed leniently as "PIN,TIME[,TYPE]" lines (same parser as zk).
 */
import { tcpConnect, readSocket, normalizeRecord, DriverError } from '../base.mjs';
import { parseFlexibleDate } from './zk.mjs';

const hexToBuf = (h) => Buffer.from(String(h || '').replace(/[^0-9a-f]/gi, ''), 'hex');

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 4370;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    if (config.loginCommand) {
      sock.write(hexToBuf(config.loginCommand));
      await readSocket(sock, { idleMs: 1500 });
    }
    sock.write(hexToBuf(config.dataCommand || 'ef010000'));
    const body = await readSocket(sock, { idleMs: 4000 });
    return parse(body.toString('latin1'));
  } finally {
    sock.destroy();
  }
}

function parse(text) {
  const records = [];
  for (const line of text.split(/[\r\n]+/)) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const userId = parts[0].replace(/[^\w-]/g, '');
    const timeStr = parts.slice(1).find((p) => /\d{1,4}[/:]\d{2}/.test(p));
    if (!userId || !timeStr) continue;
    const ts = parseFlexibleDate(timeStr);
    if (!ts) continue;
    records.push(normalizeRecord({
      userId,
      timestamp: ts,
      eventType: /out/i.test(line) ? 'checkout' : 'checkin',
      verificationMethod: 'tcp-raw',
      raw: line,
    }));
  }
  return records;
}

export default { name: 'tcp', fetchAttendance };
