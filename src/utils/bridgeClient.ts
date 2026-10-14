/**
 * bridge-client.ts — browser client for the Spersia Enrollment Bridge.
 *
 * The bridge is a tiny local service (see /enrollment-bridge) that exposes
 * hardware the browser cannot reach: vendor fingerprint/iris SDK DLLs and USB
 * HID card readers. This module talks to it over plain HTTP on loopback, with
 * short timeouts so the UI degrades gracefully when the bridge isn't running:
 * every capability check returns null/false instead of throwing, letting the
 * Enrollments page fall back to webcam / file-import / keyboard-wedge capture.
 */

import { getAuthToken } from './http';

const BRIDGE_BASE_URL =
  (import.meta as any).env?.VITE_BRIDGE_URL || 'http://127.0.0.1:8485';
const BRIDGE_TOKEN = (import.meta as any).env?.VITE_BRIDGE_TOKEN || '';

export interface BridgeProvider {
  id: string;
  label: string;
  types: string[];
  status: 'ready' | 'missing_dll' | 'missing_ffi' | 'error' | 'idle';
  detail: string | null;
  dllPath: string | null;
  active: boolean;
}

export interface BridgeCapabilities {
  ok: boolean;
  name: string;
  version: string;
  platform: string;
  hostname: string;
  tokenRequired: boolean;
  serverUrl: string;
  capabilities: {
    sdk: {
      available: boolean;
      ffiAvailable: boolean;
      ffiReason: string | null;
      providers: BridgeProvider[];
      active: string | null;
      types: string[];
    };
    card: {
      hidAvailable: boolean;
      hidReason: string | null;
      readers: Array<{ path: string; product: string | null; matched: string | null }>;
      wedgeHint: boolean;
    };
    browser: { camera: boolean; fileImport: boolean; webusbOptional: boolean };
  };
}

export interface SdkCaptureResult {
  ok: boolean;
  templateBase64: string;
  byteLength: number;
  algorithm: string;
  quality: number | null;
  source: string;
  provider: string;
}

export interface CardReadResult {
  value: string;
  hex?: string;
  format: string;
  wiegand?: { facility: number; card: number; combined: string } | null;
}

export interface BridgeEnrollResult {
  ok: boolean;
  source: string;
  provider: string | null;
  upload: { message: string; id: number };
}

async function call<T>(pathName: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, headers, ...rest } = init;
  const response = await fetch(`${BRIDGE_BASE_URL}${pathName}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(BRIDGE_TOKEN && { 'x-bridge-token': BRIDGE_TOKEN }),
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`پل ثبت‌نام پاسخ نامعتبری داد (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(data?.error || `پل ثبت‌نام خطا داد (HTTP ${response.status})`);
  return data as T;
}

let cachedCaps: BridgeCapabilities | null = null;
let capsCheckedAt = 0;

/** Probe the bridge. Returns null when it is not installed/running. */
export async function pingBridge(opts: { force?: boolean } = {}): Promise<BridgeCapabilities | null> {
  const fresh = cachedCaps && Date.now() - capsCheckedAt < 15000 && !opts.force;
  if (fresh) return cachedCaps;
  try {
    const caps = await call<BridgeCapabilities>('/capabilities', { timeoutMs: 3000 });
    cachedCaps = caps;
    capsCheckedAt = Date.now();
    return caps;
  } catch {
    cachedCaps = null;
    capsCheckedAt = Date.now();
    return null;
  }
}

export function forgetBridgeCache(): void {
  cachedCaps = null;
  capsCheckedAt = 0;
}

/** Force the bridge to re-scan for vendor DLLs / manifests after dropping files. */
export async function rescanSdk(): Promise<BridgeCapabilities | null> {
  await call('/sdk/rescan', { method: 'POST', body: JSON.stringify({}) });
  return pingBridge({ force: true });
}

/** Activate one detected SDK provider by id. */
export async function setSdkProvider(id: string): Promise<BridgeProvider[]> {
  const out = await call<{ providers: BridgeProvider[] }>('/sdk/provider', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  return out.providers;
}

/** Capture a biometric template through the active vendor SDK. */
export async function sdkCapture(
  type: string,
  opts: { slot?: string | null; quality?: number | null } = {},
): Promise<SdkCaptureResult> {
  // long timeout: the user needs time to place their finger
  return call<SdkCaptureResult>('/sdk/capture', {
    method: 'POST',
    timeoutMs: 90000,
    body: JSON.stringify({ type, slot: opts.slot ?? null, quality: opts.quality ?? null }),
  });
}

/** Wait for one swipe on a USB HID card reader attached to this PC. */
export async function readCard(opts: { path?: string; timeoutMs?: number } = {}): Promise<CardReadResult> {
  return call<CardReadResult>('/card/read', {
    method: 'POST',
    timeoutMs: (opts.timeoutMs ?? 20000) + 5000,
    body: JSON.stringify(opts),
  });
}

export interface BridgeEnrollPayload {
  employeeId: number | string;
  templateType: string;
  slot?: string | null;
  value?: string | null;
  algorithm?: string | null;
  quality?: number | null;
  /** 'auto' | 'local-sdk' | 'local-card' | 'browser' */
  source?: string;
  /** pre-captured bytes (webcam/file/wedge) forwarded straight to the server */
  templateBase64?: string | null;
  deviceId?: number | string | null;
}

/**
 * One-stop enrollment: the bridge captures locally (SDK/card) or forwards a
 * browser capture, then uploads straight into POST /api/enrollments/templates
 * using the current session token — same canonical store, same cross-device
 * transfer engine, zero extra clicks in the UI.
 */
export async function enrollViaBridge(payload: BridgeEnrollPayload): Promise<BridgeEnrollResult> {
  const token = getAuthToken();
  return call<BridgeEnrollResult>('/enroll', {
    method: 'POST',
    timeoutMs: 120000,
    body: JSON.stringify({ ...payload, token: token || undefined }),
  });
}
