/**
 * Browser-side enrollment capture helpers for the generic user-enrollment UI.
 *
 * Everything here is device-independent: we capture raw material in the
 * browser (webcam frame, uploaded template file, card swipe, typed PIN),
 * produce a base64 payload + friendly preview, and hand it to the canonical
 * enrollment store (`POST /api/enrollments/templates`). The server then
 * converts the canonical copy into per-protocol wire payloads so the same
 * enrollment can be transferred between ANY device in the catalog.
 *
 * NOTE on biometrics: browsers are not trusted sensor hosts — they cannot run
 * vendor fingerprint/iris SDKs. For face we capture a full-resolution JPEG
 * frame from the webcam (raw image bytes travel as TemplateData; devices that
 * accept images, e.g. Hikvision ISAPI FACE blocks or ZK face terminals, will
 * use them directly). For fingerprints we support importing `.dat/.tpl` files
 * exported from any enrollment terminal, plus a synthetic low-quality test
 * template used only by dry-run transfers. Card/PIN credentials are plain
 * values and need no binary data at all.
 */

export type CaptureKind = 'camera' | 'file' | 'value';

export interface CaptureResult {
  /** base64 (no data-url prefix) — sent as `templateBase64`. */
  base64: string;
  /** byte length of the decoded payload. */
  byteLength: number;
  /** original file name when captured from an upload. */
  fileName?: string;
  /** data-url preview (image thumbnails) — never persisted server-side. */
  previewUrl?: string;
  /** algorithm hint derived from the source, e.g. 'jpeg-image', 'zk-fp-file'. */
  algorithmHint?: string;
}

const MAX_CAPTURE_BYTES = 512 * 1024; // keep in sync with server MAX_TEMPLATE_BYTES

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function stripDataUrl(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, '');
}

// ---------------------------------------------------------------------------
// file import (.dat / .tpl / .bin / image exports from enrollment terminals)
// ---------------------------------------------------------------------------

export async function captureFromFile(file: File): Promise<CaptureResult> {
  const buf = await file.arrayBuffer();
  if (buf.byteLength === 0) throw new Error(`File "${file.name}" is empty`);
  if (buf.byteLength > MAX_CAPTURE_BYTES) {
    throw new Error(`File "${file.name}" is too large (${Math.round(buf.byteLength / 1024)} KB, max ${MAX_CAPTURE_BYTES / 1024} KB)`);
  }
  const bytes = new Uint8Array(buf);
  const isImage = /^image\//.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  return {
    base64: bytesToBase64(bytes),
    byteLength: buf.byteLength,
    fileName: file.name,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    algorithmHint: isImage ? 'image-import' : 'vendor-template-file',
  };
}

// ---------------------------------------------------------------------------
// webcam capture (face / palm / iris photos taken right in the browser)
// ---------------------------------------------------------------------------

export interface CameraShotOptions {
  /** mirror the image horizontally (selfie cameras are mirrored in preview) */
  mirror?: boolean;
  maxWidth?: number;
  quality?: number;
}

/** Draw the current video frame onto a canvas and return JPEG bytes. */
export function captureFromVideo(video: HTMLVideoElement, opts: CameraShotOptions = {}): CaptureResult {
  const { mirror = true, maxWidth = 640, quality = 0.9 } = opts;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, maxWidth / vw);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported in this browser');
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = stripDataUrl(dataUrl);
  return {
    base64,
    byteLength: base64ByteLength(base64),
    previewUrl: dataUrl,
    algorithmHint: 'jpeg-image',
  };
}

/**
 * Open a camera stream into `video`. Returns a stop() function that always
 * releases the tracks, even if the promise rejected mid-flight.
 */
export async function attachCameraStream(video: HTMLVideoElement): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('دوربین در این مرورگر پشتیبانی نمی‌شود (نیاز به HTTPS یا localhost)');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err: any) {
    const msg = err?.name === 'NotAllowedError'
      ? 'دسترسی به دوربین رد شد. لطفاً اجازه استفاده از دوربین را در مرورگر فعال کنید.'
      : err?.name === 'NotFoundError'
        ? 'هیچ دوربینی به این دستگاه متصل نیست.'
        : `خطا در باز کردن دوربین: ${err?.message || err}`;
    throw new Error(msg);
  }
  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // autoplay policy: caller can render a "click to start" fallback
  }
  return stop;
}

// ---------------------------------------------------------------------------
// card / password captures (plain values — no binary payload needed)
// ---------------------------------------------------------------------------

/** Read a card number from an USB HID card reader acting as keyboard wedge. */
export function normalizeCardNumber(raw: string): string {
  return String(raw || '').replace(/[^0-9A-Fa-fxX-]/g, '').toUpperCase();
}

/** Wiegand 26-bit decode: facility (26 bits minus last 8) + card number. */
export function decodeWiegand26(hexOrDecimal: string): { facility: number; card: number } | null {
  const s = String(hexOrDecimal || '').trim();
  if (!s) return null;
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(s)) value = parseInt(s.slice(2), 16);
  else if (/^[0-9]+$/.test(s)) value = parseInt(s, 10);
  else if (/^[0-9a-f]+$/i.test(s)) value = parseInt(s, 16);
  else return null;
  const withoutParity = value >>> 1; // drop trailing parity bit
  const facility = (withoutParity >> 8) & 0xff;
  const card = withoutParity & 0xff;
  if (facility === 0 && card === 0) return null;
  return { facility, card };
}

export function formatPin(pin: string): string {
  return String(pin || '').replace(/\D/g, '').slice(0, 10);
}

// ---------------------------------------------------------------------------
// demo/test payload — clearly marked, for dry-run transfer testing only
// ---------------------------------------------------------------------------

export function buildTestTemplate(seed: string): CaptureResult {
  const stamp = Date.now();
  const text = `SPERSIA-TEST-TEMPLATE v1 seed=${seed} ts=${stamp}`;
  const bytes = new TextEncoder().encode(text.padEnd(512, '.'));
  return {
    base64: bytesToBase64(bytes),
    byteLength: bytes.length,
    algorithmHint: 'test-dryrun',
  };
}
