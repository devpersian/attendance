-- Migration 017: allow 'offline' as a device status (Phase 2 / P2.6).
-- The original schema constrains attendance.Devices.Status to
-- ('active','inactive','error','maintenance'); the offline sweeper needs an
-- explicit 'offline' state so the Monitor UI and alerts can distinguish
-- "not configured" (inactive) from "was running, stopped answering" (offline).
-- Safe to run repeatedly; drops only the Status CHECK constraint.

DECLARE @sql NVARCHAR(MAX);

SELECT @sql = 'ALTER TABLE [attendance].[Devices] DROP CONSTRAINT [' + c.name + ']'
FROM sys.check_constraints c
JOIN sys.columns col ON col.object_id = c.parent_object_id AND col.column_id = c.parent_column_id
WHERE c.parent_object_id = OBJECT_ID(N'[attendance].[Devices]')
  AND col.name = 'Status';

IF @sql IS NOT NULL EXEC(@sql);
GO

UPDATE [attendance].[Devices] SET [Status] = 'active' WHERE [Status] NOT IN ('active','inactive','error','maintenance','offline');
GO

ALTER TABLE [attendance].[Devices] ADD CONSTRAINT [CK_Attendance_Devices_Status]
    CHECK ([Status] IN ('active', 'inactive', 'error', 'maintenance', 'offline'));
GO
