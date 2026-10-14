/**
 * FPVtech / DigitalFinger driver — binary protocol over TCP (default port 6535).
 * Frame: [0x78][len(1)][cmd(2 BE)][serial(4)][status(1)][data...][crc16(2)]
 * Handshake: cmd 0x0004 (connect), then read logs cmd 0x0A00 (GetLogCount) and
 * 0x0A01 (GetLog). CRC16-XMODEM over everything before the crc field.
 */
import { tcpConnect, normalizeRecord, DriverError } from '../base.mjs';

const HDR = 0x78;

function crc16(buf) {
  let crc = 0;
  for (const b of buf) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function frame(cmd, data = Buffer.alloc(0), serial = 1) {
  const body = Buffer.alloc(8 + data.length);
  body.writeUInt8(HDR, 0);
  body.writeUInt8(body.length + 2, 1); // total incl crc
  body.writeUInt16BE(cmd, 2);
  body.writeUInt32BE(serial, 4);
  body.writeUInt8(0, 8); // status ok (request)
  data.copy(body, 9);
  const crc = crc16(body.subarray(0, body.length));
  return Buffer.concat([body, Buffer.from([crc >> 8, crc & 0xff])]);
}

export async function fetchAttendance(device, config) {
  const host = device.IPAddress;
  const port = device.Port || 6535;
  if (!host) throw new DriverError('Device has no IP address', 'ENOHOST');

  const sock = await tcpConnect(host, port, { timeoutMs: 8000 });
  try {
    // connect handshake with com key
    const key = Buffer.alloc(4);
    key.writeUInt32BE(parseInt(String(config.comKey ?? '0'), 10) || 0, 0);
    sock.write(frame(0x0004, key));
    const ack = await readFrame(sock);
    if (!ack || ack.cmd !== 0x8004) throw new DriverError('FPVtech handshake failed', 'EPROTO');

    // get log count
    sock.write(frame(0x0a00));
    const cnt = await readFrame(sock);
    const count = cnt ? cnt.data.readUInt16BE(0) : 0;
    if (count === 0) return [];

    // pull up to last 100 logs
    const want = Math.min(count, 100);
    const req = Buffer.alloc(4);
    req.writeUInt16BE(count - want, 0); // start index
    req.writeUInt16BE(want, 2);         // amount
    sock.write(frame(0x0a01, req));

    const records = [];
    for (let i = 0; i < want; i++) {
      const f = await readFrame(sock, 3000);
      if (!f) break;
      const r = parseLog(f.data);
      if (r) records.push(r);
    }
    return records;
  } finally {
    sock.destroy();
  }
}

function readFrame(sock, idleMs = 4000) {
  return new Promise((resolve) => {
    const chunks = [];
    let len = 0;
    const timer = setTimeout(() => finish(), idleMs);
    function finish() {
      clearTimeout(timer);
      sock.removeAllListeners('data');
      const buf = Buffer.concat(chunks, len);
      const idx = buf.indexOf(HDR);
      if (idx < 0 || buf.length < idx + 2) return resolve(null);
      const flen = buf[idx + 1];
      if (buf.length < idx + flen) return resolve(null);
      const f = buf.subarray(idx, idx + flen);
      const cmd = f.readUInt16BE(idx + 2 - idx);
      resolve({ cmd, status: f[8], data: f.subarray(9, flen - 2) });
    }
    sock.on('data', (d) => { chunks.push(d); len += d.length; if (len > 16) finish(); });
    sock.once('error', finish);
    sock.once('close', finish);
  });
}

/** Log record layout (typical): userId(16 ascii or 4B), time(5: yy mm dd hh mm), type(1) */
function parseLog(d) {
  if (!d || d.length < 8) return null;
  try {
    let off = 0;
    let userId = '';
    // some firmwares pad user id with zeros as ASCII
    while (off < d.length && d[off] >= 0x30 && d[off] <= 0x7a) userId += String.fromCharCode(d[off++]);
    if (!userId) userId = d.readUInt32LE(0).toString();
    const t = d.subarray(off, off + 5);
    const ts = new Date(2000 + t[0], t[1] - 1, t[2], t[3], t[4]);
    const type = d[off + 5];
    return normalizeRecord({
      userId,
      timestamp: isNaN(ts.getTime()) ? new Date() : ts,
      eventType: type === 2 || type === 14 ? 'checkout' : 'checkin',
      verificationMethod: typeToMethod(type),
      raw: d.toString('hex'),
    });
  } catch {
    return null;
  }
}

function typeToMethod(t) {
  if ([1, 2].includes(t)) return 'fingerprint';
  if ([3, 4].includes(t)) return 'card';
  if ([13, 14].includes(t)) return 'face';
  if ([5, 6].includes(t)) return 'password';
  return null;
}

export default { name: 'fpvtech', fetchAttendance };
