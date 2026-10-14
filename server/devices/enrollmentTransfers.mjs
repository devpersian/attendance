/**
 * Generic enrollment transfer adapters.
 *
 * Enrollments are stored canonically (see database/migrations/005-user-enrollments.sql):
 *   - TemplateData  : raw bytes exactly as captured from the source device/browser
 *   - CanonicalData : normalized JSON envelope describing the credential
 *
 * This module converts between the canonical envelope and per-protocol wire
 * payloads so an enrollment captured once can be pushed to ANY device type in
 * the catalog, and pulled back from devices into the canonical store.
 *
 * Adding support for a new protocol = register one adapter here; nothing else
 * in the stack changes.
 */
import { getDriver } from './driverRegistry.mjs';
import { findDeviceModel } from './deviceCatalog.mjs';
import { DriverError } from './base.mjs';

/** Credential kinds handled by the generic enrollment engine. */
export const TEMPLATE_TYPES = ['fingerprint', 'face', 'irisscan', 'palmvein', 'card', 'password'];

/** Fingers / slots used by browser capture & multi-slot devices. */
export const FINGER_SLOTS = [
  'right_thumb', 'right_index', 'right_middle', 'right_ring', 'right_little',
  'left_thumb', 'left_index', 'left_middle', 'left_ring', 'left_little',
];

export const SLOT_LABELS_FA = {
  right_thumb: 'انگشت شست راست', right_index: 'سبابه راست', right_middle: 'میانی راست',
  right_ring: 'حلقه راست', right_little: 'کفچین راست',
  left_thumb: 'انگشت شست چپ', left_index: 'سبابه چپ', left_middle: 'میانی چپ',
  left_ring: 'حلقه چپ', left_little: 'کفچین چپ',
};

/** Map our templateType -> ZK BioEnroll algorithm ids (used on the wire). */
const ZK_ALG_BY_TYPE = {
  fingerprint: 2,      // FP_ALG_BASE (ZK standard finger)
  face: 9,             // FACE_ALG_ZKFACEV10
  irisscan: 13,        // IRIS_ALG_VER1_2
  palmvein: 14,        // PALMVEIN_ALG_VER1_0
  card: 0,
  password: 0,
};

// ---------------------------------------------------------------------------
// Canonical envelope helpers
// ---------------------------------------------------------------------------

/**
 * Build the portable JSON envelope shared by every adapter.
 * @returns Buffer UTF-8 JSON bytes (stored in EnrollmentTemplates.CanonicalData)
 */
export function buildCanonical({ templateType, slot = null, value = null, algorithm = null, quality = null, rawBytes = null, source = 'browser', meta = {} }) {
  const envelope = {
    format: 'spersia.enrollment/v1',
    templateType,
    slot,
    value,
    algorithm,
    quality,
    source,            // 'browser' | 'device-pull' | 'import' | 'transfer'
    capturedAt: new Date().toISOString(),
    rawHex: rawBytes ? Buffer.from(rawBytes).toString('hex') : null,
    rawLength: rawBytes ? Buffer.from(rawBytes).length : 0,
    meta,
  };
  return Buffer.from(JSON.stringify(envelope), 'utf-8');
}

/** Parse a canonical envelope buffer back into an object (null if not parseable). */
export function parseCanonical(buf) {
  if (!buf) return null;
  try {
    const obj = JSON.parse(Buffer.from(buf).toString('utf-8'));
    return obj && obj.format === 'spersia.enrollment/v1' ? obj : null;
  } catch {
    return null;
  }
}

/** Raw bytes of a template: prefer TemplateData column, fall back to envelope rawHex. */
export function rawTemplateBytes(template) {
  if (template.TemplateData && template.TemplateData.length > 0) {
    return Buffer.from(template.TemplateData);
  }
  const env = parseCanonical(template.CanonicalData);
  if (env?.rawHex) return Buffer.from(env.rawHex, 'hex');
  return null;
}

