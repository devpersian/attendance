/**
 * sdkManager — locate, load and wrap vendor biometric SDKs on Windows.
 *
 * Browsers cannot run fingerprint/iris/palm SDKs (they are native Win32
 * libraries shipped with the device, e.g. ZKTeco `zktlbio.dll`, Suprema
 * `BioStation` SDK, Hikvision ISAPI face capture). This service runs on the
 * operator's PC, loads those DLLs at runtime via `ffi-napi` (koffi is used as
 * a fallback engine when present) and exposes a UNIFORM capture API:
 *
 *     capture('fingerprint', { slot }) -> { ok, templateBase64, algorithm, quality }
 *
 * The uniform result is exactly what the web app posts to
 * `POST /api/enrollments/templates` — so captures from ANY vendor SDK land in
 * the same canonical store and can be transferred to ANY device.
 *
 * Design rules:
 *  - Zero hard dependencies: if ffi-napi or a vendor DLL is missing, the
 *    manager still boots and reports each provider's status honestly; the UI
 *    then falls back to webcam / file-import / keyboard-wedge capture.
 *  - Providers are declarative: adding a new reader = one entry in PROVIDERS
 *    (or dropping a JSON manifest next to the DLLs — see loadManifests()).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// optional native deps — loaded lazily, never crash the bridge
// ---------------------------------------------------------------------------

let ffiLib = null;         // ffi-napi instance once successfully loaded
let ffiLoadError = null;   // human-readable reason it isn't available

export function ensureFfi() {
  if (ffiLib) return ffiLib;
  if (ffiLoadError) throw new Error(ffiLoadError);
  try {
    ffiLib = require('ffi-napi');
    return ffiLib;
  } catch (errA) {
    try {
      // koffi exposes a similar surface; adapt just enough for our use
      const koffi = require('koffi');
      ffiLib = {
        Library(file, _conv) {
          const lib = koffi.load(file);
          return new Proxy({}, {
            get(_t, name) {
              if (typeof name !== 'string') return undefined;
              return (...args) => lib[name](...args);
            },
            has() { return true; },
          });
        },
      };
      return ffiLib;
    } catch (errB) {
      ffiLoadError =
        'FFI engine not installed. Run "npm install" inside enrollment-bridge ' +
        `(ffi-napi${errA && errA.code ? ` [${errA.code}]` : ''}, koffi${errB && errB.code ? ` [${errB.code}]` : ''}).`;
      throw new Error(ffiLoadError);
    }
  }
}

/** Candidate locations where vendor DLLs usually live on an operator PC. */
function searchDirs(extra = []) {
  const dirs = [...extra];
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    dirs.push(
      path.join(process.cwd(), 'sdk'),                 // ./sdk next to the bridge
      path.join(path.dirname(process.execPath), 'sdk'),// bundled beside the packaged exe
      path.join(pf, 'ZKSoftware', 'ZKBrowser'),
      path.join(pf, 'ZKTeco'),
      path.join(pf86, 'ZKSoftware', 'ZKBrowser'),
      path.join(pf86, 'ZKTeco'),
      path.join(pf, 'Hikvision', 'ISADSK'),
      path.join(pf86, 'Suprema', 'BioStar II SDK'),
      path.join(pf, 'Suprema'),
    );
  }
  dirs.push(path.join(os.homedir(), '.spersia', 'enrollment-bridge', 'sdk'));
  return dirs;
}

