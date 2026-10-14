/**
 * server.mjs — Spersia Enrollment Bridge: local HTTP service for the web UI.
 *
 * Why this exists: browsers cannot talk to fingerprint/iris/palm vendor SDKs,
 * USB HID card readers or (reliably) serial devices. This tiny service runs on
 * the enrollment operator's Windows PC (any OS, actually), exposes a plain
 * JSON API on http://127.0.0.1:8485 and forwards browser instructions to the
 * native layers in ./services:
 *
 *   GET  /health                 -> { ok, name, version, platform, uptime }
 *   GET  /capabilities           -> what THIS machine can capture right now
 *   GET  /sdk/providers          -> detected vendor SDKs + statuses
 *   POST /sdk/provider {id}      -> activate one provider
 *   POST /sdk/rescan             -> re-detect DLLs (after dropping files in ./sdk)
 *   POST /sdk/capture            -> { type, slot?, quality? } -> uniform template result
 *   GET  /card/devices           -> enumerate USB HID card readers
 *   POST /card/read              -> wait for one swipe -> { value, hex, format, wiegand }
 *   POST /enroll                 -> ONE-STOP: capture locally AND upload straight to
 *                                   the Spersia server as a canonical enrollment
 *   GET  /log                    -> recent bridge activity (UI diagnostics drawer)
 *
 * Security model:
 *  - binds to 127.0.0.1 only;
 *  - CORS restricted to allowlisted origins (the app origin + localhost dev
 *    ports) so arbitrary websites cannot poke your card reader;
 *  - optional shared secret: set BRIDGE_TOKEN here AND `VITE_BRIDGE_TOKEN`
 *    for the web app, then every request must carry `x-bridge-token`.
 *
 * Zero-dependency by design: Node built-ins only. Native hardware access is
 * optional (ffi-napi / node-hid); when absent everything degrades gracefully
 * and the web UI falls back to webcam/file/wedge capture.
 */
import http from 'node:http';
import { hostname, release, platform, arch } from 'node:os';
import { listStatus, detect, setActive, capture as sdkCapture, closeAll, ffiAvailability } from './services/sdkManager.mjs';
import * as cardReader from './services/cardReader.mjs';

