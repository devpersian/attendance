/**
 * Suprema BioStar 2 REST driver (BioPro, BioStation 2, XPass ...).
 * Reads events from the BioStar 2 server that manages the devices:
 *   GET {serverUrl}/api/events?size=100&sort=occurredAt,desc
 *       header: X-Access-Token: <apiToken>
 */
import { httpJSON, normalizeRecord } from '../base.mjs';

export async function fetchAttendance(device, config) {
  const server = (config.serverUrl || '').replace(/\/+$/, '');
  if (!server) throw Object.assign(new Error('BioStar 2 server URL not configured'), { code: 'ECONFIG' });
  const token = config.apiToken || '';

  const url = `${server}/api/events?size=100&sort=occurredAt,desc`;
  const json = await httpJSON(url, { headers: { 'X-Access-Token': token }, timeoutMs: 15000 });

  const list = json?.list || json?.events || [];
  return list
    .filter((e) => e.type === 'IN_OUT' || /in|out/i.test(String(e.type || '')))
    .map((e) => normalizeRecord({
      userId: String(e.user?.userID ?? e.user?.employeeID ?? e.user?.name ?? '').trim(),
      timestamp: e.occurredAt ?? new Date(),
      eventType: /out/i.test(String(e.inOutType ?? e.direction ?? '')) ? 'checkout' : 'checkin',
      verificationMethod: e.verifyMethod || 'biometric',
      raw: e,
    }))
    .filter((r) => r.userId);
}

export default { name: 'biostar2', fetchAttendance };
