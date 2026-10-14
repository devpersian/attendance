// Phase 1 / P1.6 — security audit trail writer (attendance.AuditLog, migration 014).
// BEST-EFFORT by design: an audit-write failure is logged to the request logger
// but must never break or leak into the request it describes.

import { execute } from '../db.mjs';
import { Logger } from './logger.mjs';

export async function writeAudit({ actorUserId = null, action, entity, entityId = null, detail = null, req = null }) {
  try {
    await execute(
      `INSERT INTO attendance.AuditLog (ActorUserId, Action, Entity, EntityId, Detail, IpAddress, CreatedAt)
       VALUES (@actorUserId, @action, @entity, @entityId, @detail, @ip, GETDATE())`,
      {
        actorUserId,
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        detail: detail == null ? null : JSON.stringify(detail),
        ip: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      },
    );
  } catch (error) {
    try {
      await Logger.logError('AUDIT', action || 'audit', actorUserId, 'Audit write failed', error);
    } catch {
      // logging is also best-effort here
    }
  }
}

export default { writeAudit };
