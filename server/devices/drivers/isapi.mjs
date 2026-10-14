/**
 * Hikvision ISAPI driver (DS-K1Txxx face/card terminals, access controllers).
 * Pulls events via POST /ISAPI/AccessControl/AcsEvent?format=json with HTTP Digest auth.
 * Node's fetch doesn't implement digest natively, so we do a minimal challenge/response.
 */
import crypto from 'crypto';
import { normalizeRecord, DriverError } from '../base.mjs';

async function digestRequest(url, username, password, body) {
  const send = (authHeader) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  let res = await send(null);
  if (res.status === 401) {
    const challenge = res.headers.get('www-authenticate') || '';
    const www = parseDigestChallenge(challenge);
    if (!www.realm) throw new DriverError('Device did not send a Digest challenge', 'EAUTH');
    const ha1 = md5(`${username}:${www.realm}:${password}`);
    const nonceOut = crypto.randomBytes(8).toString('hex');
    const uri = new URL(url).pathname + new URL(url).search;
    let response;
    if (www.qop) {
      const nc = '00000001';
      const ha2 = md5(`POST:${uri}`);
      response = md5(`${ha1}:${www.nonce}:${nc}:${nonceOut}:${www.qop}:${ha2}`);
    } else {
      response = md5(`${ha1}:${www.nonce}:${md5(`POST:${uri}`)}`);
    }
    const header = `Digest username="${username}", realm="${www.realm}", nonce="${www.nonce}", uri="${uri}", response="${response}"`
      + (www.qop ? `, qop=${www.qop}, nc=00000001, cnonce=${nonceOut}` : '')
      + (www.opaque ? `, opaque="${www.opaque}"` : '');
    res = await send(header);
  }
  const text = await res.text();
  if (!res.ok) throw new DriverError(`ISAPI HTTP ${res.status}: ${text.slice(0, 200)}`, 'EHTTP');
  try { return JSON.parse(text); } catch { return text; }
}

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function parseDigestChallenge(h) {
  const out = {};
  for (const m of h.matchAll(/(\w+)=(?:"([^"]*)"|([\w:-]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  out.qop = out.qop ? out.qop.split(',')[0].trim() : '';
  return out;
}

function fmtIso(d) {
  // ISAPI wants local-time ISO without Z on many firmwares
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function fetchAttendance(device, config) {
  const base = device.IPAddress.startsWith('http') ? device.IPAddress : `http://${device.IPAddress}:${device.Port || 80}`;
  const url = `${base}/ISAPI/AccessControl/AcsEvent?format=json`;
  const now = new Date();
  const from = new Date(now.getTime() - (config.backWindowMinutes || 24 * 60) * 60 * 1000);

  const body = JSON.stringify({
    AcsEventCond: {
      searchResultPosition: 0,
      maxResultsPerPage: 30,
      major: 0,          // 0 = all events; 5 = access control events
      minor: 0,
      startTime: fmtIso(from),
      endTime: fmtIso(now),
      timeReverse: true,
    },
  });

  const json = await digestRequest(url, config.username || 'admin', config.password || 'admin', body);
  const list = json?.AcsEvent?.Info || json?.Info || [];
  const records = [];
  for (const ev of list) {
    // employeeNameNo is the card/PIN; eventTime like "2026-10-07T08:59:01+03:30"
    const userId = String(ev.employeeNameNo ?? ev.cardNo ?? ev.pin ?? '').trim();
    if (!userId) continue;
    records.push(normalizeRecord({
      userId,
      timestamp: ev.time ?? ev.eventTime ?? new Date(),
      eventType: guessInOut(ev),
      verificationMethod: verifyModeLabel(ev.verifyMode),
      raw: ev,
    }));
  }
  return records;
}

function guessInOut(ev) {
  // minor codes: 5=verify passed(in), 6=... varies; default checkin unless door-out flag present
  const s = JSON.stringify(ev).toLowerCase();
  if (s.includes('"out"') || ev.doorNumber === 2) return 'checkout';
  return 'checkin';
}
function verifyModeLabel(v) {
  const map = { 1: 'face', 2: 'fingerprint', 3: 'card', 4: 'password', 8: 'face', 14: 'face' };
  return map[v] || null;
}

export default { name: 'isapi', fetchAttendance };
