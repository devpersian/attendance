#!/usr/bin/env node
/**
 * main.js — entry point for the Spersia Enrollment Bridge.
 *
 * Runs as a normal console app (`npm start`, double-click the packaged .exe)
 * or under a Windows service wrapper (see install-service.mjs / NSSM).
 * Everything is configured through environment variables so the same build
 * works everywhere:
 *
 *   BRIDGE_PORT=8485              HTTP port (loopback only)
 *   BRIDGE_TOKEN=...              shared secret required from the web app
 *   SPERSIA_SERVER_URL=...        project API base (default http://localhost:3001/api)
 *   SDK_DIR=...                   extra folder to search for vendor DLLs + *.sdk.json
 *   BRIDGE_ALLOWED_ORIGINS=...    comma-separated https origins allowed to call us
 */
import { startBridge } from './server.mjs';

const server = startBridge();

// keep a heartbeat in the log so service monitors can see we're alive
setInterval(() => {
  if (server.listening) return;
  console.error('[bridge] lost listening socket — exiting for supervisor restart');
  process.exit(1);
}, 30000).unref?.();
