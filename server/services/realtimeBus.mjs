/**
 * realtimeBus — in-memory pub/sub hub for live device events.
 *
 * The device service / webhook route publish events here as raw punches are
 * ingested from devices; the SSE endpoint (`GET /api/devices/stream`) subscribes
 * per-client and forwards them to the UI in real time.
 */

import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(100);

let seq = 0;

/**
 * Publish a realtime event to all connected listeners.
 * @param {string} type  e.g. 'punch' | 'device-status' | 'log'
 * @param {object} payload
 */
export function publish(type, payload) {
  seq += 1;
  const event = { id: seq, type, at: new Date().toISOString(), ...payload };
  bus.emit('event', event);
  return event;
}

/**
 * Subscribe to realtime events. Returns an unsubscribe function.
 * @param {(event: object) => void} handler
 */
export function subscribe(handler) {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
