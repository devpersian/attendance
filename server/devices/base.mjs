/**
 * Base helpers shared by all device protocol drivers.
 */
import net from 'net';

export class DriverError extends Error {
  constructor(message, code = 'DRIVER_ERROR') {
    super(message);
    this.code = code;
  }
}

/** Parse "key=value" or JSON config blob stored on Devices.Config into an object */
export function parseConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    // fall back to key=value lines
    const out = {};
    for (const line of String(raw).split(/[\n;]+/)) {
      const i = line.indexOf('=');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  }
}

/** Open a TCP socket with connect timeout; resolves to a connected socket */
export function tcpConnect(host, port, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        sock.destroy();
        reject(new DriverError(`TCP connect timeout to ${host}:${port}`, 'ETIMEDOUT'));
      }
    }, timeoutMs);

    sock.setTimeout(timeoutMs);
    sock.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(sock);
    });
    sock.once('timeout', () => {
      sock.destroy();
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new DriverError(`TCP inactivity timeout to ${host}:${port}`, 'ETIMEDOUT'));
      }
    });
    sock.once('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      } else {
        sock.destroy();
      }
    });
    sock.connect(port, host);
  });
}

/** Collect `expectedBytes` from a socket (or until idle), then destroy it */
export function readSocket(sock, { idleMs = 3000, maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let len = 0;
    let idleTimer = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };
    const finish = () => {
      clearTimeout(idleTimer);
      sock.removeAllListeners('data');
      sock.destroy();
      resolve(Buffer.concat(chunks, len));
    };
    sock.on('data', (d) => {
      chunks.push(d);
      len += d.length;
      if (len >= maxBytes) return finish();
      resetIdle();
    });
    sock.on('close', finish);
    sock.on('error', finish);
    resetIdle();
  });
}

/** HTTP fetch with timeout, returns parsed JSON or throws DriverError */
export async function httpJSON(url, { method = 'GET', headers = {}, body, timeoutMs = 15000, auth } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers, ...(auth ? { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {}) },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* some devices answer XML/plain */ }
    if (!res.ok) {
      throw new DriverError(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`, 'EHTTP');
    }
    return json ?? text;
  } finally {
    clearTimeout(t);
  }
}

/** Normalize a raw device record into our common shape */
export function normalizeRecord(rec) {
  return {
    userId: String(rec.userId ?? rec.UserId ?? rec.pin ?? rec.Pin ?? rec.cardNo ?? rec.CardNo ?? '').trim(),
    timestamp: rec.timestamp ?? rec.Timestamp ?? rec.time ?? rec.checkTime ?? new Date(),
    eventType: (rec.eventType ?? rec.EventType ?? rec.type ?? inferType(rec)).toString().toLowerCase(),
    verificationMethod: rec.verificationMethod ?? rec.VerificationMethod ?? rec.method ?? null,
    raw: rec,
  };
}

function inferType(rec) {
  const s = JSON.stringify(rec).toLowerCase();
  if (s.includes('checkout') || s.includes('out')) return 'checkout';
  return 'checkin';
}