const PORT = Number(process.env.BRIDGE_PORT || 8485);
const HOST = process.env.BRIDGE_HOST || '127.0.0.1'; // loopback only, on purpose
const TOKEN = process.env.BRIDGE_TOKEN || '';
const SERVER_URL = process.env.SPERSIA_SERVER_URL || 'http://localhost:3001/api';
const ALLOWED_ORIGINS = String(process.env.BRIDGE_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const VERSION = '1.0.0';
const startedAt = Date.now();

// ---------------------------------------------------------------------------
// ring log for UI diagnostics
// ---------------------------------------------------------------------------
const LOG_CAP = 200;
const logBuf = [];
function log(...parts) {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  const entry = { ts: new Date().toISOString(), line };
  logBuf.push(entry);
  if (logBuf.length > LOG_CAP) logBuf.shift();
  console.log(`[bridge ${entry.ts.slice(11, 19)}] ${line}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (err) { reject(new Error(`invalid JSON body: ${err.message}`)); }
    });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function checkAuth(req) {
  if (!TOKEN) return true;
  return (req.headers['x-bridge-token'] || '') === TOKEN;
}

function corsHeaders(req) {
  const origin = req.headers.origin || '';
  const devOk = /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  const allowed = !origin || ALLOWED_ORIGINS.includes(origin) || (ALLOWED_ORIGINS.length === 0 && devOk);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-token, authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** POST the captured credential straight into the canonical enrollment store. */
async function uploadEnrollment({ serverUrl, token, payload }) {
  const url = `${String(serverUrl || SERVER_URL).replace(/\/$/, '')}/enrollments/templates`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `server responded ${resp.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// capability report — the single call the web UI makes to configure itself
// ---------------------------------------------------------------------------

function capabilities() {
  const ffi = ffiAvailability();
  const sdkProviders = listStatus();
  const hid = (() => {
    try {
      const d = cardReader.listDevices();
      return Array.isArray(d) ? { available: true, readers: d } : { available: false, reason: d.error, wedgeHint: true };
    } catch (err) { return { available: false, reason: err.message, wedgeHint: true }; }
  })();
  const readySdk = sdkProviders.filter((p) => p.status === 'ready');
  return {
    ok: true,
    name: 'spersia-enrollment-bridge',
    version: VERSION,
    platform: `${platform()}/${arch()}`,
    osRelease: release(),
    hostname: hostname(),
    authenticated: !TOKEN,
    tokenRequired: Boolean(TOKEN),
    serverUrl: SERVER_URL,
    uptimeMs: Date.now() - startedAt,
    capabilities: {
      sdk: {
        available: readySdk.length > 0,
        ffiAvailable: ffi.available,
        ffiReason: ffi.reason || null,
        providers: sdkProviders,
        active: readySdk.find((p) => p.active)?.id || null,
        types: [...new Set(readySdk.flatMap((p) => p.types))],
      },
      card: {
        hidAvailable: Boolean(hid.available),
        hidReason: hid.reason || null,
        readers: hid.readers || [],
        wedgeHint: true, // keyboard-wedge readers always work via the web form
      },
      // informational: these are handled IN THE BROWSER, not by the bridge
      browser: { camera: true, fileImport: true, webusbOptional: true },
    },
  };
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathName = url.pathname.replace(/\/+$/, '') || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  Object.entries(corsHeaders(req)).forEach(([k, v]) => v && res.setHeader(k, v));

  if (!checkAuth(req)) {
    log('401', pathName, 'missing/bad x-bridge-token');
    return send(res, 401, { error: 'invalid bridge token' });
  }

  try {
    // ---- health & capabilities ------------------------------------------
    if (pathName === '/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, name: 'spersia-enrollment-bridge', version: VERSION, platform: platform(), hostname: hostname(), uptimeMs: Date.now() - startedAt });
    }
    if (pathName === '/capabilities' && req.method === 'GET') {
      return send(res, 200, capabilities());
    }
    if (pathName === '/log' && req.method === 'GET') {
      return send(res, 200, { entries: logBuf.slice(-Number(url.searchParams.get('limit') || 50)) });
    }

    // ---- vendor SDK ------------------------------------------------------
    if (pathName === '/sdk/providers' && req.method === 'GET') {
      if (listStatus().length === 0) detect(process.env.SDK_DIR);
      return send(res, 200, { providers: listStatus(), ffi: ffiAvailability() });
    }
    if (pathName === '/sdk/rescan' && req.method === 'POST') {
      log('sdk rescan');
      return send(res, 200, { providers: detect(process.env.SDK_DIR), ffi: ffiAvailability() });
    }
    if (pathName === '/sdk/provider' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.id) return send(res, 400, { error: 'id required' });
      log('sdk activate', body.id);
      return send(res, 200, { providers: setActive(String(body.id)) });
    }
    if (pathName === '/sdk/capture' && req.method === 'POST') {
      const body = await readBody(req);
      const type = String(body.type || 'fingerprint');
      log('sdk capture', type, body.slot || '');
      const out = await sdkCapture(type, { slot: body.slot, quality: body.quality });
      return send(res, 200, out);
    }

    // ---- card reader -----------------------------------------------------
    if (pathName === '/card/devices' && req.method === 'GET') {
      const d = cardReader.listDevices();
      return send(res, 200, Array.isArray(d) ? { devices: d } : d);
    }
    if (pathName === '/card/read' && req.method === 'POST') {
      const body = await readBody(req);
      log('card read wait', body.path || '(auto)');
      const out = await cardReader.waitForCard({ path: body.path, timeoutMs: Math.min(Number(body.timeoutMs) || 20000, 120000) });
      log('card read ok', out.value);
      return send(res, 200, out);
    }

    // ---- one-stop enroll: capture + upload to the project server ---------
    if (pathName === '/enroll' && req.method === 'POST') {
      const body = await readBody(req);
      const { employeeId, templateType = 'fingerprint', slot, value, algorithm, quality,
        source = 'auto', templateBase64, serverUrl, token, deviceId } = body;
      if (!employeeId) return send(res, 400, { error: 'employeeId required' });

      let captured = null;
      let usedSource = source;
      if (templateBase64) {
        // browser already captured something (webcam frame, imported file, typed card)
        captured = { templateBase64, algorithm: algorithm || null, quality: quality ?? null, provider: 'browser' };
        usedSource = 'browser';
      } else if (source === 'local-sdk' || (source === 'auto' && ['fingerprint', 'face', 'irisscan', 'palmvein'].includes(templateType))) {
        captured = await sdkCapture(templateType, { slot, quality });
        usedSource = 'local-sdk';
      } else if (templateType === 'card' && (source === 'auto' || source === 'local-card')) {
        const card = await cardReader.waitForCard({ path: body.cardPath, timeoutMs: body.timeoutMs });
        captured = { value: card.value, algorithm: card.format, provider: 'hid-reader' };
        usedSource = 'local-card';
      } else if (templateType === 'card' && value) {
        captured = { value, algorithm: algorithm || 'manual-entry' };
        usedSource = 'browser';
      } else {
        return send(res, 400, { error: `cannot capture "${templateType}" with source "${source}" on this machine` });
      }

      const payload = {
        employeeId,
        templateType,
        slot: slot || null,
        value: captured.value ?? (value || null),
        algorithm: captured.algorithm || algorithm || null,
        quality: captured.quality ?? quality ?? null,
        templateBase64: captured.templateBase64 || null,
        sourceDeviceId: deviceId || null,
        status: 'active',
        replace: true,
      };
      log('enroll upload', templateType, usedSource, `emp=${employeeId}`);
      const uploaded = await uploadEnrollment({ serverUrl, token, payload });
      return send(res, 200, { ok: true, source: usedSource, provider: captured.provider || null, upload: uploaded });
    }

    return send(res, 404, { error: `no route ${req.method} ${pathName}` });
  } catch (err) {
    log('ERROR', pathName, err.message);
    return send(res, 500, { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

export function startBridge(port = PORT) {
  detect(process.env.SDK_DIR); // warm the provider cache at boot
  const server = http.createServer(handle);
  server.listen(port, HOST, () => {
    log(`listening on http://${HOST}:${port} (token ${TOKEN ? 'REQUIRED' : 'off'}) -> server ${SERVER_URL}`);
    const caps = capabilities();
    log('capabilities:', JSON.stringify({
      sdkReady: caps.capabilities.sdk.available,
      sdkTypes: caps.capabilities.sdk.types,
      hidReaders: caps.capabilities.card.readers?.length || 0,
    }));
  });
  const bye = () => { try { closeAll(); } catch {} server.close(); process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
  return server;
}

// run directly (node server.mjs) — skipped when imported by main.js/service
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  startBridge();
}
