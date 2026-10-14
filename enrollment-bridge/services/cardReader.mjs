/**
 * cardReader — read RFID/NFC/HID proximity card numbers on the operator PC.
 *
 * Two paths, tried in order:
 *  1. USB HID readers via `node-hid` (Reactor/RC680, OMNIKEY 5x27, generic
 *     Wiegand-over-HID dongles). We open any matching device, send a simple
 *     "read tag UID" command set and decode common framings (raw hex,
 *     decimal, Wiegand-26/34).
 *  2. Keyboard-wedge readers (the vast majority of cheap readers emulate a
 *     keyboard). Those are handled by the WEB UI directly (the reader types
 *     into the focused field) — this service exposes `wedgeHint` so the UI
 *     knows that mode is available even without node-hid hardware.
 *
 * Like every other bridge capability: if the native dep is missing we report
 * status honestly and the browser falls back to manual/wedge entry. The card
 * NUMBER is all the canonical enrollment store needs for `card` credentials,
 * so cross-device transfer works regardless of which reader captured it.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// vendorId:productId pairs known to speak a trivially-decodable protocol
const KNOWN_READERS = [
  { vid: 0x1d57, pid: 0x0a02, name: 'HID Proximity Reactor' },       // Hua Yang / generic
  { vid: 0x1a86, pid: 0xe010, name: 'Wiegand USB Dongle' },          // common CH552 firmware
  { vid: 0x076b, pid: 0x3021, name: 'OMNIKEY 5121 CKR' },            // HID Global
  { vid: 0x04e6, pid: 0x5115, name: 'SC Reader (NFC)' },             // SCM/Identiv-ish
  { vid: 0x1c0c, pid: 0x0003, name: 'iCLASS SE LR220' },
];

let HID = null;
let hidError = null;

function ensureHid() {
  if (HID) return HID;
  if (hidError) throw new Error(hidError);
  try {
    HID = require('node-hid');
    return HID;
  } catch (err) {
    hidError =
      'node-hid is not installed (run "npm install" inside enrollment-bridge). ' +
      'Keyboard-wedge readers still work from the web page itself.';
    throw new Error(hidError);
  }
}

export function listDevices() {
  try {
    const hid = ensureHid();
    const devs = hid.devices();
    const known = devs.filter((d) => KNOWN_READERS.some((r) => r.vid === d.vendorId && r.pid === d.productId));
    // also surface anything whose product string smells like a reader
    const extra = devs.filter(
      (d) => !known.includes(d) && /hid|prox|rfid|card|reader|omnikey|reactor/i.test(`${d.product || ''} ${d.manufacturer || ''}`),
    );
    return [...known, ...extra].map((d) => ({
      path: d.path,
      vendorId: d.vendorId,
      productId: d.productId,
      product: d.product || null,
      matched: KNOWN_READERS.find((r) => r.vid === d.vendorId && r.pid === d.productId)?.name || null,
    }));
  } catch (err) {
    return { error: err.message, wedgeHint: true };
  }
}

/** Decode one raw HID report into a card number, trying common framings. */
export function decodeReport(bytes) {
  const b = Array.from(bytes).filter((x) => x !== 0);
  if (b.length < 3) return null;

  // 1) ASCII digits typed as bytes (some wedges over HID): "0012345678"
  const ascii = String.fromCharCode(...b).trim();
  if (/^\d{4,12}$/.test(ascii)) return { value: ascii, format: 'decimal' };

  // 2) leading length byte + payload (typical OSDP-lite / CH552 dongles)
  let payload = b;
  if (b[0] === b.length - 1) payload = b.slice(1);

  // 3) trailing checksum byte: keep first N where sum-of-rest % 256 == last
  if (payload.length > 4) {
    const last = payload[payload.length - 1];
    const body = payload.slice(0, -1);
    const sum = body.reduce((a, x) => (a + x) & 0xff, 0);
    if (sum === last) payload = body;
  }

  const hex = payload.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

  // 4-byte UID (MIFARE/NTAG) -> decimal card number
  if (payload.length === 4) {
    const dec = ((payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3]) >>> 0;
    return { value: String(dec), hex, format: 'uid32' };
  }
  // 3-byte UID
  if (payload.length === 3) {
    const dec = (payload[0] << 16) | (payload[1] << 8) | payload[2];
    return { value: String(dec), hex, format: 'uid24' };
  }
  // 5+ byte EM-Marine style (Wiegand-26 packed in 3 bytes) or raw serial
  if (payload.length >= 3) {
    const big = BigInt('0x' + hex);
    return { value: big.toString(10), hex, format: 'serial' };
  }
  return { value: hex, hex, format: 'hex' };
}

/** Wiegand-26 split from a packed serial (same math as the web helper). */
export function wiegand26(serial) {
  let v;
  try { v = BigInt(serial); } catch { return null; }
  if (v <= 0n || v > 0xffffffffn) return null;
  const withoutParity = Number(v >> 1n) & 0xffffff;
  const facility = (withoutParity >> 8) & 0xff;
  const card = withoutParity & 0xff;
  if (!facility && !card) return null;
  return { facility, card, combined: `${facility},${card}` };
}

/**
 * Wait up to `timeoutMs` for ONE card swipe on the given reader path.
 * Resolves with { value, hex, format } or rejects with a clear message.
 */
export async function waitForCard({ path, timeoutMs = 20000 } = {}) {
  const hid = ensureHid();
  const devices = listDevices();
  if (Array.isArray(devices) && devices.length === 0 && !path) {
    throw new Error('no USB HID card reader found — use a keyboard-wedge reader and swipe into the web form instead');
  }
  const target = path || (Array.isArray(devices) && devices[0]?.path);
  if (!target) throw new Error('multiple readers present — pass an explicit device path');

  const dev = new HID.HID(target);
  try {
    // nudge readers that need polling (best-effort; many just push reports)
    try { dev.write([0x01]); } catch { /* some devices are read-only */ }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const report = await Promise.race([
        new Promise((resolve) => setTimeout(() => resolve(null), 200)),
        new Promise((resolve) => dev.readOnce((err, bytes) => resolve(err ? null : bytes))),
      ]);
      if (!report) continue;
      const decoded = decodeReport(report);
      if (decoded) return { ...decoded, wiegand: wiegand26(decoded.value) };
    }
    throw new Error(`no card presented within ${Math.round(timeoutMs / 1000)}s`);
  } finally {
    try { dev.close(); } catch { /* ignore */ }
  }
}

export function status() {
  const ffi = (() => { try { ensureHid(); return { hidAvailable: true }; } catch (err) { return { hidAvailable: false, reason: err.message }; } })();
  return { ...ffi, wedgeHint: true, knownReaders: KNOWN_READERS.map((r) => ({ vid: r.vid, pid: r.pid, name: r.name })) };
}
