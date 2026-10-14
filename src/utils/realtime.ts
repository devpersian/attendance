/**
 * useRealtimeStream — subscribes to the server's SSE feed (`GET /api/stream`)
 * of live device events (punches, device status changes) with automatic
 * reconnect/backoff. Pass an `onEvent` callback; keep it stable (useCallback)
 * or wrap state updates in functional setState.
 */

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from './http';

export interface RealtimeEvent {
  id?: number;
  type: 'connected' | 'punch' | 'device-event' | string;
  at: string;
  deviceId?: number;
  deviceUserId?: string;
  logId?: number;
  timestamp?: string;
  eventType?: string;
  verificationMethod?: string | null;
  message?: string;
}

interface UseRealtimeStreamOptions {
  /** false pauses the connection (e.g. when the user has no devices page open). */
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export function useRealtimeStream({ enabled = true, onEvent }: UseRealtimeStreamOptions = {}) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let disposed = false;

    // API_BASE_URL ends with '/api'; strip it and attach the token via query
    // (EventSource cannot send Authorization headers; the server accepts ?token=).
    const base = API_BASE_URL.replace(/\/api\/?$/, '');
    const token = localStorage.getItem('auth_token');

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${base}/api/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`);

      source.onopen = () => {
        setConnected(true);
        backoff = 1000;
      };

      source.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          handlerRef.current?.(event);
        } catch {
          /* ignore malformed frames */
        }
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!disposed) {
          retryTimer = setTimeout(connect, Math.min(backoff, 30_000));
          backoff *= 2;
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
