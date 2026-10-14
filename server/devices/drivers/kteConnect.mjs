/**
 * KTE Connect cloud driver — pulls attendance from ZKTeco's KTE Connect REST API.
 * config: { serverUrl, apiToken }
 */
import { httpJSON, normalizeRecord } from '../base.mjs';

export async function fetchAttendance(device, config) {
  const server = (config.serverUrl || '').replace(/\/+$/, '');
  if (!server) throw Object.assign(new Error('KTE Connect server URL not configured'), { code: 'ECONFIG' });

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3600 * 1000);
  const url = `${server}/api/v1/attendance?deviceSn=${encodeURIComponent(config.deviceSn || device.SerialNumber || '')}`
    + `&from=${from.toISOString()}&to=${now.toISOString()}`;

  const json = await httpJSON(url, { headers: { Authorization: `Bearer ${config.apiToken || ''}` }, timeoutMs: 15000 });
  const list = json?.data || json?.records || [];
  return list.map((e) => normalizeRecord({
    userId: String(e.pin ?? e.userId ?? e.enrollNo ?? '').trim(),
    timestamp: e.verifyTime ?? e.timestamp ?? new Date(),
    eventType: /out/i.test(String(e.status ?? e.inOut ?? '')) ? 'checkout' : 'checkin',
    verificationMethod: e.verifyMode || null,
    raw: e,
  })).filter((r) => r.userId);
}

export default { name: 'kte-connect', fetchAttendance };