/** Find a DLL by trying candidate names across candidate directories. */
export function findLibrary(names, extraDirs = []) {
  const tried = [];
  for (const dir of searchDirs(extraDirs)) {
    for (const name of names) {
      const full = path.isAbsolute(name) ? name : path.join(dir, name);
      tried.push(full);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// built-in provider definitions (declarative)
// ---------------------------------------------------------------------------

/**
 * Each provider declares:
 *   dlls       candidate file names searched on disk
 *   init/close optional lifecycle exports
 *   modes      capture modes -> { call, args, out } describing the FFI call
 *              that fills a caller-allocated buffer with template bytes.
 *              `out: { buf, len }` names the parameter positions receiving the
 *              pointer/length; we allocate them automatically.
 *   probe      export names that must exist for the provider to activate
 */
const PROVIDERS = [
  {
    id: 'zktlbio',
    label: 'ZKTeco Bio-SDK (zktlbio.dll)',
    types: ['fingerprint', 'face'],
    dlls: ['zktlbio.dll', 'zktlbiomodule.dll', 'sdkcore.dll'],
    probe: ['OpenBiometry', 'Capture'],
    modes: {
      // classic zktlbio flow: OpenBiometry -> Capture(previewWnd, &buf,&len,&quality)
      identify: { call: 'Capture', signature: ['int','pointer','pointer','pointer','int'], argTypes: ['int','void*','void*','void*','int'], out: { buf: 1, len: 2, quality: 3 }, retBuf: false },
    },
    lifecycle: { open: { call: 'OpenBiometry', args: [] }, close: { call: 'CloseBiometry', args: [] } },
    algorithmByType: { fingerprint: 'zk-finger-v10', face: 'zk-face-v10' },
  },
  {
    id: 'hik-isapi-local',
    label: 'Hikvision local capture (HCNetSDK.dll)',
    types: ['face'],
    dlls: ['HCNetSDK.dll', 'hcnetsdk.dll'],
    probe: ['NET_DVR_Init', 'NET_DVR_CaptureJPEGPicture'],
    modes: {},
    lifecycle: { open: { call: 'NET_DVR_Init', args: [] } },
    algorithmByType: { face: 'hikface-v2' },
  },
  {
    id: 'suprema-biostation',
    label: 'Suprema BioStation / XPass SDK',
    types: ['fingerprint', 'face', 'irisscan'],
    dlls: ['SrSDK.dll', 'BioStationAPI.dll', 'srface.dll'],
    probe: ['sr_open_all', 'Sr_OpenAll'],
    modes: {},
    algorithmByType: { fingerprint: 'suprema-fp-v3', face: 'suprema-face-v2', irisscan: 'suprema-iris-v1' },
  },
];

// ---------------------------------------------------------------------------
// JSON manifests: drop-in support for any other vendor SDK
// ---------------------------------------------------------------------------

/**
 * Operators (or us, for future devices) can add a manifest file:
 *   <bridge>/sdk/<provider-id>.json   or  ~/.spersia/enrollment-bridge/sdk/*.json
 * Schema (all strings are FFI export names):
 * {
 *   "id": "tosan-fp", "label": "Tosan FP reader", "types": ["fingerprint"],
 *   "dlls": ["TsnSDK.dll"], "probe": ["TSN_Init","TSN_CaptureTemplate"],
 *   "open": "TSN_Init", "close": "TSN_Close",
 *   "capture": { "export": "TSN_CaptureTemplate",
 *                "argTypes": ["int","void*","void*"],
 *                "fixedArgs": [0], "out": { "buf": 1, "len": 2 },
 *                "successWhen": "zero" },
 *   "algorithm": "tosan-fp-v1", "maxBytes": 16384
 * }
 */
export function loadManifests(extraDirs = []) {
  const found = [];
  const seen = new Set();
  for (const dir of searchDirs(extraDirs)) {
    let entries = [];
    try { entries = fs.readdirSync(dir).filter((f) => f.endsWith('.sdk.json')); } catch { /* dir absent */ }
    for (const f of entries) {
      const full = path.join(dir, f);
      if (seen.has(full)) continue;
      seen.add(full);
      try {
        const m = JSON.parse(fs.readFileSync(full, 'utf-8'));
        if (m && m.id && Array.isArray(m.types) && Array.isArray(m.dlls)) found.push({ ...m, manifestPath: full });
      } catch (err) {
        console.warn(`[sdk] skipping bad manifest ${full}: ${err.message}`);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// runtime state
// ---------------------------------------------------------------------------

const state = {
  providers: [],           // [{ def, status:'ready'|'missing_dll'|'missing_ffi'|'error', detail }]
  activeId: null,
  libs: new Map(),         // id -> loaded ffi library handle
  opened: new Set(),       // ids whose lifecycle.open ran
};

function buildProviderList(customDllDir) {
  const defs = [...PROVIDERS, ...loadManifests(customDllDir ? [customDllDir] : [])];
  return defs.map((def) => ({
    def,
    dllPath: findLibrary(def.dlls, customDllDir ? [customDllDir] : []),
    status: 'idle',
    detail: null,
  }));
}

function probeExports(lib, names) {
  const missing = [];
  for (const n of names || []) {
    try {
      const fn = lib[n];
      if (!fn) missing.push(n);
    } catch { missing.push(n); }
  }
  return missing;
}

/** Try to load + probe every provider; update statuses. Safe to call anytime. */
export function detect(customDllDir) {
  state.providers = buildProviderList(customDllDir);
  let ffi = null;
  try { ffi = ensureFfi(); } catch (err) {
    for (const p of state.providers) { p.status = 'missing_ffi'; p.detail = err.message; }
    return listStatus();
  }
  for (const p of state.providers) {
    if (!p.dllPath) { p.status = 'missing_dll'; p.detail = `none of [${p.def.dlls.join(', ')}] found`; continue; }
    try {
      const lib = ffi.Library(p.dllPath, {});
      state.libs.set(p.def.id, lib);
      const missing = probeExports(lib, p.def.probe);
      if (missing.length) { p.status = 'error'; p.detail = `DLL lacks exports: ${missing.join(', ')}`; }
      else { p.status = 'ready'; p.detail = p.dllPath; }
    } catch (err) {
      p.status = 'error';
      p.detail = `load failed: ${err.message}`;
    }
  }
  if (!state.activeId) {
    const first = state.providers.find((p) => p.status === 'ready');
    if (first) state.activeId = first.def.id;
  }
  return listStatus();
}

export function listStatus() {
  return state.providers.map((p) => ({
    id: p.def.id,
    label: p.def.label,
    types: p.def.types,
    status: p.status,
    detail: p.detail,
    dllPath: p.dllPath || null,
    active: state.activeId === p.def.id,
  }));
}

export function setActive(id) {
  const p = state.providers.find((x) => x.def.id === id);
  if (!p) throw new Error(`unknown provider "${id}"`);
  if (p.status !== 'ready') throw new Error(`provider "${id}" is not ready (${p.status}: ${p.detail || ''})`);
  state.activeId = id;
  return listStatus();
}

function activeProvider() {
  const p = state.providers.find((x) => x.def.id === state.activeId && x.status === 'ready');
  if (!p) throw new Error('no ready SDK provider — install the vendor SDK or use browser/webcam capture');
  return p;
}

function ensureOpened(p) {
  const lc = p.def.lifecycle || {};
  const openName = lc.open && (lc.open.call || lc.open);
  if (!openName) return;
  if (state.opened.has(p.def.id)) return;
  const lib = state.libs.get(p.def.id);
  try {
    const fn = lib[openName];
    if (typeof fn === 'function') fn(...((lc.open && lc.open.args) || []));
    state.opened.add(p.def.id);
  } catch (err) {
    throw new Error(`SDK init "${openName}" failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// uniform capture
// ---------------------------------------------------------------------------

/**
 * Capture a credential through the active SDK provider.
 * Returns the shape the web app forwards to POST /api/enrollments/templates.
 * For providers without a scripted capture mode we return a clear
 * needs-manifest error telling the operator exactly what to drop in ./sdk.
 */
export async function capture(type, opts = {}) {
  const p = activeProvider();
  const def = p.def;
  if (!def.types.includes(type)) {
    throw new Error(`provider "${def.id}" does not capture "${type}" (supports: ${def.types.join(', ')})`);
  }
  ensureOpened(p);

  const cap = def.capture || (def.modes && def.modes.identify) || null;
  if (!cap || !cap.export || !Array.isArray(cap.argTypes)) {
    throw new Error(
      `provider "${def.id}" is loaded but its capture routine is not scripted yet. ` +
      `Add a "${def.id}.sdk.json" manifest in the ./sdk folder (see sdkManager.mjs docs) or pick another provider.`,
    );
  }

  const ffi = ensureFfi();
  const lib = state.libs.get(def.id);
  const maxBytes = def.maxBytes || 16384;
  const buf = Buffer.alloc(maxBytes);
  const lenOut = Buffer.alloc(4);

  const fixed = (cap.fixedArgs || []).slice();
  const argv = [];
  let fi = 0;
  for (let i = 0; i < cap.argTypes.length; i++) {
    const t = cap.argTypes[i];
    if (cap.out && cap.out.buf === i) { argv.push(buf); continue; }
    if (cap.out && cap.out.len === i) { argv.push(lenOut); continue; }
    if (t === 'int' || t === 'uint') argv.push(Number(fixed[fi++] ?? 0));
    else if (t === 'void*' || t === 'pointer') argv.push(buf);
    else argv.push(Number(fixed[fi++] ?? 0));
  }

  const fn = lib[cap.export];
  if (typeof fn !== 'function') throw new Error(`export "${cap.export}" not callable on ${def.id}`);
  const rc = fn(...argv);
  const ok = cap.successWhen === 'nonzero' ? Boolean(rc) : Number(rc) === 0 || Number(rc) > 0;
  if (!ok) throw new Error(`${def.id}.${cap.export} returned ${rc} (no template captured — place finger correctly and retry)`);

  const n = lenOut.readInt32LE(0);
  if (n <= 0 || n > maxBytes) throw new Error(`${def.id} reported invalid template length ${n}`);
  const template = buf.subarray(0, n);

  return {
    ok: true,
    templateBase64: template.toString('base64'),
    byteLength: n,
    algorithm: def.algorithm || (def.algorithmByType && def.algorithmByType[type]) || `${def.id}-v1`,
    quality: typeof opts.quality === 'number' ? opts.quality : null,
    source: 'local-sdk',
    provider: def.id,
  };
}

export function closeAll() {
  for (const p of state.providers) {
    const lc = p.def.lifecycle || {};
    const closeName = lc.close && (lc.close.call || lc.close);
    if (!closeName || !state.opened.has(p.def.id)) continue;
    try { const fn = state.libs.get(p.def.id)[closeName]; if (typeof fn === 'function') fn(); } catch { /* ignore */ }
  }
  state.opened.clear();
}

export function ffiAvailability() {
  try { ensureFfi(); return { available: true }; } catch (err) { return { available: false, reason: err.message }; }
}