/** Stable hash of the template payload — used to detect stale copies on devices. */
import { createHash } from 'crypto';
export function templateHash(template) {
  const bytes = rawTemplateBytes(template) || Buffer.from(JSON.stringify({ v: template.Value ?? null, s: template.Slot ?? null }), 'utf-8');
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Protocol adapters
//
// Each adapter implements:
//   supports(templateType)                 -> boolean
//   encodePush(template, ctx)              -> vendor payload the device accepts
//   decodePull(vendorPayload, ctx)         -> canonical fields we can store
//   push?(device, config, template, ctx)   -> actual wire call (when driver exists)
//   pull?(device, config, userId, ctx)     -> fetch existing templates off a device
// ---------------------------------------------------------------------------

/**
 * ZK-family protocol (ZKTeco, eSSL/CrossChex, Virdi AC series which speaks ZK,
 * IDTECO, Mythlink...). Wire format: ZK BioEnroll-style command record:
 *   [algId:u8][format:u8][size:u16LE][slotCode:u16LE][data...]
 * Slot codes follow ZK convention: bit0 = left hand, bits1..4 = finger index
 * (thumb=1 ... little=5), bit7 set => plain password/PIN slot.
 */
function zkSlotCode(slot, templateType) {
  if (templateType === 'password') return 0x80;
  if (templateType === 'card') return 0;
  const order = ['thumb', 'index', 'middle', 'ring', 'little'];
  const m = String(slot || '').match(/^(left|right)_(\w+)$/);
  if (!m) return 1; // default: right thumb
  const fi = order.indexOf(m[2]) + 1;
  return (fi << 1) | (m[1] === 'left' ? 1 : 0);
}

const zkAdapter = {
  protocol: 'zk',
  label: 'ZK BioEnroll (ZKTeco / eSSL / CrossChex / Virdi)',
  supports: (t) => t !== 'card',
  encodePush(template) {
    const data = rawTemplateBytes(template);
    if (!data && template.TemplateType !== 'password' && template.TemplateType !== 'card') {
      throw new DriverError('Raw template bytes missing for ZK push', 'ENODATA');
    }
    const alg = ZK_ALG_BY_TYPE[template.TemplateType] ?? 2;
    const buf = Buffer.alloc(6 + (data ? data.length : 0));
    buf.writeUInt8(alg, 0);
    buf.writeUInt8(0 /* FORMAT_NORMAL */, 1);
    buf.writeUInt16LE(data ? data.length : 0, 2);
    buf.writeUInt16LE(zkSlotCode(template.Slot, template.TemplateType), 4);
    if (data) data.copy(buf, 6);
    return { wire: 'zk-bioenroll', payload: buf.toString('base64'), length: buf.length };
  },
  decodePull(payload) {
    // payload: base64 of the same record layout produced by a device dump
    const buf = Buffer.from(String(payload), 'base64');
    if (buf.length < 6) throw new DriverError('Truncated ZK template record', 'ETRUNC');
    const alg = buf.readUInt8(0);
    const size = buf.readUInt16LE(2);
    const slotCode = buf.readUInt16LE(4);
    const data = buf.subarray(6, Math.min(6 + size, buf.length));
    const typeByAlg = Object.keys(ZK_ALG_BY_TYPE).find((k) => ZK_ALG_BY_TYPE[k] === alg) || 'fingerprint';
    let slot = null;
    if (typeByAlg === 'fingerprint') {
      const isLeft = (slotCode & 1) === 1;
      const fi = slotCode >> 1;
      const names = ['', 'thumb', 'index', 'middle', 'ring', 'little'];
      slot = `${isLeft ? 'left' : 'right'}_${names[Math.min(fi, 5)] || 'index'}`;
    }
    return { templateType: typeByAlg, slot, algorithm: `zk-alg-${alg}`, rawBytes: Buffer.from(data) };
  },
  async push(device, config, template) {
    const driver = getDriver('zk');
    if (!driver?.pushTemplate) throw new DriverError('ZK driver does not implement template push yet', 'ENOSUPPORT');
    return driver.pushTemplate(device, config, zkAdapter.encodePush(template), template);
  },
  async pull(device, config, userId) {
    const driver = getDriver('zk');
    if (!driver?.pullTemplates) throw new DriverError('ZK driver does not implement template pull yet', 'ENOSUPPORT');
    const items = await driver.pullTemplates(device, config, userId);
    return items.map((it) => ({ ...zkAdapter.decodePull(it.payload), userId: it.userId }));
  },
};

/**
 * ISAPI (Hikvision/DigitalFinger HTTP digest API): templates travel as JSON
 * with base64 FIR/FACE blocks — natively portable across ISAPI devices.
 */
const isapiAdapter = {
  protocol: 'isapi',
  label: 'Hikvision ISAPI (FPVtech / Dahua / Hik)',
  supports: (t) => ['fingerprint', 'face', 'card', 'password'].includes(t),
  encodePush(template) {
    const data = rawTemplateBytes(template);
    const FDType = template.TemplateType === 'face' ? 'FACE' : 'FIR';
    return {
      wire: 'isapiUserInfo',
      payload: JSON.stringify({
        UserInfo: {
          employeeNumber: String(template.DeviceUserId ?? ''),
          userType: 'normal',
          ...(template.TemplateType === 'card' ? { cardNo: template.Value, cardReaderSerialNumber: '' } : {}),
          ...(template.TemplateType === 'password' ? { password: String(template.Value ?? '') } : {}),
          ...(data ? {
            biometricType: FDType,
            FDLib: [{ major: template.TemplateType === 'face' ? 2 : 1, minor: 1 }],
            FDID: 0,
            FIR: template.TemplateType === 'fingerprint' ? [{ name: 'fir1', content: data.toString('base64'), kind: 'Normal', index: 0 }] : undefined,
            FACE: template.TemplateType === 'face' ? [{ name: 'face1', content: data.toString('base64'), kind: 'VisibleLight', index: 0 }] : undefined,
          } : {}),
        },
      }),
    };
  },
  decodePull(payload) {
    const json = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const fir = json?.FIR?.[0]?.content || json?.FACE?.[0]?.content;
    const type = json?.FACE ? 'face' : 'fingerprint';
    return { templateType: type, slot: type === 'fingerprint' ? (json.FIR[0]?.name || 'right_index') : null, algorithm: 'isapi-fdlib', rawBytes: fir ? Buffer.from(fir, 'base64') : null };
  },
  async push(device, config, template) {
    const driver = getDriver('isapi');
    if (!driver?.pushTemplate) throw new DriverError('ISAPI driver does not implement template push yet', 'ENOSUPPORT');
    return driver.pushTemplate(device, config, isapiAdapter.encodePush(template), template);
  },
};

/** Suprema Biostar2 — templates move as base64 blobs inside the BioStar REST API. */
const biostar2Adapter = {
  protocol: 'biostar2',
  label: 'Suprema Biostar2 REST',
  supports: (t) => ['fingerprint', 'face', 'card'].includes(t),
  encodePush(template) {
    const data = rawTemplateBytes(template);
    return {
      wire: 'biostar2-template',
      payload: JSON.stringify({
        template_type: template.TemplateType === 'face' ? 'face_v2' : template.TemplateType === 'card' ? 'card' : 'finger_v3',
        template_data: data ? data.toString('base64') : null,
        finger_position: template.Slot ? FINGER_SLOTS.indexOf(template.Slot) : undefined,
      }),
    };
  },
  async push(device, config, template) {
    const driver = getDriver('suprema');
    if (!driver?.pushTemplate) throw new DriverError('Biostar2 driver does not implement template push yet', 'ENOSUPPORT');
    return driver.pushTemplate(device, config, biostar2Adapter.encodePush(template), template);
  },
};

/** KTE Connect cloud gateway — pushes go through the vendor cloud REST API. */
const kteAdapter = {
  protocol: 'kte-connect',
  label: 'ZKTeco KTE Connect Cloud',
  supports: (t) => ['fingerprint', 'face', 'card', 'password'].includes(t),
  encodePush(template) {
    const data = rawTemplateBytes(template);
    return {
      wire: 'kte-user-template',
      payload: JSON.stringify({
        user_id: String(template.DeviceUserId ?? ''),
        credential_type: template.TemplateType,
        credential_value: template.Value ?? null,
        template: data ? data.toString('base64') : null,
      }),
    };
  },
  async push(device, config, template) {
    const driver = getDriver('kte-connect');
    if (!driver?.pushTemplate) throw new DriverError('KTE Connect driver does not implement template push yet', 'ENOSUPPORT');
    return driver.pushTemplate(device, config, kteAdapter.encodePush(template), template);
  },
};

/**
 * Card / password credentials over classic ZK CSV user-table format
 * ("PIN,ID,Card,Pri,Pwd,...") — supported by virtually every pull-protocol device.
 */
const csvUserTableAdapter = {
  protocol: 'csv-usertable',
  label: 'CSV User Table (generic pull devices)',
  supports: (t) => t === 'card' || t === 'password',
  encodePush(template) {
    const row = [
      String(template.DeviceUserId ?? ''),
      String(template.Id ?? ''),
      template.TemplateType === 'card' ? String(template.Value ?? '') : '0',
      'user',                                   // priority
      template.TemplateType === 'password' ? String(template.Value ?? '') : '',
    ].join(',');
    return { wire: 'zk-csv', payload: row };
  },
};

const ADAPTERS = [zkAdapter, isapiAdapter, biostar2Adapter, kteAdapter, csvUserTableAdapter];

/** Protocol keys mapped onto adapters (drivers registered in driverRegistry). */
const PROTOCOL_ADAPTER_MAP = {
  zk: zkAdapter, 'zk-pull': zkAdapter, crosschex: zkAdapter, 'essl-pull': zkAdapter,
  virdi: zkAdapter, virdicore: zkAdapter,
  isapi: isapiAdapter, websockets: isapiAdapter, fpvtech: isapiAdapter,
  suprema: biostar2Adapter, biostar2: biostar2Adapter,
  'kte-connect': kteAdapter,
  trustone: csvUserTableAdapter, tosan: csvUserTableAdapter, controlianz: csvUserTableAdapter,
  dws: csvUserTableAdapter, telnet: csvUserTableAdapter,
};

// ---------------------------------------------------------------------------
// Per-model credential capabilities
//
// The protocol adapter decides HOW a credential travels on the wire; the
// device model catalog decides WHICH credentials the hardware can actually
// hold (biometrics array + card support). Combining both lets the UI offer
// only enrollment kinds that will work end-to-end for the picked device —
// e.g. CMITech iris terminals accept irisscan/face/card but never
// fingerprint/palmvein, so those options are hidden instead of failing later.
// ---------------------------------------------------------------------------

const BIOMETRIC_TO_TEMPLATE_TYPE = { fingerprint: 'fingerprint', face: 'face', iris: 'irisscan', palm: 'palmvein' };

/**
 * Template types a specific device can enroll / store.
 * @param {{protocol?:string, modelId?:string|null}} device
 * @returns {string[]|null} null => unknown, allow everything the adapter supports
 */
export function deviceTemplateCapabilities(device) {
  const model = device?.modelId ? findDeviceModel(device.modelId) : null;
  if (!model) return null;
  const set = new Set();
  for (const b of model.biometrics || []) {
    const t = BIOMETRIC_TO_TEMPLATE_TYPE[String(b).toLowerCase()];
    if (t) set.add(t);
  }
  // cards: explicit biometric entry or any non-SDK-only terminal protocol
  const protocols = (model.protocols || []).map((p) => String(p).toLowerCase());
  if ((model.biometrics || []).includes('card') || protocols.includes('http-push') || !model.sdkOnly) {
    set.add('card');
  }
  set.add('password'); // PIN is supported by every terminal we integrate with
  return TEMPLATE_TYPES.filter((t) => set.has(t));
}

/** True when this device (protocol + catalog model) can carry the credential. */
export function deviceSupportsTemplateType(device, templateType) {
  const caps = deviceTemplateCapabilities(device);
  if (caps && !caps.includes(templateType)) return false;
  const adapter = adapterForProtocol(device?.protocol, templateType);
  return Boolean(adapter);
}

/** Pick the best adapter for a device given its protocol and the template type. */
export function adapterForProtocol(protocol, templateType) {
  const direct = PROTOCOL_ADAPTER_MAP[String(protocol || '').toLowerCase()];
  if (direct && (!templateType || direct.supports(templateType))) return direct;
  // fall back: non-biometrics via CSV user table, biometrics via ZK family
  const fallback = templateType && ['card', 'password'].includes(templateType) ? csvUserTableAdapter : zkAdapter;
  return fallback.supports(templateType || 'fingerprint') ? fallback : null;
}

export function listAdapters() {
  return ADAPTERS.map((a) => ({
    protocol: a.protocol,
    label: a.label,
    supports: TEMPLATE_TYPES.filter((t) => a.supports(t)),
    canPush: typeof a.push === 'function',
    canPull: typeof a.pull === 'function',
  }));
}

/**
 * Transfer one template onto one device. Returns a step result object;
 * never throws — failures come back as { status:'failed', message }.
 */
export async function transferTemplateToDevice(device, config, template, { dryRun = false } = {}) {
  const adapter = adapterForProtocol(config.protocol || device.Protocol, template.TemplateType);
  if (!adapter) {
    return { deviceId: device.Id, templateId: template.Id, status: 'failed', message: `No enrollment adapter for protocol "${device.Protocol}" / type "${template.TemplateType}"` };
  }
  let encoded;
  try {
    encoded = adapter.encodePush({ ...template, DeviceUserId: config.deviceUserId });
  } catch (err) {
    return { deviceId: device.Id, templateId: template.Id, status: 'failed', message: `Encode failed (${adapter.protocol}): ${err.message}` };
  }
  if (dryRun || typeof adapter.push !== 'function') {
    return {
      deviceId: device.Id, templateId: template.Id,
      status: dryRun ? 'skipped' : 'pending',
      adapter: adapter.protocol,
      message: dryRun ? 'dry-run: payload built successfully' : `payload ready for "${adapter.label}" (wire push pending driver support)`,
      payloadPreview: typeof encoded.payload === 'string' ? encoded.payload.slice(0, 64) : null,
      payloadLength: encoded.payload ? Buffer.byteLength(encoded.payload) : 0,
    };
  }
  try {
    await adapter.push(device, config, template);
    return { deviceId: device.Id, templateId: template.Id, status: 'success', adapter: adapter.protocol, message: `pushed via ${adapter.label}` };
  } catch (err) {
    return { deviceId: device.Id, templateId: template.Id, status: 'failed', adapter: adapter.protocol, message: err.message };
  }
}
