/**
 * Dahua Web Service driver (ASI7216X, ASR1032E, ASI8214E ...).
 * Uses HTTP digest/Basic JSON API: POST /cgi-bin/lsapi/call or the classic
 * /cgi-bin/priv.dll search — many firmwares expose events via
 * GET /cgi-bin/eventCfg.cgi?cmd=get. We use the modern `intelligent` event search:
 *   POST http://ip:port/cgi-bin/manager/accountManager.isapi  (login)
 *   GET  http://ip:port/cgi-bin/snapshot.cgi                  (not used)
 * For simplicity we poll the documented EventUpload store if configured, else
 * use the "magic" search CGI used by DSS:
 *   GET /cgi-bin/EventSearch.cgi?...  (firmware-dependent)
 */
import { httpJSON, normalizeRecord, DriverError } from '../base.mjs';

export async function fetchAttendance(device, config) {
  const base = device.IPAddress.startsWith('http') ? device.IPAddress : `http://${device.IPAddress}:${device.Port || 80}`;
  const auth = `${config.username || 'admin'}:${config.password || ''}`;

  // Try the JSON-RPC style endpoint first (newer terminals)
  try {
    const res = await httpJSON(`${base}/cgi-bin/EventMgr.cgi?action=search`, { auth, timeoutMs: 12000 });
    const list = Array.isArray(res) ? res : (res?.events || []);
    return list.map(toRecord);
  } catch (e) {
    if (e.code !== 'EHTTP' && e.code !== 'ETIMEDOUT') throw e;
  }

  // Fallback: legacy XML-ish endpoint
  try {
    const txt = await httpJSON(`${base}/cgi-bin/priv.dll?cmd=eventsearch`, { auth, timeoutMs: 12000 });
    if (typeof txt === 'string') return parseLegacy(txt);
    return (txt?.events || []).map(toRecord);
  } catch (err) {
    throw new DriverError(`Dahua pull failed: ${err.message}`, err.code);
  }
}

function toRecord(ev) {
  return normalizeRecord({
    userId: String(ev.UserID ?? ev.userId ?? ev.CardNo ?? ev.Name ?? '').trim(),
    timestamp: ev.DateTime ?? ev.time ?? new Date(),
    eventType: /out|leave/i.test(String(ev.Classify ?? ev.type ?? '')) ? 'checkout' : 'checkin',
    verificationMethod: ev.Kind === 'Face' ? 'face' : ev.Kind === 'Card' ? 'card' : null,
    raw: ev,
  });
}

function parseLegacy(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+),([\d/: -]+),(IN|OUT)/i);
    if (!m) continue;
    out.push(normalizeRecord({
      userId: m[1],
      timestamp: m[2],
      eventType: m[3].toUpperCase() === 'OUT' ? 'checkout' : 'checkin',
      verificationMethod: null,
      raw: line,
    }));
  }
  return out;
}

export default { name: 'dws', fetchAttendance };
