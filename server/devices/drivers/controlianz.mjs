/**
 * Controlianz driver — telnet-style text protocol over TCP (port 8600).
 * Flow: login <user> / password, then "GETATTENDANCE" returns lines like:
 *   PIN,YYYY/MM/DD HH:MM:SS,IN|OUT,TYPE
 */
import { tcpConnect, readSocket, normalizeRecord } from '../base.mjs';

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 8600;

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    // wait for banner
    await readSocket(sock, { idleMs: 1500 });
    sock.write(`login ${config.username || 'admin'}\r\n`);
    await readSocket(sock, { idleMs: 1200 });
    sock.write(`${config.password || 'admin'}\r\n`);
    await readSocket(sock, { idleMs: 1500 });
    sock.write('GETATTENDANCE\r\n');
    const body = await readSocket(sock, { idleMs: 4000 });
    return parse(body.toString('utf-8'));
  } finally {
    sock.destroy();
  }
}

function parse(text) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([\w-]+),(\d{4}[/-]\d{1,2}[/-]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?),(\w+)/i);
    if (!m) continue;
    records.push(normalizeRecord({
      userId: m[1],
      timestamp: new Date(m[2].replace(/\//g, '-')),
      eventType: /^out/i.test(m[3]) ? 'checkout' : 'checkin',
      verificationMethod: null,
      raw: line.trim(),
    }));
  }
  return records;
}

export default { name: 'controlianz', fetchAttendance };
