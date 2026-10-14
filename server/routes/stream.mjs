/**
 * GET /api/stream — Server-Sent Events feed of realtime device events.
 *
 * Mounted separately from the devices router because Express 5 does not allow
 * `next()` to fall through out of a router into an app-level handler; this way
 * `/api/devices/:id` (integer param) keeps working while `/api/stream` serves
 * the live punch feed consumed by the frontend (`useRealtimeStream`).
 *
 * Authorization: live attendance data is sensitive, so in addition to a valid
 * session the caller must hold the `devices.realtime` permission (granted via
 * the role tree — see migration 008-realtime-permission.sql). Admins bypass
 * the check like everywhere else in this codebase.
 */

import express from 'express';
import { subscribe } from '../services/realtimeBus.mjs';
import { authenticateToken } from '../services/auth.mjs';
import { getEffectivePermissionIds, findPermissionIdByName } from '../services/permissionTree.mjs';
import { Logger } from '../services/logger.mjs';

const router = express.Router();

/** True when the session user effectively holds the realtime-view permission. */
async function canViewRealtime(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permId = await findPermissionIdByName('devices.realtime');
  if (permId == null) {
    // Permission catalogue row missing (migrations not applied yet): fail
    // closed for non-admins rather than silently streaming live punches.
    return false;
  }
  const roleIds = (user.roleAssignments || []).map(a => a.roleId);
  if (roleIds.length === 0) return false;
  const effective = await getEffectivePermissionIds(roleIds);
  return effective.has(permId);
}

// Authenticated via Bearer header or ?token= query param (EventSource
// cannot set headers — see authenticateToken).
router.get('/stream', authenticateToken, async (req, res) => {
  try {
    if (!(await canViewRealtime(req.user))) {
      await Logger.log(
        'warning',
        'REALTIME_STREAM_DENIED',
        'devices',
        null,
        `User ${req.user.username} attempted to open the live stream without devices.realtime`,
        { userId: req.user.id },
        req.user.id
      );
      return res.status(403).json({ error: 'شما دسترسی به فید زنده تردد دستگاه‌ها را ندارید' });
    }
  } catch (error) {
    await Logger.logError('STREAM', 'authorize', null, 'Realtime permission check failed', error, { userId: req.user?.id });
    return res.status(500).json({ error: 'خطا در بررسی دسترسی فید زنده' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribe((event) => {
    try {
      res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // socket already gone — cleanup happens via 'close'
    }
  });

  // keep-alive pings so proxies don't close idle streams
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
